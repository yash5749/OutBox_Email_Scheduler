# Master Prompt — ReachInbox Email Scheduler Assignment

You are the senior engineer responsible for implementing the ReachInbox full-stack email scheduler in this repository. Start by reading `AGENTS.md` completely. It contains the detailed architecture, acceptance criteria, phase plan, schema requirements, security requirements, and test matrix. Treat it as the source of truth.

## Your execution instructions

1. Inspect the repository and `git status` first. Preserve existing work. Do not overwrite files blindly.
2. Implement every phase in `AGENTS.md` sequentially, from Phase 0 through Phase 11. Do not stop after scaffolding or a UI prototype.
3. Use TypeScript + Express, BullMQ + Redis delayed jobs, PostgreSQL + Prisma, Ethereal SMTP, Elasticsearch, Bull Board, and Next.js/React + Tailwind. Implement real Google OAuth and Slack OAuth; do not fake either integration.
4. Do not use cron, `node-cron`, `node-schedule`, Agenda, OS crontab, or in-memory timers to schedule individual emails. Email timing must use BullMQ delayed jobs. Long-running outbox/reconciliation services are permitted only for recovery/publication, not as an email timer substitute.
5. Build the reliability path first: PostgreSQL email records + transactional outbox; resilient outbox publisher; deterministic BullMQ job IDs; worker status/idempotency guard; Redis persistence; recovery/reconciliation; then rate limiting and UI.
6. Enforce worker concurrency, minimum spacing and per-sender hourly limits atomically across replicas using Redis-backed logic. Rate-limit hits must reschedule jobs rather than drop or permanently fail them. Deduplicate Slack alerts per sender/hour, and send a real Slack `chat.postMessage` call when connected.
7. Make email indexing into Elasticsearch reliable but non-blocking for SMTP sends. Secure search by authenticated user/tenant. Protect Bull Board behind admin authorization.
8. Use actual Ethereal SMTP transports for multiple senders. Never log credentials or expose tokens to the browser.
9. After each phase, run relevant tests, typecheck/lint and build; fix errors before moving on. Update README checklists and documentation as you proceed. Do not claim unverified features are complete.
10. Add tests for duplicate scheduling, delayed execution, worker/API restarts, Redis outage and recovery, multiple worker replicas, rate limits, Slack-unconnected behavior, Elasticsearch failure/reindexing, auth scoping and Bull Board authorization.
11. Read official BullMQ documentation for the installed version before implementing moving active jobs to delayed state, Redis connections, rate limiting and retry behavior. Do not copy outdated APIs without checking.
12. Configure `.env.example`, Docker Compose, migrations, seeds, `/health/live`, `/health/ready`, graceful shutdown, structured safe logging and clear local run scripts.
13. Implement the frontend against the provided Figma frame: https://www.figma.com/design/kOTwGlESjijCYnMgtHfvfU/Outbox-Labs-Assignment?node-id=59-4050&p=f&m=dev. Include Google login; name/email/avatar/logout; Scheduled and Sent views; search; compose; CSV/text upload/preview and valid email count; sender selection; start time/timezone; delay; hourly cap; loading/empty/error states; Slack connect/disconnect.
14. Write a complete README, `docs/architecture.md`, `docs/failure-modes.md`, `docs/api.md`, and `docs/demo-script.md`. The README must document OAuth/Ethereal/Slack setup, commands, restart recovery, rate-limit behavior, assumptions, trade-offs and how to record the maximum-5-minute demo.
15. The assignment requires a private GitHub repo and access for Mitrajit and Yadav036. Remind the human to grant access; do not invite guessed accounts or pretend you have done this.

## Critical correctness requirements

- PostgreSQL is the source of truth; Redis/BullMQ is the job execution system; Elasticsearch is a search index only.
- Creating the email and its outbox event must be one DB transaction. The API may return accepted only after the DB transaction commits. Redis being unavailable must not permanently lose an accepted email.
- A reconciler must be able to recreate missing jobs for nonterminal emails after queue data loss. It must skip SENT/CANCELLED jobs.
- Redis should use suitable persistence and `maxmemory-policy noeviction`; document that local single-node Redis is not high availability.
- SMTP has an unavoidable accept-then-crash ambiguity without provider idempotency. Implement DB idempotency, deterministic job IDs, safe state transitions and stable Message-ID where possible. Explicitly document the limit instead of falsely claiming universal exactly-once delivery.
- Per-sender rate allocation must be atomic across workers. Use a tested Redis Lua script or similarly atomic primitive; don't rely on process-local counters or on old BullMQ group-key examples that may not exist in the selected version.
- Store future slot reservations in durable job data before moving a job to delayed state. Use the installed BullMQ version's correct lock token and documented `DelayedError` handling.
- If Slack is disconnected, rate-limit handling must still reschedule email safely and must not throw. If Slack is connected, notify the real configured channel and make the alert idempotent/retryable. Reconnects must work without a redeploy.
- An Elasticsearch outage must never cause a successful SMTP send to be repeated solely because indexing failed.
- Every query and search result must be scoped to the authenticated user/tenant; credentials must never be returned.

## Working cadence and final report

Start now with Phase 0. Give a concise initial plan, then implement. If external credentials are missing, continue building the real integration and its automated tests; document exact manual setup needed, but never replace it with a mock in shipped code. At the end of each phase, summarize progress and test results.

When done, provide an accurate final report containing implemented features, tests/commands with actual outcomes, local run instructions, remaining credentials/manual steps, incomplete requirements and known limitations. Do not say tests passed unless you ran them.
