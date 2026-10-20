# AGENTS.md — ReachInbox Full-Stack Email Scheduler

> **Purpose:** This file is the implementation contract for AI coding agents working on the ReachInbox Software Development Intern assignment. Read it before changing code. Implement the project phase by phase, run the tests and checks required by each phase, update documentation, and report what is genuinely complete. Do not skip ahead to a polished UI while the email-delivery and recovery path is unreliable.

## 0. Mission and non-negotiable rules

Build a production-minded full-stack email scheduling application that satisfies the assignment in this repository. The final application must let an authenticated user import a CSV/text lead list, create an email campaign, schedule one email per valid recipient, and view scheduled and sent/failed emails in a dashboard.

### Mandatory technologies

- **Backend:** TypeScript, Node.js, Express.js.
- **Queue/scheduling:** BullMQ + Redis delayed jobs. Do not use cron for email scheduling.
- **Relational database:** PostgreSQL (preferred) with Prisma ORM and migrations.
- **SMTP:** Nodemailer + Ethereal Email accounts for fake SMTP delivery. Never claim that an email was sent unless the SMTP transport accepted it.
- **Search:** Elasticsearch indexing and searchable API endpoints.
- **Queue visibility:** Bull Board exposed through an authenticated/authorized endpoint.
- **Frontend:** Next.js/React, TypeScript, Tailwind CSS.
- **Authentication:** real Google OAuth; no mock login in the application.
- **Slack notifications:** real Slack OAuth and a real Slack API `chat.postMessage` call on a sender's hourly-limit event; no log-only implementation.
- **Infra:** Docker Compose for local PostgreSQL, Redis and Elasticsearch, where practical.

### Hard constraints

1. **No cron jobs.** Do not install or use `node-cron`, `cron`, `node-schedule`, Agenda or OS crontab. Do not use a periodic cron task to decide when an email should be sent. Use BullMQ delayed jobs. Long-running outbox/reconciliation services are allowed only for durable queue publication/recovery, not as a substitute timer for each email.
2. Do not store scheduled work only in process memory.
3. Do not put SMTP passwords, Google client secrets, Slack tokens, database URLs or encryption keys into source control or frontend code.
4. No fake Google OAuth, fake Slack connect, simulated send success, or mock dashboard data in the shipped application. Mocks are permitted only inside automated tests.
5. Use strict TypeScript. Avoid `any` except when unavoidable and documented. Validate request bodies and environment variables at runtime.
6. Do not claim “exactly once email delivery” based only on BullMQ/Redis. The SMTP accept-then-process-crash case is inherently ambiguous unless the provider offers a reliable idempotency facility. Implement the strongest possible application-level idempotency, describe the remaining limitation honestly, and avoid duplicate sends in normal scheduling/restart flows.
7. Never expose Bull Board to unauthenticated internet users. Protect it with authentication plus an admin/owner authorization check.
8. Keep the service startable with documented commands. Provide `.env.example`, migrations, seed/setup instructions and useful health checks.
9. Do not leave a phase marked complete when its tests have not run or its behavior has not been verified.

## 1. Working style for AI agents

Before coding:

1. Inspect the existing repository, package manager, files, and git status. Do not overwrite an existing implementation blindly.
2. Read this entire file and the assignment details.
3. Produce a short execution plan based on the phases below, identify missing secrets/configuration that require the human, and then implement Phase 0 onward in order.
4. Keep changes focused and coherent. Do not generate the entire application as one untested dump.
5. After each phase: run the required typecheck/lint/tests, fix failures, update the README/phase checklist, and summarize files changed, commands run and remaining blockers.
6. Use actual library APIs for the versions installed. Consult the official docs when uncertain, especially for BullMQ job moving, locking, rate limiting, Google OAuth, Slack OAuth and Elasticsearch clients.
7. If a real OAuth integration cannot be verified without human-provided credentials, implement the real callback/token-validation flow, add automated tests around the flow, document the required console configuration, and clearly label the manual verification step. Do not quietly substitute a mock.
8. Never delete user changes or perform destructive database/Redis reset commands without warning. Use disposable test data for integration tests.

## 2. Repository structure

Use a TypeScript monorepo. `pnpm` workspaces are preferred; use the existing package manager if the repository already has one.

```text
.
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
├── docker-compose.yml
├── apps/
│   ├── api/                         # Express REST API, OAuth callbacks, Bull Board
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── server.ts
│   │   │   ├── config/
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── repositories/
│   │   │   ├── auth/
│   │   │   ├── integrations/slack/
│   │   │   ├── queue/
│   │   │   └── observability/
│   │   └── tests/
│   ├── worker/                      # Independent background process
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── workers/
│   │   │   ├── processors/
│   │   │   ├── outbox/
│   │   │   ├── rate-limit/
│   │   │   ├── search-indexing/
│   │   │   └── observability/
│   │   └── tests/
│   └── web/                         # Next.js + React + TypeScript + Tailwind
│       ├── app/
│       ├── components/
│       ├── features/
│       ├── hooks/
│       ├── lib/
│       └── types/
├── packages/
│   └── shared/                      # Shared DTOs, schemas, enums where appropriate
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── infra/
│   ├── elasticsearch/
│   └── scripts/
└── docs/
    ├── architecture.md
    ├── api.md
    ├── failure-modes.md
    └── demo-script.md
```

Do not force every item into a separate file if the repository remains easier to understand with fewer files. Do preserve the core separation between API, worker, frontend, shared types, durable database records and queue processing.

## 3. Architecture and data-flow contract

### 3.1 Main flow

1. The user signs in with Google OAuth.
2. The user uploads a CSV/text file with lead addresses, enters subject/body, picks a sender, a start time, minimum spacing and hourly limit.
3. The frontend parses the file for an immediate count/preview, but **the backend re-validates every address**. The frontend is not trusted for data validation.
4. The API authenticates the user and verifies that the selected sender belongs to that user/tenant.
5. In one PostgreSQL transaction, create the campaign (if used), one `scheduled_emails` row for each valid recipient, and durable outbox event(s) for publishing delivery jobs and indexing records.
6. A long-running outbox publisher sends delivery events to BullMQ. It retries on Redis errors. Do not return a false success from queue writes when the database commit did not happen; the API's source-of-truth contract is a successfully committed DB transaction.
7. BullMQ holds one **delayed job per recipient** with a deterministic custom job ID. Payload should contain the email record ID and minimal routing metadata, not a second canonical copy of the email body.
8. At the due time, the worker loads the email row from PostgreSQL, checks status/cancellation, allocates a sender-specific rate-limit slot atomically in Redis, applies configured minimum spacing, and sends using the configured Ethereal SMTP account for that sender.
9. On success, persist `SENT` and the accepted/sent timestamp/provider details. On permanent failure or exhausted retries, persist `FAILED` plus a safe error code/message. Retryable failures should throw so BullMQ can apply retry/backoff.
10. Update Elasticsearch asynchronously/reliably so scheduled/sent/failed messages are searchable. Search index failure must not cause a successfully accepted SMTP send to be retried just because Elasticsearch is down.
11. If hourly limit is reached, do not drop or permanently fail the job. Move/reschedule it into the next available hour window and, when the user's Slack connection exists, send a real Slack notification for the sender/hour limit event.
12. Dashboard reads the API, not Redis internals. Show `Scheduled Emails` and `Sent Emails` (including failed), statuses, loading/error/empty states and search.

### 3.2 Responsibility boundaries

- **PostgreSQL:** canonical email/campaign/sender/user state, durable outbox, OAuth connection records and audit metadata.
- **Redis/BullMQ:** delayed-job timing, ready/active/completed/failed queue states, retries, locks and distributed rate-slot reservations.
- **Worker process:** performs actual SMTP work; it is independently deployable and can be horizontally scaled.
- **Outbox publisher:** bridges PostgreSQL commits to Redis without losing accepted requests when Redis is briefly unavailable.
- **Reconciler:** repairs divergence when queue data has been lost or an outbox event is stuck. It recreates only missing work by inspecting PostgreSQL truth; it must not blindly resend `SENT` emails.
- **Elasticsearch:** read/search index, never the sole authoritative data store.
- **Bull Board:** operational queue inspection, protected route.
- **Ethereal:** fake SMTP destination/testing. It is not a production email delivery provider.

### 3.3 Mermaid architecture diagram

Keep a version of this diagram in `docs/architecture.md`, adjusted to match the final implementation.

```mermaid
flowchart TD
  U[User] --> WEB[Next.js dashboard]
  WEB --> API[Express + TypeScript API]
  API --> PG[(PostgreSQL: source of truth)]
  API --> O[Transactional outbox rows]
  O --> PUB[Long-running outbox publisher]
  PUB --> Q[BullMQ delayed jobs on Redis]
  Q --> W[Worker fleet]
  W --> RL[Atomic Redis per-sender rate-slot allocator]
  W --> PG
  W --> SMTP[Ethereal SMTP]
  W --> IDX[Search-index outbox / indexing worker]
  IDX --> ES[(Elasticsearch)]
  W --> SL[Slack API chat.postMessage]
  WEB --> ESAPI[Search API]
  ESAPI --> ES
  API --> BB[Authenticated Bull Board]
  BB --> Q
  RECON[Reconciler] --> PG
  RECON --> Q
  API <--> GOOG[Google OAuth]
  API <--> SLACKO[Slack OAuth]
```

## 4. Database schema requirements

Use Prisma migrations. Choose names and enum names consistently. The following is a logical model requirement, not a mandate to copy field names verbatim.

### 4.1 `User`

- `id` UUID primary key.
- `googleSubject` unique stable identifier from Google (`sub`), not just email.
- `email`, `name`, `avatarUrl`.
- `role` such as `USER` / `ADMIN`; default ordinary users must not access Bull Board.
- `createdAt`, `updatedAt`, optional `lastLoginAt`.

### 4.2 `Sender`

- `id`, `userId`/tenant ID, `displayName`, `fromEmail`.
- SMTP transport identity/config reference. Do not expose stored SMTP credentials to the browser. If credentials are persisted, encrypt them using authenticated encryption and an environment-provided key; otherwise use configured sender credentials in local setup.
- `isActive`, optional per-sender hourly limit override, configured `minDelayBetweenEmailsMs` if product behavior allows sender-level configuration.
- `createdAt`, `updatedAt`.
- Index by owner and active status.

The assignment requires multiple senders. Create multiple Ethereal accounts for the demo (or allow configured sender records populated from environment/seed data). A worker must choose the correct transport from `senderId`, not always use one global SMTP account. If credentials are dynamically created for Ethereal, persist credentials safely and document their lifecycle. Never show raw SMTP passwords in API responses/logs.

### 4.3 `Campaign` (recommended)

- `id`, `userId`, `senderId`, `subject`, `body`.
- `startAt`, `minDelayBetweenEmailsMs`, `maxEmailsPerHour`.
- `createdAt`, optional name and CSV import metadata.

### 4.4 `ScheduledEmail`

One row per recipient/email attempt, not one row for the entire CSV.

- `id` UUID primary key.
- `userId`, optional `campaignId`, `senderId` foreign keys.
- `recipient`, `subject`, `body` (or reference to immutable campaign template plus merge data; the final send must have deterministic content).
- `scheduledAt` in `timestamptz`/UTC.
- `status`: at least `SCHEDULED`, `SENDING`, `SENT`, `FAILED`, `CANCELLED`. Add `QUEUED` only if its meaning is unambiguous and consistently used.
- `sentAt`, `failedAt`, `providerMessageId` or SMTP response metadata when available.
- `attemptCount`, safe `lastErrorCode` / `lastErrorMessage` (redact secrets).
- Unique `idempotencyKey` per request/email recipient (enforce via DB unique constraint) so browser/API retries don't create duplicates.
- `createdAt`, `updatedAt`, optional `processingLeaseUntil`/attempt metadata if required by the recovery strategy.
- Useful indexes: `(userId, status, scheduledAt)`, `(senderId, status, scheduledAt)`, `(status, scheduledAt)`, recipient/search fields as appropriate.

Do not store credentials or OAuth tokens in this table.

### 4.5 `OutboxEvent`

- Unique `id`, `eventType` (e.g. `PUBLISH_EMAIL_JOB`, `INDEX_EMAIL`, `SLACK_RATE_LIMIT_ALERT`), aggregate/email ID, JSON payload only for necessary metadata, `createdAt`, `publishedAt`/`processedAt`, `attempts`, `lastError`, `nextAttemptAt` if needed.
- Add indexes for unprocessed/pending rows.
- Create email records plus their initial outbox event in the **same PostgreSQL transaction**.
- Claim rows safely with a lease or `FOR UPDATE SKIP LOCKED` so multiple publishers do not constantly contend for the same records.
- The Redis publish and DB mark cannot be one atomic transaction. Design for at-least-once publishing; stable BullMQ job IDs plus DB status/idempotency protect against ordinary duplicates.

### 4.6 `SlackConnection`

- One active connection per user/tenant, or a supported multi-workspace model if implemented.
- Slack team/workspace ID, bot user ID, target channel ID, encrypted bot token, scope metadata, `connectedAt`, `disconnectedAt`/`isActive`.
- Encrypt access tokens at rest with an environment-supplied key (e.g. AES-256-GCM with a fresh nonce per ciphertext). Never return token plaintext to the browser or logs.
- Slack OAuth state must be validated and bound to the initiating authenticated user to prevent CSRF/account-linking attacks.
- Disconnect deletes/deactivates credentials safely. Reconnect updates the connection dynamically; do not require a redeploy to read new credentials.

### 4.7 Slack alert deduplication (recommended)

Use a durable unique key for `senderId + UTC hour window + notification type`, or equivalent. Only record an alert as delivered once Slack has accepted it. A failed Slack API call must be retryable and must not crash email sending. Avoid duplicate alerts caused by several workers observing the same limit boundary.

## 5. Scheduling, outbox and restart behavior

### 5.1 Queue job format

- Queue name: `email-delivery` (or one documented equivalent).
- Job name: `send-email`.
- One job per recipient.
- Payload: `{ emailId: string, reservedSendAt?: number, schemaVersion?: number }` (extend only when necessary).
- Stable job ID derived from email ID, for example `email-${emailId}`. Check the current BullMQ version's custom job ID restrictions; avoid reserved delimiters such as `:` if unsupported.
- Calculate delay from an absolute UTC timestamp: `Math.max(0, scheduledAtMs - Date.now())`.
- A delayed job becoming eligible at its timestamp does not guarantee processing at the exact millisecond. Document queue backlog and worker availability as sources of delivery delay.

### 5.2 No-cron outbox publisher

Implement a continuously running process, not a cron schedule:

- On startup, immediately scan pending outbox events.
- Use PostgreSQL `LISTEN/NOTIFY` as a low-latency wake-up signal if practical. The outbox table is the durable source; notifications alone are not durable.
- After a notification, scan/claim pending rows and publish their jobs.
- On PostgreSQL reconnect/startup, run a recovery scan to cover missed notifications.
- If Redis is down, keep pending events durable in PostgreSQL and retry with bounded exponential backoff using a long-running loop/wait. Do not spin at 100% CPU.
- A periodic safety scan implemented as part of a continuously running service is allowed only to reconcile pending outbox state; it must not serve as the email timer. It must not be implemented using cron or a cron library.
- If using only `LISTEN/NOTIFY`, still implement a recovery scan at process start and after reconnect because notifications may be missed while disconnected.
- Mark an event published only after `queue.add()` succeeds.
- If the publisher crashes after queue add but before the DB mark, it may add again after recovery. Use deterministic `jobId`; worker-side DB idempotency is still required because queue retention/auto-removal can eventually remove an old job record.

### 5.3 BullMQ delayed jobs and process recovery

- Use BullMQ's delayed-job functionality rather than timers for each email.
- Configure Redis with persistence for local and production deployments. Docker Compose Redis must use a named volume and a suitable AOF/snapshot configuration; explain local Redis is a single-node development setup, not HA.
- Worker and API processes must be independent. Restarting either must not require re-creating all scheduled emails by hand.
- Worker uses BullMQ lock/stalled-job recovery appropriately. Do not set a lock duration that is shorter than realistic provider operations without understanding the implications.
- Implement a reconciler that can inspect nonterminal scheduled emails in PostgreSQL and recover missing BullMQ jobs after Redis data loss or missed publishing. It must skip `SENT` and `CANCELLED` records and not blindly enqueue a running/finished email. Protect concurrent reconciliation with safe DB claims/constraints. Document how often/whether the reconciler scans, but do not call a cron library.
- On worker shutdown (`SIGTERM`/`SIGINT`), stop accepting new jobs, close BullMQ Worker/QueueEvents/Queue resources, close Redis clients and disconnect Prisma gracefully.

### 5.4 Critical SMTP idempotency caveat

Use multiple layers:

1. Unique DB idempotency key on schedule requests.
2. Deterministic BullMQ job IDs.
3. Before SMTP, fetch the email by `emailId` and skip `SENT`/`CANCELLED` records.
4. Use safe atomic DB transitions/transactions or a lease so two jobs cannot intentionally send the same record concurrently.
5. Persist attempt and provider response metadata. Reconcile stuck `SENDING` records with a documented lease/recovery rule.
6. Use a deterministic `Message-ID` header where possible. Explain this can help identify duplicates but is not a universal SMTP idempotency guarantee.
7. If a provider with an idempotency API is ever used, pass the stable email ID as the provider idempotency key.

Do not mark the DB record `SENT` before the SMTP provider accepts it. Also do not claim perfect exactly-once external delivery: there is an unavoidable ambiguity if SMTP accepted the message but the worker crashed before it recorded success. Document this limitation while demonstrating that ordinary restarts and duplicate API submissions do not create duplicate sends.

## 6. Worker concurrency, minimum spacing and per-sender hourly rate limits

This is a major evaluation area. Do not implement rate limits only in JavaScript memory; different worker replicas must share the same coordination mechanism.

### 6.1 Environment configuration

At minimum add these validated settings (names may vary, but document them consistently):

```dotenv
WORKER_CONCURRENCY=10
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200
RATE_LIMIT_WINDOW=UTC_FIXED_HOUR
EMAIL_JOB_ATTEMPTS=5
EMAIL_RETRY_BASE_DELAY_MS=5000
```

Limits must be configurable in environment/config; do not hardcode evaluation values inside processor logic. Campaign values can override defaults only within a safe allowed range. Validate positive integers and reasonable upper bounds at startup/request time.

### 6.2 Atomic Redis reservation

BullMQ's built-in queue limiter is global for the queue in current releases and does not provide general built-in per-sender grouping in recent BullMQ versions. Since Slack notification is sender-specific and the requirement allows per-sender limits, implement a **Redis-backed atomic per-sender reservation** instead of assuming old BullMQ group-key behavior exists.

Use a Lua script or another genuinely atomic Redis operation. Keys should be namespaced and sender-specific, for example:

- `email-rate:{senderId}:{utcHourEpoch}` — reservations consumed in a fixed UTC-hour window.
- `email-rate:{senderId}:next-slot` — last/next reserved send slot used to enforce spacing across all workers.

The allocator should take `now`, `senderId`, `maxPerHour`, and `minSpacingMs`, then atomically:

1. Find the earliest slot at or after the job's due time and the sender's next permitted time.
2. Determine the UTC hour window for that candidate slot.
3. If the window has reached its cap, jump to the next hour boundary and repeat the check.
4. Reserve exactly one slot in the selected window and advance the sender's next slot by the minimum spacing.
5. Set appropriate expirations on hourly counters/temporary keys so Redis does not accumulate them forever.
6. Return the selected `reservedSendAt` and whether a limit was reached during allocation.

Test edge cases around UTC hour boundaries, counter expiry and simultaneous calls from multiple processes. Do not depend on a JavaScript read-then-write pair for atomicity.

### 6.3 Applying a future reservation safely

If a worker reserves a send slot in the future because the minimum interval or hourly cap requires it:

- Persist the reservation timestamp in the BullMQ job data before moving the active job back to delayed state.
- Use the version-appropriate BullMQ `job.moveToDelayed(timestamp, token)` API and throw BullMQ's documented `DelayedError` after a successful move so the processor does not accidentally complete/fail the job.
- Verify the exact processor token and `moveToDelayed` signature against the installed BullMQ version.
- When the job wakes for its reserved slot, recognize the persisted reservation and do not reserve another slot unnecessarily.
- Clear/consume the reservation at the appropriate transition before an SMTP attempt; if an attempt fails and must be retried, ensure retries respect configured rate controls again.
- Handle a crash between reservation, updating job data and moving the job: an orphaned reservation may waste capacity but must not drop the email. Document the chosen recovery behavior.

An alternative design is acceptable only if it avoids a thundering herd of many jobs repeatedly re-delaying to the same instant and still enforces limits atomically across replicas.

### 6.4 Ordering and overload

- Define ordering scope: best-effort FIFO by enqueue sequence for each sender, with a sender-specific serialized rate-slot allocation. Explain that parallel workers and pre-existing delayed jobs can affect strict order.
- One thousand jobs due simultaneously must remain queued; they must not be dropped. They will be paced into allowed slots/windows and queue backlog should be observable.
- If current UTC hour is full, schedule excess work into the next available hour/window. Avoid permanent failure for rate limiting.
- Ensure the rate-limit allocator handles many jobs without moving every job to the exact same timestamp if doing so creates unnecessary reprocessing. Persist reservations/slots where useful.
- Rate-limit notifications should fire when a sender hits its hourly limit, not for every email postponed. Deduplicate by sender/hour window.

### 6.5 Slack notification behavior

- On the first rate-limit event for a sender in a UTC-hour window, look up the user's current active Slack connection from the database.
- If no connection exists, skip notification without failing email processing. Do not write a “sent notification” marker that permanently prevents notification after the user connects Slack later in that same window unless the product explicitly documents that behavior.
- If connected, send a real Slack Web API `chat.postMessage` request to the saved channel with sender identity, hour window, configured cap and rescheduled-job context.
- Persist an idempotent alert event/outbox record to guard concurrent workers and support retry if Slack is temporarily unavailable. Coordinate alert delivery separately from email sending so Slack slowness cannot block all email processing indefinitely.
- Read the current connection dynamically; connecting, disconnecting or reconnecting Slack must take effect without backend redeployment.
- Use OAuth scopes suitable for posting messages (for example `chat:write`) and explain any workspace/channel permissions needed.
- Do not expose bot token/access token to the frontend. Store encrypted tokens at rest.

## 7. SMTP and sender configuration (Ethereal)

- Use `nodemailer` with Ethereal test accounts.
- Support more than one sender. Each `Sender` must resolve to its own Ethereal SMTP transport or account credentials, and the worker chooses transport by the email row's `senderId`.
- Document how to create multiple Ethereal accounts (or run an initialization/seed flow that creates accounts and stores credentials only in local DB/environment). Ethereal accounts may be disposable; if credentials are generated automatically, persist them encrypted for the life of a local demo and never print secrets.
- Distinguish SMTP acceptance from inbox delivery. Ethereal provides a preview URL/ID; capture preview URL in server-only metadata or logs that are safe for local demo. Never leak SMTP credentials into API responses.
- Enforce provider/send spacing per sender, not just per worker process. If the rate allocator is sender-specific, spacing must also be sender-specific.
- Configure connection timeout, greeting timeout and socket timeout. Handle transport close/reconnect as appropriate.
- Retry temporary network/SMTP errors with exponential backoff and jitter if practical. Treat clearly permanent recipient/configuration errors differently; do not retry permanent failures forever.
- Do not log the email body, OAuth tokens or full SMTP credentials by default.

## 8. Elasticsearch search/indexing

The assignment explicitly requires emails searchable via Elasticsearch. Implement real indexing, not just an Elasticsearch client connection.

- Create a documented index name/version such as `scheduled-emails-v1` and explicit mappings.
- Index at least: `emailId`, `userId`, `campaignId`, `senderId`, `recipient`, `subject`, `body` (text), `status`, `scheduledAt`, `sentAt`, `createdAt`.
- Use keyword mappings for exact-match/status/ID fields and text mappings for subject/body/recipient as suitable.
- Expose an authenticated search endpoint with pagination and filters (status, recipient, date range, sender). Always scope results to the authenticated user's tenant/user ID.
- Add frontend search controls to Scheduled and Sent views so Elasticsearch is exercised by the product, not only by a hidden endpoint.
- Use a durable indexing event/outbox or another retryable approach. ES outages must not block scheduling or turn a successful SMTP send into a duplicate SMTP retry.
- On first run, document index creation and mappings. Implement retry for index failures and a documented reindex/backfill path from PostgreSQL.
- Correct status updates must eventually be reflected in Elasticsearch. Do not let an older asynchronous indexing event overwrite a newer status; include an update/version strategy or fetch the latest DB record before writing the document.
- Add integration tests verifying a scheduled email can be searched and status updates become searchable after indexing catches up.

## 9. Bull Board queue dashboard

- Mount Bull Board for the `email-delivery` queue (and other queues if useful).
- Route e.g. `/admin/queues` or `/api/admin/queues`; put the dashboard behind authenticated admin/owner middleware. Never expose it publicly without a guard.
- Configure Bull Board to use the same queue connection/name as producers/workers.
- Show waiting, delayed, active, completed, failed and stalled/retrying states as the installed library supports.
- Document how to access it locally and how authorization works.
- Add a test for denied access by a normal unauthenticated/non-admin user and success for an authorized admin.

## 10. Real Google OAuth authentication

Do not implement a fake sign-in button or use a static user.

- Use an established Google OAuth/OIDC library compatible with the chosen Next.js/Express architecture.
- The verified identity must come from Google, including stable Google subject ID, email, display name and avatar.
- Ensure OAuth `state` is validated to prevent CSRF. Use secure redirect/callback URL configuration.
- Use `HttpOnly`, `Secure` in production, appropriate `SameSite`, bounded expiry and safe logout/session invalidation. If using cookies, configure CORS and credentialed fetch correctly and protect state-changing operations against CSRF/origin misuse.
- Do not store OAuth client secrets in the frontend build or commit them.
- On first login, upsert the user by Google subject. Do not treat unverified email alone as a sufficient permanent identity key.
- Dashboard header must show user's name, email and avatar and provide logout.
- Protect every business-data API route with authentication, then scope every SQL/search query by user/tenant ID. Never trust a `userId` supplied in the request body/query.
- Create a real Google Cloud OAuth client and explain authorized origins/callback URLs in README. If the agent cannot make a real login without client credentials, it must produce accurate setup instructions and a manual verification checklist.

## 11. Real Slack OAuth integration

Implement the whole OAuth flow, not a placeholder.

- Dashboard button “Connect Slack” redirects to Slack's OAuth authorize page.
- Generate and validate an anti-CSRF `state`, bound to authenticated user/tenant and short-lived.
- Exchange authorization code on backend; request only needed scopes; identify workspace/team and target channel. Make the posting destination selectable or documented/configured in a safe way.
- Persist encrypted bot token and workspace/channel metadata in PostgreSQL.
- Display connection status and a “Disconnect Slack” action. Disconnect/reconnect must be supported.
- At rate-limit hit, invoke the Slack API for a real message. No connection means skip safely. Provider errors are captured and retried/visible without failing the email job.
- Include setup instructions for a Slack app, redirect URL, scopes, workspace install and testing. Do not claim a live Slack message was verified without actually observing successful API acceptance during a demo.

## 12. API design

Keep API contracts typed and documented in `docs/api.md`. Reasonable routes include the following; routes can differ if final behavior is equivalent.

### Auth

- `GET /api/auth/google` — start Google OAuth.
- `GET /api/auth/google/callback` — validate response, upsert user and create secure session.
- `GET /api/auth/me` — current authenticated user.
- `POST /api/auth/logout` — invalidate session and clear cookie.

### Senders

- `GET /api/senders` — list senders the current user can use, never credentials.
- Optional admin/owner route to create/update sender configuration or a documented seeded-sender setup.

### Scheduling and email list

- `POST /api/emails/schedule` — validated request with subject, body, recipient array/CSV import result, sender ID, `startAt`, delay and max emails/hour. Prefer an idempotency key/header for request retries.
- `GET /api/emails?status=SCHEDULED` — cursor/page-based list, scoped to current user.
- `GET /api/emails?status=SENT` — sent list.
- `GET /api/emails?status=FAILED` — failed list.
- `GET /api/emails/:id` — email details, scoped to user.
- `POST /api/emails/:id/cancel` — optional but valuable; only succeeds before sending starts and removes/neutralizes its queued job safely.
- `GET /api/emails/search?q=...&status=...` — Elasticsearch search with proper user scope and pagination.

### Slack

- `GET /api/integrations/slack/connect` — start OAuth.
- `GET /api/integrations/slack/callback` — verify state, exchange code, store encrypted connection.
- `GET /api/integrations/slack/status` — connection metadata only, never token.
- `POST /api/integrations/slack/disconnect` — disable/remove connection safely.

### Health/operations

- `GET /health/live` — process liveness, no expensive external probes.
- `GET /health/ready` — readiness checks for required backing services, with careful timeouts.
- Authenticated Bull Board route.

### API rules

- Use a consistent success/error JSON shape, HTTP status codes, request IDs, input validation and centralized error middleware.
- Schedule response should be `202 Accepted` after the email/outbox transaction commits, even if Redis is temporarily unavailable. The durable outbox will publish later.
- Use a safe batch size and CSV/file size limit. For very large imports, either batch the DB transaction safely or create an import job with a clear status, but never silently accept only part of the CSV.
- Do not return SMTP credentials, raw Slack tokens, OAuth secrets or unsafe internal stack traces.

## 13. Frontend requirements and UI behavior

Use the provided Figma as the visual reference: `https://www.figma.com/design/kOTwGlESjijCYnMgtHfvfU/Outbox-Labs-Assignment?node-id=59-4050&p=f&m=dev`.

- Try to inspect the target frame if browser/Figma access is available. Follow its layout, typography, spacing, colors, navigation and table treatment as closely as practical. Do not falsely claim pixel-perfect matching if the file was inaccessible.
- Avoid a generic admin template that ignores the provided design. Build reusable primitives and consistent spacing.
- Header: user avatar, name, email, logout.
- Main tabs/views: Scheduled Emails and Sent Emails; include Failed as a tab/filter or a status in Sent/history so failed emails are discoverable.
- Primary CTA: Compose New Email.
- Compose modal/page fields: subject, body, upload CSV/text, detected valid email count and invalid/duplicate count, preview sample, sender, start time, delay between emails, hourly limit, schedule action.
- File parser must support comma-separated CSV and plain-text addresses as documented. Handle headers such as `email`, `Email`, `Email Address`; allow common whitespace/quoted cells; deduplicate valid addresses case-insensitively; show invalid rows rather than silently hiding them. Backend repeats normalization/validation.
- Frontend date/time input must communicate the timezone. Convert to ISO UTC when sending API requests; do not silently interpret a local time as UTC.
- Tables include email, subject, scheduled/sent time, sender (useful), status, and safe error details for failed rows.
- Include loading skeleton/spinner, empty state, error state with retry, pagination, search and status filters.
- Toast success only when the backend confirms durable acceptance; errors should be actionable.
- Strong TypeScript types for DTOs/props; shared DTOs or generated API types are preferred.
- Use accessible labels, keyboard navigation, focus handling in modals, and responsive behavior.
- Never use hardcoded demonstration emails or simulated success in production UI. Seeded local data may be documented for development but dashboard data must come from APIs.

## 14. Environment/configuration

Create `.env.example` with every required variable and safe placeholders, grouped clearly. Do not commit `.env`.

At minimum include equivalents of:

```dotenv
NODE_ENV=development
API_PORT=4000
WEB_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reachinbox?schema=public
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USERNAME=
ELASTICSEARCH_PASSWORD=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback
SESSION_SECRET=replace-with-random-secret
SESSION_COOKIE_NAME=reachinbox.sid
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_CALLBACK_URL=http://localhost:4000/api/integrations/slack/callback
TOKEN_ENCRYPTION_KEY=replace-with-32-byte-key-encoded-as-documented
ETHEREAL_FROM_NAME=ReachInbox Demo
WORKER_CONCURRENCY=10
MIN_DELAY_BETWEEN_EMAILS_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200
EMAIL_JOB_ATTEMPTS=5
EMAIL_RETRY_BASE_DELAY_MS=5000
CSV_MAX_BYTES=5242880
```

Adjust names and include all actually required variables, including OAuth/cookie origins, optional sender credentials and Bull Board admin configuration. Validate env at startup and fail with a clear message for missing mandatory settings. `.env.example` values must not look like usable production secrets.

## 15. Docker Compose and local infrastructure

- Include PostgreSQL with a named volume and healthcheck.
- Include Redis with a named volume, durable configuration suitable for local restart testing, and `maxmemory-policy noeviction`. Do not set a tiny maxmemory that causes queue failure during the demo.
- Include Elasticsearch with a supported development configuration and memory settings. Explain required Docker memory on macOS.
- Optionally include Kibana for local debugging, but do not make it a core application requirement.
- Use service health checks and `depends_on` conditions where supported, but do not rely solely on startup ordering; application clients need reconnect behavior.
- Do not write a Docker service that runs a cron daemon.
- Document local Redis as single-node and not high availability. For production, recommend managed/cluster Redis with automatic failover, appropriate persistence, backups and monitoring, and explain that replication alone can have acknowledged-write-loss windows depending on configuration.

## 16. Search indexing, API consistency and failure isolation

- Scheduling must not fail just because Elasticsearch is unavailable.
- SMTP success must not be retried solely because an Elasticsearch write fails.
- Use a durable pending indexing event or retryable indexer. Failed indexing events remain observable and retryable; add a backfill/reindex command that scans PostgreSQL records and reindexes in batches.
- Never use Elasticsearch as the only database for `SENT` status, cancellation or sender ownership.
- Do not mix search indexing into the critical SMTP step in a way that makes an ES outage cause duplicate emails.
- Search endpoint enforces authentication and ownership filters in Elasticsearch query, not only in frontend filtering.

## 17. Security and privacy checklist

- Use HTTPS/secure cookies in production and trust proxy settings only where deployment requires them.
- Validate OAuth state; use a secure session/JWT strategy; protect cookies and state-changing endpoints from CSRF.
- Apply rate limits to login/callback and public API endpoints. Validate payload sizes and CSV upload sizes.
- Verify all recipient and sender input on backend. Restrict sender IDs to the current user's permitted senders.
- Escape/encode content in UI; send text bodies by default. Do not render imported data as trusted HTML.
- Encrypt Slack and SMTP secrets at rest if database-persisted. Use a key-management scheme and document key rotation limitations.
- Redact passwords/tokens, authorization headers, SMTP auth and sensitive message content from logs/errors.
- Do not leak database error details or stack traces to clients.
- Restrict Bull Board to admins. Ensure search queries cannot return another user's emails.
- Use dependency lockfiles and avoid unmaintained OAuth/security packages when a suitable maintained package exists.

## 18. Observability and operational behavior

Use structured logs (JSON in production or readable dev logs) with request ID, job ID, email ID, sender ID and attempt number. Do not log secrets or full email bodies.

Capture/log:

- Queue wait time and delayed-job backlog.
- Count of scheduled/sent/failed/cancelled emails.
- Worker job duration, retry count, stalled job events.
- Outbox pending count and oldest pending age.
- Reconciler recoveries and missing jobs recreated.
- Rate-limit hits per sender/hour and reschedule time.
- Slack notification success/failure (without tokens).
- Elasticsearch indexing failures and backfill results.
- Redis, PostgreSQL, Elasticsearch and SMTP connectivity errors.

Add graceful shutdown and bounded timeouts. A dependency being down should create clear health status and useful logs, not an endless request hang or silent success.

## 19. Test strategy and acceptance criteria

Add automated unit/integration tests. Mock external OAuth/Slack/SMTP only in tests; keep the actual runtime integration real.

### Unit tests

- CSV/text parsing, email normalization, deduplication and invalid-row reporting.
- Date/time parsing and delay calculation.
- Configuration validation.
- Redis/Lua rate allocator: simultaneous reserve calls, per-sender isolation, hourly cap, spacing and hour-boundary behavior.
- Status transition rules and idempotency key generation.
- Elasticsearch mapping/query construction and user scoping.

### Integration tests

- `POST /api/emails/schedule` creates one DB row per valid unique recipient plus durable outbox events.
- Same idempotency key/request does not create duplicate email records/jobs.
- BullMQ delayed job does not execute before `scheduledAt` (use test clock/time offsets or a suitably short delay, not a production timer hack).
- Correct sender Ethereal transport is selected.
- SMTP success updates status and searchable/indexed fields eventually.
- Permanent SMTP error becomes failed; transient error is retried.
- An Elasticsearch outage does not cause duplicate email sends or lose index events.
- A Redis outage during scheduling still leaves committed email/outbox records recoverable; once Redis returns, the publisher creates delayed jobs.
- API/worker restart preserves future scheduled emails when Redis uses its persistent local volume.
- Reconciler recreates a missing queue job for an unsent scheduled email and never queues an already `SENT`/`CANCELLED` email.
- Two or more workers sharing Redis do not exceed per-sender hourly cap or minimum spacing.
- Distinct senders have independent limits.
- Rate-limited jobs stay scheduled/rescheduled rather than becoming permanently failed.
- Slack unconnected path does not crash; connected path calls Slack API; duplicate limit hits do not send duplicate notifications for the same sender/window; reconnect is used without redeployment.
- Google OAuth callback upserts stable user identity and protected endpoints reject unauthenticated requests.
- Search cannot return another user's data.
- Bull Board access is denied for ordinary users and unauthenticated requests.

### Frontend checks

- Sign-in redirects to the real OAuth flow and returns to dashboard after valid configuration.
- Header uses authenticated profile data.
- Compose CSV parsing displays counts; schedule request includes selected sender, subject/body, start time, delay and limit.
- Loading/empty/error states work; tables load from APIs.
- Search and filters work against backend search/list routes.
- Logout invalidates the session.
- Layout is responsive and reasonably matches Figma.

### Required manual demo

Record a demo of **5 minutes maximum** showing:

1. Google OAuth login (use a configured test account).
2. Compose an email and upload a CSV/text leads file; show valid-recipient count.
3. Schedule future emails and show `Scheduled Emails`.
4. Show Bull Board with delayed/waiting jobs.
5. Restart API/worker (and, if demonstrated safely, restart Redis with its volume intact); show scheduled emails are not lost and later send via Ethereal. Do not imply Redis data-loss recovery if only an ordinary process restart was tested.
6. Show sent email status and Ethereal preview.
7. Demonstrate minimum delay/rate limiting with a low test cap, then show the job being rescheduled instead of lost.
8. Show a connected Slack workspace receiving the actual rate-limit notification.
9. Show search returning scheduled/sent emails.

If human OAuth app secrets/workspace access are not supplied, document exactly which manual steps remain and do not fake the OAuth/Slack portion.

## 20. Phase-by-phase execution plan

Do phases sequentially. Keep a checklist in the README and mark each item only after the acceptance checks pass.

### Phase 0 — Repository reconnaissance and decisions

**Tasks**
- Inspect repository/status and available tooling.
- Confirm package manager and versions; choose compatible versions for BullMQ, Redis client, Prisma, Next.js, Elasticsearch and OAuth libraries.
- Write `docs/architecture.md` and `docs/failure-modes.md` from this contract.
- Define environment variable schema and the status transitions.
- Report OAuth/Slack/Ethereal setup required from the human.

**Exit criteria**
- Architecture diagram and local service list documented.
- All major design choices and known limitations recorded.
- No application code is blindly overwritten.

### Phase 1 — Monorepo, shared types and local infrastructure

**Tasks**
- Set up workspace/package scripts.
- Create API, worker, web and shared package shells.
- Add strict TypeScript, ESLint/formatter and test runner.
- Add Docker Compose for PostgreSQL, Redis and Elasticsearch with named volumes and health checks.
- Add `.env.example`, env validation and `.gitignore`.
- Add `health/live` and dependency-aware `health/ready` endpoints.

**Exit criteria**
- Clean clone can follow README setup and start infra.
- Typecheck/lint/test commands exist.
- No secret is in git.

### Phase 2 — PostgreSQL schema and persistence

**Tasks**
- Implement Prisma models and migrations for users, senders, campaigns, scheduled emails, outbox events, Slack connections and any notification/indexing event metadata.
- Create indexes and uniqueness constraints for idempotency and ownership.
- Seed multiple local Ethereal sender records safely, or implement an environment-driven sender setup.
- Implement repositories/services for core CRUD and status transitions.

**Exit criteria**
- Migrations succeed from an empty database.
- Data constraints prevent duplicate idempotency keys.
- Unit/integration tests validate ownership and allowed status transitions.

### Phase 3 — API foundation and real Google OAuth

**Tasks**
- Implement Express app, JSON/body-size limits, CORS, central errors and request logging.
- Implement actual Google OAuth with state validation and safe session/cookie strategy.
- Implement `/api/auth/me`, logout and protected routes.
- Upsert user from verified Google identity.
- Add user/tenant scoping middleware and `GET /api/senders`.

**Exit criteria**
- Protected route denies unauthenticated requests.
- Real OAuth works with configured credentials or has a fully working, documented manual configuration step plus tested callback behavior.
- User header DTO never includes secrets.

### Phase 4 — Schedule API, CSV rules and transactional outbox

**Tasks**
- Implement CSV/text normalization/validation and deduplication on backend; frontend can preview but API repeats it.
- Implement `POST /api/emails/schedule`, idempotency key and per-user sender validation.
- In one DB transaction create campaign/email records and publish/index outbox events.
- Return a response with accepted counts and invalid/duplicate row summary.
- Add list/detail/cancel APIs as appropriate.

**Exit criteria**
- One email record per valid, unique recipient.
- Duplicate request retry is idempotent.
- A committed request leaves durable pending outbox work even when Redis is down.

### Phase 5 — BullMQ delayed jobs and worker (vertical slice)

**Tasks**
- Implement queue factory with validated config and stable queue/job names.
- Implement outbox publisher with startup/reconnect recovery, bounded retry, safe row claims and deterministic BullMQ job IDs.
- Implement worker process with appropriate long-lived Redis connection settings, graceful shutdown and configured concurrency.
- Implement Ethereal transport per sender; worker loads canonical email row from PostgreSQL.
- Implement status updates and retry/backoff for transient SMTP errors.
- Implement DB status/idempotency guard and document SMTP exactly-once limitations.

**Exit criteria**
- Schedule one email in the future; worker does not send early; Ethereal receives it after due time.
- Stop/restart API or worker: future job remains scheduled and eventually sends.
- Redis unavailable at enqueue time: outbox publisher enqueues after Redis returns.
- Same email cannot be intentionally processed twice concurrently.

### Phase 6 — Redis-backed minimum spacing and per-sender hourly rate limit

**Tasks**
- Implement atomic Lua-based sender slot allocator and rate counter expiry.
- Implement persisted future reservation and BullMQ active-to-delayed behavior using the documented API for the installed BullMQ version.
- Enforce minimum delay across all worker instances for a sender.
- Move over-limit jobs into the next valid hour slot rather than failing/dropping them.
- Add environment/config validation for concurrency, minimum spacing, hourly cap and retry policy.
- Implement best-effort sender ordering and document concurrency effects.

**Exit criteria**
- Multiple workers cannot exceed one sender's hourly cap.
- Minimum actual send-slot spacing is respected across workers.
- Distinct senders have independent quotas.
- A test with more jobs than the current limit proves jobs are delayed into future windows, not dropped/failed.
- A burst of 1000 jobs remains queued and paced rather than silently disappearing.

### Phase 7 — Slack OAuth and rate-limit alerts

**Tasks**
- Implement Slack OAuth start/callback, state verification and token exchange.
- Encrypt/store token and workspace/channel metadata; add status/disconnect endpoints.
- Implement durable idempotent rate-limit alert event and real Slack API posting.
- Skip safely when no Slack connection exists; support connect/reconnect/disconnect without redeploy.
- Do not let Slack API failure crash the email worker; retry alert delivery separately.

**Exit criteria**
- Unconnected Slack does not throw or block email processing.
- A configured test workspace receives an actual Slack message when a sender's cap is reached.
- Duplicate workers do not create repeated alerts for the same sender/hour.
- Reconnected credentials are used dynamically.

### Phase 8 — Elasticsearch indexing and search

**Tasks**
- Define mappings and index bootstrap routine.
- Implement retryable index-outbox consumer and idempotent upserts by email ID.
- Implement authenticated search/filter/pagination API with tenant scope.
- Implement reindex/backfill support.

**Exit criteria**
- Scheduled/sent/failed rows become searchable.
- Search filters and user scopes pass tests.
- Elasticsearch outage doesn't block scheduling/sending; index events are recoverable.

### Phase 9 — Bull Board, monitoring and reconciliation

**Tasks**
- Mount Bull Board with admin/owner authorization.
- Implement queue stats and worker/error logs.
- Implement a reconciler that can repair missing jobs by comparing unsent Postgres records and queue state.
- Make reconciliation safe under concurrency and queue retention settings.
- Add graceful shutdown, Redis reconnect configuration and health reporting.

**Exit criteria**
- Queue dashboard displays actual live queue states and is access-controlled.
- Redis data loss/recreated-empty queue can be reconciled from PostgreSQL without blindly resending sent/cancelled emails.
- Outbox backlog, errors and reconciliation are observable.

### Phase 10 — Frontend and Figma-inspired dashboard

**Tasks**
- Implement responsive layout closely following target Figma frame if accessible.
- Implement Google login initiation, authenticated user header and logout.
- Implement Scheduled/Sent/Failed views with table, state, filters, pagination and Elasticsearch search.
- Implement compose UI with subject/body, CSV/text upload preview, sender selection, start time/timezone, delay and hourly cap.
- Connect UI to typed APIs; add loading/empty/error/toast/accessibility states.
- Add Slack connect/status/disconnect UI.

**Exit criteria**
- No production mocks/static email data.
- A user can schedule from the UI and see resulting records via APIs.
- CSV count and backend validation reconcile clearly.
- Dashboard states and responsive layout work.

### Phase 11 — End-to-end reliability tests and demo

**Tasks**
- Add e2e tests for schedule -> delayed queue -> worker -> Ethereal -> DB -> Elasticsearch.
- Run restart test, Redis unavailable/recovery test, rate-limit burst test, multi-worker test and Slack notification test.
- Verify search, authentication, ownership and Bull Board protection.
- Review security, logs, secret handling and migrations.
- Complete README, architecture/failure docs and 5-minute demo script.
- Record demo if tooling permits; otherwise document the exact manual recording steps and do not claim a video exists.

**Exit criteria**
- All required automated checks pass.
- README covers all required run/setup/architecture/rate-limit/persistence/demo details.
- Every assignment requirement is mapped to implemented code and verification evidence.
- Remaining manual steps and limitations are explicitly reported.

## 21. README requirements

README must be usable by a reviewer who has never seen the code. Include:

1. Overview and feature checklist mapped to the assignment.
2. Stack and architecture diagram.
3. Prerequisites and supported Node/package-manager versions.
4. Environment variable instructions, without secrets.
5. How to start PostgreSQL, Redis and Elasticsearch using Docker Compose.
6. How to install, migrate/seed, run API, run worker and run frontend as separate processes.
7. Google OAuth setup: Google Cloud console, origins, callback URL and allowed redirect URLs.
8. Ethereal setup and how multiple senders/transports are configured; how to view the Ethereal preview.
9. Slack setup: create app, scopes, redirect URL, install workspace, connect/disconnect and verify actual alert.
10. How BullMQ delayed jobs persist across API/worker restart and the Redis persistence assumptions.
11. Outbox/reconciler behavior during Redis failure and how to run/test recovery.
12. Worker concurrency, minimum delay and hourly-limit configuration and atomic mechanism; clarify the hourly window is UTC or specify actual chosen semantics.
13. Elasticsearch mapping/search endpoint and reindex/backfill procedure.
14. Bull Board URL and access-control rules.
15. All tests and commands.
16. Assumptions, shortcuts, failure modes and known trade-offs.
17. Demo video instructions/script (maximum 5 minutes).
18. Private GitHub repository and reviewer-access reminder for the human: grant repository access to **Mitrajit** and **Yadav036**. Do not attempt to infer GitHub usernames or send invitations unless the human explicitly provides the correct handles and authorizes the action.

## 22. Suggested package scripts

Use root scripts that actually work, adapted to the package manager:

```json
{
  "scripts": {
    "dev:infra": "docker compose up -d postgres redis elasticsearch",
    "dev:api": "run API dev server",
    "dev:worker": "run worker dev server",
    "dev:web": "run Next.js dev server",
    "dev": "run all local app processes concurrently without cron",
    "db:migrate": "run Prisma migrations",
    "db:seed": "seed safe local data/senders",
    "typecheck": "typecheck all workspaces",
    "lint": "lint all workspaces",
    "test": "run tests",
    "test:integration": "run infrastructure-dependent tests",
    "build": "build all deployable apps"
  }
}
```

Do not leave commands as literal placeholder strings in the final `package.json`; the listing above illustrates the intended scripts.

## 23. Official documentation references

Prefer these official sources over old blog posts when implementing APIs:

- BullMQ delayed jobs: https://docs.bullmq.io/guide/jobs/delayed
- BullMQ connections: https://docs.bullmq.io/guide/connections
- BullMQ persistent connections: https://docs.bullmq.io/bull/patterns/persistent-connections
- BullMQ production guidance: https://docs.bullmq.io/guide/going-to-production
- BullMQ rate limiting: https://docs.bullmq.io/guide/rate-limiting
- BullMQ delaying an active job: https://docs.bullmq.io/patterns/process-step-jobs
- BullMQ idempotent jobs: https://docs.bullmq.io/patterns/idempotent-jobs
- Redis persistence: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- Google OAuth/OIDC docs: https://developers.google.com/identity/protocols/oauth2
- Slack OAuth docs: https://api.slack.com/authentication/oauth-v2
- Slack `chat.postMessage`: https://api.slack.com/methods/chat.postMessage
- Elasticsearch JavaScript client: https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html
- Prisma docs: https://www.prisma.io/docs
- Bull Board: https://github.com/felixmosh/bull-board

Check the API behavior against the actual installed package versions; code examples from older versions can be incorrect.

## 24. Final self-review before declaring done

Before claiming completion, confirm and report truthfully:

- [ ] All mandatory technologies are present and actually used.
- [ ] No cron package/cron daemon is in code/config; email scheduling uses BullMQ delayed jobs.
- [ ] One DB email record and one idempotent delayed job exist per valid recipient.
- [ ] Actual Ethereal SMTP sends work with multiple configured senders.
- [ ] Future jobs survive API/worker restarts; Redis persistence and DB outbox/reconciliation have been tested/documented.
- [ ] Redis outage during schedule acceptance leaves recoverable work in PostgreSQL.
- [ ] Rate cap and send spacing are Redis/atomic and shared across worker replicas.
- [ ] Rate-limited jobs are rescheduled, not dropped; order behavior is documented.
- [ ] Real Slack OAuth and a real Slack message are verified when credentials/workspace access are supplied.
- [ ] Real Google OAuth is configured and verified when credentials are supplied.
- [ ] Elasticsearch indexes and serves authenticated, tenant-scoped email search.
- [ ] Bull Board shows actual queue states and is protected.
- [ ] Frontend fulfills all specified screens/fields/states and matches Figma as closely as access permits.
- [ ] Tests/typecheck/lint/build have run and outcomes are reported.
- [ ] README, `.env.example`, architecture/failure docs and demo script are complete.
- [ ] Known limitations (especially SMTP exactly-once ambiguity and local Redis single-node HA limitations) are explicit.

**Final agent response format:**
1. What was implemented.
2. Tests/checks actually run and results.
3. Exact commands to run locally.
4. Required external credentials/setup still needed.
5. Known limitations or incomplete assignment requirements.
6. File paths for architecture and demo documentation.

Do not state a feature is complete if it is only scaffolded, mocked, or awaiting credentials.
