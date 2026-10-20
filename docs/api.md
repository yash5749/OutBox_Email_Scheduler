# ReachInbox API Documentation

Base URL: `http://localhost:4000` (development)

All endpoints require authentication unless noted. Send session cookie or `Authorization: Bearer <token>`.

## Common Response Format

### Success
```json
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "uuid", "timestamp": "ISO8601" }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": [{ "field": "recipients", "message": "Invalid email format" }]
  },
  "meta": { "requestId": "uuid", "timestamp": "ISO8601" }
}
```

## Authentication

### `GET /api/auth/google`
Initiates Google OAuth flow. Redirects to Google consent screen.

### `GET /api/auth/google/callback`
Google OAuth callback. Validates state, exchanges code, upserts user, creates session cookie.
**Redirects to**: `WEB_URL` (frontend) on success.

### `GET /api/auth/me`
Returns current authenticated user.
```json
{
  "id": "uuid",
  "googleSubject": "google-sub",
  "email": "user@example.com",
  "name": "User Name",
  "avatarUrl": "https://...",
  "role": "USER",
  "createdAt": "ISO8601"
}
```

### `POST /api/auth/logout`
Invalidates session, clears cookie.

---

## Senders

### `GET /api/senders`
Lists senders available to current user.
```json
[
  {
    "id": "uuid",
    "displayName": "Sender Name",
    "fromEmail": "sender@ethereal.email",
    "isActive": true,
    "hourlyLimit": 200,
    "minDelayMs": 2000
  }
]
```

---

## Campaigns

### `POST /api/campaigns`
Creates a campaign.
```json
// Request
{
  "name": "Q4 Outreach",
  "senderId": "uuid",
  "subject": "Hello {{firstName}}",
  "body": "Body text...",
  "startAt": "2024-01-15T10:00:00Z",
  "minDelayBetweenEmailsMs": 2000,
  "maxEmailsPerHour": 200
}

// Response
{
  "id": "uuid",
  "name": "Q4 Outreach",
  "status": "DRAFT",
  "createdAt": "ISO8601"
}
```

### `GET /api/campaigns`
Lists campaigns for current user (paginated).

### `GET /api/campaigns/:id`
Gets campaign details with email stats.

---

## Email Scheduling

### `POST /api/emails/schedule`
Schedules emails from CSV/text upload or direct recipient list.
**Idempotency**: Provide `Idempotency-Key` header to safely retry.

```json
// Request (multipart/form-data or JSON)
{
  "campaignId": "uuid",           // optional
  "senderId": "uuid",             // required
  "subject": "Hello",             // required if no campaignId
  "body": "Body text",            // required if no campaignId
  "recipients": ["a@b.com"],      // OR use file upload
  "startAt": "2024-01-15T10:00:00Z",  // ISO8601 UTC
  "minDelayBetweenEmailsMs": 2000,
  "maxEmailsPerHour": 200
}
```

**CSV Format**: Header row with `email` (case-insensitive). Additional columns ignored.
**Text Format**: One email per line.

```json
// Response (202 Accepted)
{
  "campaignId": "uuid",
  "scheduledCount": 95,
  "invalidCount": 3,
  "duplicateCount": 2,
  "invalidRows": [
    { "row": 5, "email": "not-an-email", "reason": "INVALID_FORMAT" }
  ],
  "duplicateEmails": ["dup@test.com"]
}
```

### `GET /api/emails`
Lists scheduled/sent/failed emails for current user.
**Query params**:
- `status`: `SCHEDULED` | `SENDING` | `SENT` | `FAILED` | `CANCELLED` (default: `SCHEDULED`)
- `cursor`: pagination cursor (opaque string)
- `limit`: page size (default: 50, max: 200)
- `senderId`: filter by sender
- `campaignId`: filter by campaign

```json
{
  "items": [
    {
      "id": "uuid",
      "recipient": "lead@example.com",
      "subject": "Hello",
      "status": "SCHEDULED",
      "scheduledAt": "2024-01-15T10:00:00Z",
      "sender": { "id": "uuid", "displayName": "Sender 1", "fromEmail": "s@e.com" },
      "campaignId": "uuid"
    }
  ],
  "nextCursor": "opaque-string",
  "hasMore": true
}
```

### `GET /api/emails/:id`
Gets email details including attempt history.

### `POST /api/emails/:id/cancel`
Cancels a scheduled email (only if `SCHEDULED`).
Removes/neutralizes BullMQ job.

### `GET /api/emails/search`
Searches emails via Elasticsearch.
**Query params**:
- `q`: search query (subject, body, recipient)
- `status`: filter by status
- `senderId`: filter by sender
- `campaignId`: filter by campaign
- `from`: ISO8601 date range start
- `to`: ISO8601 date range end
- `cursor`, `limit`: pagination

```json
{
  "items": [ ... ],
  "nextCursor": "...",
  "hasMore": true,
  "totalHits": 1234
}
```

---

## Slack Integration

### `GET /api/integrations/slack/connect`
Initiates Slack OAuth. Redirects to Slack install page.

### `GET /api/integrations/slack/callback`
Slack OAuth callback. Exchanges code, encrypts/stores bot token.

### `GET /api/integrations/slack/status`
Returns connection status (no token).
```json
{
  "connected": true,
  "teamName": "Acme Corp",
  "teamId": "T123456",
  "channelId": "C123456",
  "channelName": "#general",
  "connectedAt": "ISO8601"
}
```

### `POST /api/integrations/slack/disconnect`
Revokes token, marks connection inactive.

---

## Health & Operations

### `GET /health/live`
Liveness probe. Returns `200 OK` if process alive.

### `GET /health/ready`
Readiness probe. Checks PostgreSQL, Redis, Elasticsearch connectivity.
Returns `200` if all healthy, `503` with details if degraded.

### `GET /admin/queues` (Admin only)
Bull Board dashboard. Protected by `requireAdmin` middleware.

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHENTICATED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Insufficient permissions (e.g., non-admin on Bull Board) |
| `NOT_FOUND` | 404 | Resource not found or not owned by user |
| `VALIDATION_ERROR` | 400 | Request body/query invalid |
| `CONFLICT` | 409 | Idempotency key already used |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Dependency down (PG, Redis, ES) |

---

## Rate Limits (API Layer)

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/*` | 10/min/IP |
| `POST /api/emails/schedule` | 30/min/user |
| `GET /api/emails/search` | 60/min/user |
| All other | 120/min/user |

---

## Webhooks (Future)

Not implemented in MVP. Planned for delivery status callbacks.