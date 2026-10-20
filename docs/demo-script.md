# ReachInbox Demo Script (Max 5 Minutes)

## Prerequisites (Setup Before Recording)

1. **Google Cloud Console**: OAuth client configured
   - Authorized redirect: `http://localhost:4000/api/auth/google/callback`
   - Test user added to OAuth consent screen

2. **Slack App**: Created and installed to workspace
   - Redirect: `http://localhost:4000/api/integrations/slack/callback`
   - Scopes: `chat:write`, `channels:read`, `groups:read`
   - Bot token stored after connect

3. **Ethereal Accounts**: 2+ accounts created at https://ethereal.email/create
   - Credentials added to `.env` or seeded via `pnpm run db:seed`

4. **Infrastructure Running**:
   ```bash
   pnpm run dev:infra
   pnpm run db:migrate
   pnpm run db:seed
   ```

5. **Applications Running** (3 terminals):
   ```bash
   pnpm run dev:api    # Terminal 1 - API on :4000
   pnpm run dev:worker # Terminal 2 - Worker
   pnpm run dev:web    # Terminal 3 - Next.js on :3000
   ```

---

## Demo Flow (5 Minutes)

### 0:00-0:30 — Google OAuth Login
1. Open `http://localhost:3000`
2. Click "Sign in with Google"
3. Complete consent screen (test account)
4. Redirected to dashboard; header shows name, email, avatar, logout

### 0:30-1:30 — Compose & Schedule Campaign
1. Click "Compose New Email" (primary CTA)
2. Fill form:
   - **Subject**: "Welcome to ReachInbox Demo"
   - **Body**: "Hi {{email}}, this is a scheduled email..."
   - **Upload CSV**: Drag/drop `leads.csv` (100 rows, 5 invalid, 3 duplicates)
   - **Preview shows**: "92 valid, 5 invalid, 3 duplicates"
   - **Sender**: Select "Demo Sender 1"
   - **Start time**: 2 minutes from now (show timezone picker)
   - **Min delay**: 2000ms
   - **Hourly limit**: 10 (low for demo)
3. Click "Schedule"
4. Toast: "92 emails scheduled"
5. Navigate to **Scheduled Emails** tab — table loads with 92 rows

### 1:30-2:30 — Bull Board & Queue Inspection
1. Open new tab: `http://localhost:4000/admin/queues` (admin user)
2. Show **email-delivery** queue:
   - **Delayed**: 92 jobs with future timestamps
   - Job IDs: `email-{uuid}` (deterministic)
   - Click one job → show payload `{ emailId, reservedSendAt }`
3. Explain: "No cron. Each email = one delayed BullMQ job."

### 2:30-3:30 — Process Restart & Persistence
1. **Stop API + Worker** (Ctrl+C in terminals 1 & 2)
2. **Restart both**: `pnpm run dev:api` && `pnpm run dev:worker`
3. Refresh **Scheduled Emails** — all 92 still there
4. Refresh Bull Board — delayed jobs still present (Redis persisted)
5. Explain: "PostgreSQL = source of truth. Redis + AOF = job persistence."

### 3:30-4:15 — Live Sending & Rate Limiting
1. Wait for start time (2 min from schedule)
2. Watch **Scheduled Emails** → **Sent Emails** tab
3. Emails appear in Sent at ~2sec intervals (min delay)
4. After 10 sent (hourly limit), next jobs **rescheduled** to next hour
5. Show Bull Board: jobs moved from Delayed → Active → Completed
6. Show rate-limit reschedule in logs: "Hourly limit reached, rescheduled to next window"

### 4:15-4:45 — Slack Notification
1. Ensure Slack connected (Settings → Connect Slack)
2. Trigger rate limit again (or wait for next hour window)
3. Show Slack channel: "⚠️ Sender 'Demo Sender 1' hit hourly limit (10/hr). 82 emails rescheduled to 2024-01-15T11:00:00Z"
4. Explain: "Real Slack API call. Idempotent per sender/hour. Safe if disconnected."

### 4:45-5:00 — Search & Wrap Up
1. Dashboard search box: type recipient domain → filters instantly (Elasticsearch)
2. Filter by status: Failed (show 0), Sent (show 10+)
3. Click email row → detail modal with provider metadata
4. Logout → confirms session destroyed

---

## Recording Tips

- **Resolution**: 1920x1080 minimum
- **Browser**: Chrome/Edge with DevTools closed
- **Zoom**: 100% or slight zoom for readability
- **Narration**: Explain *why* not just *what*
- **Pauses**: 2-3 seconds between major transitions

---

## Post-Demo Verification Checklist

- [ ] Google OAuth works end-to-end
- [ ] CSV validation matches backend (92/5/3)
- [ ] Scheduled emails persist API+Worker restart
- [ ] Redis persistence verified (jobs survive restart)
- [ ] Rate limiting: 10/hr enforced, excess rescheduled
- [ ] Minimum 2sec spacing visible in sent timestamps
- [ ] Slack message received in channel
- [ ] Elasticsearch search returns results
- [ ] Bull Board accessible only to admin
- [ ] No console errors in browser/API/worker

---

## Fallback If Live Demo Fails

| Issue | Fallback |
|-------|----------|
| Google OAuth not configured | Show code flow in `docs/api.md`; demonstrate with seeded user |
| Slack not connected | Show "Connect Slack" UI; explain flow; show test webhook |
| Ethereal not delivering | Show worker logs + Ethereal preview URL in DB |
| Redis data lost on restart | Explain AOF config; show reconciler recreates jobs |
| Time pressure | Pre-record segments; stitch with narration |

---

## Repository Access for Reviewers

**Required**: Grant access to private GitHub repo for:
- **Mitrajit**
- **Yadav036**

Do not guess usernames. Provide exact handles to human for invitation.