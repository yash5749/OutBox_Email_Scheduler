# ReachInbox Failure Modes Analysis

This document catalogs identified failure modes, their detection, mitigation strategies, and recovery procedures.

## Classification

| Severity | Description |
|----------|-------------|
| **P0** | Data loss, duplicate emails sent, security breach |
| **P1** | Email delivery significantly delayed, queue processing stalled |
| **P2** | Degraded UX (search unavailable, dashboard slow), non-critical alerts fail |

---

## 1. Infrastructure Failures

### 1.1 PostgreSQL Unavailable
**Severity**: P0
**Detection**: Health check `/health/ready` fails; API requests return 503
**Impact**: All writes blocked; reads may serve stale data if connection pool exhausted
**Mitigation**:
- Connection pool with retry logic (Prisma default)
- API returns 503 with `Retry-After` header
- Worker pauses job processing (jobs remain in Redis delayed/active)
**Recovery**: Auto-reconnect on PG recovery; pending outbox events processed normally

### 1.2 Redis Unavailable
**Severity**: P0 (scheduling), P1 (delivery)
**Detection**: BullMQ connection events; health check fails
**Impact**:
- **Scheduling**: API still accepts emails (DB transaction commits), outbox events queued in PG
- **Delivery**: Worker cannot fetch jobs; active jobs may stall
**Mitigation**:
- Outbox publisher: bounded exponential backoff (max 30s), logs each retry
- Worker: pauses gracefully, keeps Redis client reconnecting
- Redis configured with AOF (`--appendonly yes`) + `maxmemory-policy noeviction`
**Recovery**: On reconnect, outbox publisher scans pending events; worker resumes processing

### 1.3 Elasticsearch Unavailable
**Severity**: P2
**Detection**: Indexing worker logs errors; search API returns 503
**Impact**: Search unavailable; **SMTP delivery unaffected**
**Mitigation**:
- Indexing via durable outbox events (separate from email delivery)
- Failed index events remain in PG with retry count/backoff
- Search API degrades gracefully (returns empty with warning header)
**Recovery**: Indexing worker retries; manual backfill via `pnpm run es:reindex`

### 1.4 Ethereal SMTP Unavailable
**Severity**: P1
**Detection**: Nodemailer connection errors; worker job failures
**Impact**: Emails stuck in `SENDING` or retry loop
**Mitigation**:
- Configurable retry attempts (`EMAIL_JOB_ATTEMPTS=5`) with exponential backoff
- Transient errors (network, 4xx) retry; permanent errors (5xx recipient) fail fast
- Job moves to `FAILED` after exhausting retries
**Recovery**: Manual retry via dashboard or reconciler; Ethereal is test-only

---

## 2. Queue & Scheduling Failures

### 2.1 Delayed Job Executes Early
**Severity**: P1
**Cause**: Clock skew, BullMQ timer imprecision, worker timezone mismatch
**Detection**: `sentAt` significantly before `scheduledAt` in logs/metrics
**Mitigation**:
- All timestamps UTC; worker calculates delay as `max(0, scheduledAt - Date.now())`
- Worker re-checks `scheduledAt` before sending; re-delays if early
- Document: "delayed job eligibility ≠ exact send time"

### 2.2 Delayed Job Never Executes (Lost)
**Severity**: P0
**Cause**: Redis data loss, job removed by retention, publisher crash after `queue.add()` but before DB mark
**Detection**: Reconciler scan finds `SCHEDULED` emails with no corresponding job
**Mitigation**:
- Deterministic `jobId = email-${emailId}` prevents duplicate publishes
- Outbox event marked `publishedAt` **only after** `queue.add()` resolves
- Reconciler: periodic scan (or on startup) for `SCHEDULED` emails past due with no job
**Recovery**: Reconciler recreates missing jobs; skips `SENT`/`CANCELLED`

### 2.3 Job Executes Twice (Duplicate Send)
**Severity**: P0
**Cause**: Worker crashes after SMTP accept but before DB update; stalled job re-processed; publisher double-publish
**Detection**: Multiple `SENT` records for same `idempotencyKey`; Ethereal shows duplicate
**Mitigation**:
- **Layer 1**: Unique `idempotencyKey` on `ScheduledEmail` (DB constraint)
- **Layer 2**: Deterministic `jobId` — BullMQ deduplicates on add
- **Layer 3**: Worker fetches email by ID; **skips if status `SENT`/`CANCELLED`**
- **Layer 4**: Atomic status transition `SCHEDULED` → `SENDING` (lease) → `SENT`
- **Layer 5**: Stable `Message-ID` header for provider-side deduplication (best effort)
**Limitation**: If SMTP accepts (250 OK) and worker crashes before Layer 4 completes, a retry *may* send again. This is inherent to SMTP without provider idempotency keys.

### 2.4 Rate Limit Violated Across Workers
**Severity**: P0
**Cause**: Non-atomic rate check (read-then-write in JS)
**Detection**: Actual sends/hour > `MAX_EMAILS_PER_HOUR_PER_SENDER` in metrics
**Mitigation**: **Atomic Lua script** for slot reservation:
- Single `EVAL` call reserves slot + increments hour counter + updates next-slot
- Keys: `email-rate:{senderId}:{utcHourEpoch}`, `email-rate:{senderId}:next-slot`
- TTL on hour keys auto-expires
- Tested with concurrent workers

---

## 3. Application Logic Failures

### 3.1 CSV Import Partial Acceptance
**Severity**: P1
**Cause**: Large CSV; transaction timeout; validation error mid-stream
**Detection**: User sees fewer emails scheduled than expected
**Mitigation**:
- Backend re-validates **every** address (frontend preview not trusted)
- Single transaction per batch (configurable batch size, default 500)
- Response includes: `accepted`, `invalid`, `duplicate` counts with row details
- Large imports: async job with status polling (future enhancement)

### 3.2 Slack Notification Failure Blocks Email
**Severity**: P1 (if coupled)
**Cause**: Slack API timeout/error in same code path as rate-limit handling
**Detection**: Worker logs Slack error; email job fails/retries unnecessarily
**Mitigation**:
- **Decoupled**: Slack alert via separate outbox event / indexing worker
- Email job **never** throws on Slack failure
- Alert event retries independently with own backoff
- Idempotent alert key: `slack-alert:{senderId}:{utcHourEpoch}:rate-limit`

### 3.3 OAuth State Mismatch / CSRF
**Severity**: P0 (security)
**Cause**: Missing/incorrect `state` validation in Google/Slack callbacks
**Detection**: Auth audit logs; unexpected account linking
**Mitigation**:
- Cryptographically random `state` per auth request
- `state` bound to user session + short expiry (10 min)
- Validated on callback; mismatched = reject + log

### 3.4 Token Encryption Key Rotation
**Severity**: P1 (operational)
**Cause**: `TOKEN_ENCRYPTION_KEY` compromised or rotated
**Detection**: Decryption failures on Slack/SMTP credential reads
**Mitigation**:
- Key versioning in ciphertext prefix (e.g., `v1:{ciphertext}`)
- Rotation: re-encrypt all records with new key (background job)
- Old key retained for decryption during transition

---

## 4. Data Integrity Failures

### 4.1 Idempotency Key Collision
**Severity**: P0
**Cause**: Weak key generation (timestamp only); malicious duplicate
**Detection**: DB unique constraint violation on `ScheduledEmail.idempotencyKey`
**Mitigation**:
- Key format: `${userId}:${campaignId}:${recipient}:${contentHash}`
- Or: client-provided `Idempotency-Key` header (validated unique per user)
- DB constraint enforces uniqueness

### 4.2 Search Index Staleness
**Severity**: P2
**Cause**: Indexing worker lag; ES outage; version conflict on concurrent updates
**Detection**: Dashboard shows `SENT` but search returns `SCHEDULED`
**Mitigation**:
- Index document includes `updatedAt` / version; upsert uses `version_type=external`
- Indexing worker fetches latest DB record before indexing
- Reconciler includes ES backfill for mismatched records

### 4.3 Sender Credential Leakage
**Severity**: P0 (security)
**Cause**: Logging transport config; API response includes sender row with password
**Detection**: Secret scanning; audit logs
**Mitigation**:
- Prisma `select` excludes `smtpPassword`/`encryptedToken` in all queries
- Separate `SenderWithSecrets` type for worker-only internal use
- Structured logger redacts fields matching `password|token|secret|key`

---

## 5. Operational Failures

### 5.1 Graceful Shutdown Incomplete
**Severity**: P1
**Cause**: SIGTERM timeout; BullMQ worker force-closed; Redis connection dropped mid-job
**Detection**: Jobs stuck in `active` state; `stalled` count increases
**Mitigation**:
- Worker: `worker.close()` waits for active jobs (configurable timeout)
- BullMQ `lockDuration` > max expected SMTP time (default 30s, set to 120s)
- Stalled job recovery: BullMQ moves stalled jobs back to `wait` after `lockDuration`
- PostgreSQL `processingLeaseUntil` on `ScheduledEmail` for external visibility

### 5.2 Database and Queue State Diverge
**Severity**: P1
**Cause**: Redis data loss, a worker process crash, or a retained terminal BullMQ job whose email row is still `SCHEDULED`
**Detection**: `SCHEDULED` rows have completed/failed/unknown jobs, or are due while absent from active queue states
**Mitigation**:
- Worker runs a PostgreSQL-to-BullMQ reconciliation scan at startup and every 30 seconds
- It keeps waiting/delayed/active jobs and replaces completed/failed/unknown jobs for rows still `SCHEDULED`
- It skips `SENT` and `CANCELLED` rows
- It recovers expired `SENDING` leases to `SCHEDULED`; review `WORKER_LEASE_EXPIRED` rows because SMTP may have accepted a message just before the worker crashed
- Manual scan: `pnpm --filter @reachinbox/worker run reconcile`

### 5.3 Bull Board Exposed Publicly
**Severity**: P0 (security)
**Cause**: Missing auth middleware on `/admin/queues`
**Detection**: Penetration test; unauthorized access logs
**Mitigation**:
- Mount Bull Board router behind `requireAuth` + `requireAdmin` middleware
- Admin check: `user.role === 'ADMIN'` OR `user.email in BULL_BOARD_ADMIN_EMAILS`
- Separate subdomain / IP allowlist in production (infrastructure layer)

### 5.4 Environment Variable Misconfiguration
**Severity**: P0 (startup)
**Cause**: Missing required vars; invalid formats (e.g., non-hex encryption key)
**Detection**: App crashes on startup with clear error
**Mitigation**:
- `config.ts` validates all required vars at load time (Zod schema)
- Fails fast with actionable message: "Missing GOOGLE_CLIENT_ID"
- `.env.example` documents all vars with placeholders

---

## Recovery Procedures

### Reconciler Manual Trigger
```bash
# One-shot worker recovery scan
pnpm --filter @reachinbox/worker run reconcile
```

### Elasticsearch Full Reindex
```bash
pnpm --filter @reachinbox/worker run es:reindex
# Scans all nonterminal ScheduledEmail rows, upserts to ES in batches
```

### Redis Data Loss Recovery
1. Restart Redis (data gone)
2. Keep the API running; its outbox publisher resumes durable pending events
3. Keep the worker running; its startup/30-second reconciler recreates jobs for `SCHEDULED` emails
4. Verify: `GET /api/emails?status=SCHEDULED` matches queue delayed count

### Stuck SENDING Records
```sql
-- Find emails stuck > 10 minutes
SELECT * FROM "ScheduledEmail"
WHERE status = 'SENDING' AND "updatedAt" < NOW() - INTERVAL '10 minutes';
-- Manual resolution: set status = 'SCHEDULED' to re-queue, or 'FAILED' if known bad
```

---

## Testing Failure Modes

| Test | Command |
|------|---------|
| Redis down during schedule | `docker compose stop redis` → POST schedule → `docker compose start redis` |
| Worker crash mid-send | `kill -9 <worker-pid>` during SMTP; verify no duplicate |
| Rate limit burst | Schedule 500 emails with cap=10; verify all eventually sent |
| ES outage during send | `docker compose stop elasticsearch` → send email → verify sent + ES backfill |
| OAuth state mismatch | Tamper `state` param in callback; verify reject |
| Bull Board auth | `curl /admin/queues` as non-admin; verify 403 |

---

## Known Limitations

1. **SMTP Exactly-Once**: Not guaranteed. Accept-then-crash ambiguity remains. Mitigated for normal operations.
2. **Local Redis HA**: Single-node Docker Redis with AOF is not production HA. Documented.
3. **Clock Skew**: Workers and API assume synchronized clocks (NTP). No logical clock.
4. **Slack Channel Selection**: Current MVP uses first available channel; not user-configurable per campaign.
5. **Large CSV Imports**: Synchronous transaction; may timeout >30s. Async import queue planned.
