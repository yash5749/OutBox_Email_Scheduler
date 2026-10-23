# ReachInbox Email Scheduler

A production-minded full-stack email scheduling application built with TypeScript, Node.js, Express, BullMQ, PostgreSQL, Elasticsearch, and Next.js.
# NOTE
This project can’t be reliably hosted completely free. It needs an always-on API and background worker, persistent PostgreSQL and Redis, and Elasticsearch. Free hosting tiers may sleep or don’t provide all of those services, so scheduled emails might not run reliably. The frontend may fit on a free Vercel tier, but the full application requires paid hosting for dependable operation.

## Features

- ✅ Google OAuth authentication
- ✅ CSV/text lead list import with validation
- ✅ Email campaign scheduling with BullMQ delayed jobs
- ✅ Per-sender rate limiting (hourly cap + minimum spacing)
- ✅ Real Ethereal SMTP delivery
- ✅ Elasticsearch-powered search
- ✅ Slack OAuth integration with rate-limit notifications
- ✅ Bull Board queue dashboard (admin-only)
- ✅ Transactional outbox for reliability
- ✅ Reconciler for queue recovery
- ✅ Responsive dashboard matching Figma design

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend API | TypeScript, Node.js, Express.js |
| Queue/Scheduling | BullMQ + Redis (delayed jobs) |
| Database | PostgreSQL + Prisma ORM |
| SMTP | Nodemailer + Ethereal Email |
| Search | Elasticsearch |
| Queue Dashboard | Bull Board |
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Auth | Google OAuth 2.0 / OIDC |
| Notifications | Slack OAuth + Web API |
| Infrastructure | Docker Compose |

## Architecture

See [docs/architecture.md](docs/architecture.md) for detailed architecture diagram and component responsibilities.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- Google Cloud OAuth credentials
- Slack App credentials
- Ethereal Email accounts

### 1. Clone and Install

```bash
git clone <repo-url>
cd reachinbox_agent_kit
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ELASTICSEARCH_URL` | Elasticsearch connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | OAuth callback URL (e.g., `http://localhost:4000/api/auth/google/callback`) |
| `SESSION_SECRET` | 32+ char random string (`openssl rand -base64 32`) |
| `SLACK_CLIENT_ID` | Slack App client ID |
| `SLACK_CLIENT_SECRET` | Slack App client secret |
| `SLACK_CALLBACK_URL` | Slack OAuth callback URL |
| `TOKEN_ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`) |
| `BULL_BOARD_ADMIN_EMAILS` | Comma-separated admin emails for queue dashboard |

### 3. Start Infrastructure

```bash
pnpm run dev:infra
```

This starts PostgreSQL, Redis, and Elasticsearch via Docker Compose.

### 4. Database Setup

```bash
pnpm run db:migrate
pnpm run db:seed
```

### 5. Start Development Servers

```bash
# Terminal 1: API
pnpm run dev:api

# Terminal 2: Worker
pnpm run dev:worker

# Terminal 3: Frontend
pnpm run dev:web
```

Or start all at once:

```bash
pnpm run dev
```

### 6. Access Applications

- **Frontend**: http://localhost:3000
- **API**: http://localhost:4000
- **Bull Board** (admin only): http://localhost:4000/admin/queues
- **API Health**: http://localhost:4000/health/ready

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID (Web application)
3. Authorized redirect URIs:
   - `http://localhost:4000/api/auth/google/callback`
4. Add test users in OAuth consent screen
5. Copy Client ID and Secret to `.env`

## Slack App Setup

1. Go to [Slack API](https://api.slack.com/apps) → Create New App → From scratch
2. OAuth & Permissions → Scopes:
   - `chat:write`
   - `channels:read`
   - `groups:read`
   - `im:read`
   - `mpim:read`
3. Redirect URLs: `http://localhost:4000/api/integrations/slack/callback`
4. Install to workspace
5. Copy Client ID and Secret to `.env`

## Ethereal Email Setup

1. Go to [Ethereal Email](https://ethereal.email/create)
2. Create 2+ accounts
3. Run `pnpm run db:seed` to populate senders, or manually add via API

## API Documentation

See [docs/api.md](docs/api.md) for complete API reference.

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/google` | Start Google OAuth |
| `GET` | `/api/auth/me` | Get current user |
| `POST` | `/api/auth/logout` | Logout |
| `GET` | `/api/senders` | List user's senders |
| `POST` | `/api/emails/schedule` | Schedule emails |
| `GET` | `/api/emails` | List emails |
| `GET` | `/api/emails/search` | Search emails (Elasticsearch) |
| `GET` | `/api/integrations/slack/connect` | Start Slack OAuth |
| `GET` | `/api/integrations/slack/status` | Slack connection status |
| `GET` | `/health/live` | Liveness probe |
| `GET` | `/health/ready` | Readiness probe |

## Rate Limiting

- **Per-sender hourly cap**: `MAX_EMAILS_PER_HOUR_PER_SENDER` (default 200)
- **Minimum spacing**: `MIN_DELAY_BETWEEN_EMAILS_MS` (default 2000ms)
- **UTC fixed-hour windows** and an atomic Redis Lua reservation enforce caps and spacing across worker replicas
- Rate-limited jobs are returned to BullMQ's delayed state and retain their reservation timestamp
- Worker concurrency comes from `WORKER_CONCURRENCY` (default 10)
- When a connected Slack workspace exists, the first skipped full-hour window creates a durable, deduplicated alert event

## Reliability Features

### Transactional Outbox
- Email records + outbox events created in single PostgreSQL transaction
- API returns `202 Accepted` after DB commit (Redis can be down)
- Outbox publisher atomically claims rows with PostgreSQL `SKIP LOCKED`, leases processing rows, and retries with exponential backoff
- API can start and accept durable scheduling requests while Redis is unavailable; publishing resumes after Redis reconnects

### Job Persistence
- Deterministic BullMQ job IDs: `email-${emailId}`
- Redis configured with AOF persistence (`--appendonly yes`)
- `maxmemory-policy noeviction` prevents job loss

### Reconciliation
- Worker scans PostgreSQL every 30 seconds and recreates missing, completed, failed, or orphaned BullMQ jobs for `SCHEDULED` emails
- Skips live queue jobs and never queues `SENT`/`CANCELLED` records
- Expired `SENDING` leases return to `SCHEDULED` and are queued again; SMTP accept-then-crash remains ambiguous and may produce a duplicate
- A Redis lock prevents multiple worker replicas from reconciling at the same time
- Run a one-shot recovery scan manually with `pnpm --filter @reachinbox/worker run reconcile`

### Idempotency
- Unique `idempotencyKey` per email (DB constraint)
- Client can provide `Idempotency-Key` header for safe retries
- Deterministic job IDs prevent duplicate queue entries

### SMTP Exactly-Once Caveat
**There is no universal exactly-once SMTP guarantee.** The ambiguity window:
1. SMTP provider accepts message (250 OK)
2. Worker crashes before persisting `SENT` status

Mitigations implemented:
1. Unique DB `idempotencyKey`
2. Deterministic BullMQ job IDs
3. Pre-send DB status check (skip `SENT`/`CANCELLED`)
4. Atomic status transitions with lease
5. Stable `Message-ID` header
6. Documented limitation — no false claims

## Testing

```bash
# Unit tests
pnpm test

# Integration tests (requires infrastructure)
pnpm test:integration

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

### Test Coverage

- Worker recovery policy unit tests for live, terminal, missing, and orphaned queue states
- Redis integration tests for concurrent hourly caps, minimum spacing, sender isolation, and future-window key retention
- PostgreSQL/BullMQ integration test for replacing terminal jobs, recreating missing jobs, and recovering an expired `SENDING` lease
- Full SMTP delivery, API restart/outage, OAuth, Slack, Elasticsearch, and Bull Board end-to-end scenarios still require separate configured verification

## Production Deployment

### Vercel frontend + Render API and worker

The repository includes a Render Blueprint at [render.yaml](render.yaml) for the API, BullMQ worker, PostgreSQL and Redis. Render does not provide Elasticsearch in this Blueprint, so create an Elasticsearch-compatible hosted deployment (for example Elastic Cloud) and supply its URL and credentials to both Render services.

This setup cannot be fully provisioned with one command because first-time deployments require your Render/Vercel accounts, OAuth app secrets and an Elasticsearch endpoint. After the initial Render Blueprint has created the services and you have set their environment values, frontend deployments can be run with one command:

```bash
pnpm deploy:vercel
```

The script prompts for the public Render API URL, links `apps/web` to a Vercel project, updates the production `NEXT_PUBLIC_API_URL`, and deploys. It requires the Vercel CLI and an authenticated Vercel account (`pnpm add --global vercel`, then `vercel login`). In Vercel project settings, set the Root Directory to `apps/web` and enable **Include source files outside of the Root Directory** so the pnpm workspace and `packages/shared` are available to the build.

#### First-time Render setup

1. Push this repository to a Git provider supported by Render and create a new Blueprint from the repository. Review the resources and their pricing before confirming; the Blueprint uses paid Render service plans for the always-on API, worker and Redis.
2. Supply the requested secrets and URLs. Create an Elasticsearch service separately. `TOKEN_ENCRYPTION_KEY` must be 64 hex characters (`openssl rand -hex 32`); `SESSION_SECRET` is generated by Render.
3. After Render creates the API, set `API_BASE_URL` to its `https://...onrender.com` URL and set `GOOGLE_CALLBACK_URL` to `<API_BASE_URL>/api/auth/google/callback` and `SLACK_CALLBACK_URL` to `<API_BASE_URL>/api/integrations/slack/callback`. Set Google and Slack OAuth redirect URLs to the same values in their provider consoles.
4. Deploy the frontend with `pnpm deploy:vercel`. Copy its production URL into the Render API's `WEB_URL`, then redeploy the API. Add that Vercel URL to the Google OAuth authorized JavaScript origins.
5. Check `<API_BASE_URL>/health/ready`, then sign in and verify a schedule/send flow. Set `BULL_BOARD_ADMIN_EMAILS` as needed for your operations setup.

The browser uses cross-site credentialed requests between Vercel and Render. Production session cookies are therefore `Secure` and `SameSite=None`; browser privacy settings may restrict third-party cookies. A custom domain arrangement under one registrable domain is preferable for production.

Use a hosted PostgreSQL and Redis with persistence for real workloads. The Render Blueprint creates Render-managed instances, but Redis remains a single instance and is not a high-availability queue. The worker performs actual Ethereal SMTP sends; configure sender accounts/credentials in the database before scheduling. Do not run the development seed blindly in production.

For repeat frontend deploys, run `pnpm deploy:vercel`; for API and worker changes, Render deploys from the connected Git repository according to the Blueprint's auto-deploy setting.

### Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Environment Variables

All variables from `.env.example` plus:
- `NODE_ENV=production`
- Secure `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`
- Production Google/Slack OAuth credentials
- Managed PostgreSQL, Redis, Elasticsearch URLs

### Redis HA

Local Docker Redis is **single-node, not HA**. For production:
- Use managed Redis (AWS ElastiCache, Azure Cache, etc.)
- Enable replication with appropriate persistence
- Understand acknowledged-write-loss windows

### Secrets Management

- Never commit `.env`
- Use external secret manager (AWS Secrets Manager, HashiCorp Vault)
- Rotate `TOKEN_ENCRYPTION_KEY` with versioned ciphertext

## Project Structure

```
.
├── apps/
│   ├── api/           # Express REST API
│   ├── worker/        # Background worker
│   └── web/           # Next.js frontend
├── packages/
│   └── shared/        # Shared types, schemas
├── prisma/
│   ├── schema.prisma  # Database schema
│   └── seed.ts        # Seed script
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── failure-modes.md
│   └── demo-script.md
└── docker-compose.yml
```


## License

MIT
