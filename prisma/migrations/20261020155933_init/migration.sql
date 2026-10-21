-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OutboxEventType" AS ENUM ('PUBLISH_EMAIL_JOB', 'INDEX_EMAIL', 'SLACK_RATE_LIMIT_ALERT');

-- CreateEnum
CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SlackConnectionStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'REVOKED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "google_subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "senders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "smtp_host" TEXT NOT NULL,
    "smtp_port" INTEGER NOT NULL,
    "smtp_user" TEXT NOT NULL,
    "smtp_password_encrypted" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "hourly_limit" INTEGER,
    "min_delay_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "name" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "min_delay_between_emails_ms" INTEGER NOT NULL,
    "max_emails_per_hour" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_emails" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "sender_id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "provider_message_id" TEXT,
    "provider_response" JSONB,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "processing_lease_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "event_type" "OutboxEventType" NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "team_name" TEXT NOT NULL,
    "bot_user_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "channel_name" TEXT NOT NULL,
    "bot_token_encrypted" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "SlackConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slack_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slack_alerts" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "hour_window" TIMESTAMP(3) NOT NULL,
    "alert_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "slackResponse" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "slack_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_subject_key" ON "users"("google_subject");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "senders_user_id_is_active_idx" ON "senders"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "campaigns_user_id_idx" ON "campaigns"("user_id");

-- CreateIndex
CREATE INDEX "campaigns_sender_id_idx" ON "campaigns"("sender_id");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_emails_idempotency_key_key" ON "scheduled_emails"("idempotency_key");

-- CreateIndex
CREATE INDEX "scheduled_emails_user_id_status_scheduled_at_idx" ON "scheduled_emails"("user_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "scheduled_emails_sender_id_status_scheduled_at_idx" ON "scheduled_emails"("sender_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "scheduled_emails_status_scheduled_at_idx" ON "scheduled_emails"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "scheduled_emails_campaign_id_idx" ON "scheduled_emails"("campaign_id");

-- CreateIndex
CREATE INDEX "scheduled_emails_recipient_idx" ON "scheduled_emails"("recipient");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_attempt_at_idx" ON "outbox_events"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "outbox_events_event_type_status_idx" ON "outbox_events"("event_type", "status");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_id_idx" ON "outbox_events"("aggregate_id");

-- CreateIndex
CREATE UNIQUE INDEX "slack_connections_user_id_key" ON "slack_connections"("user_id");

-- CreateIndex
CREATE INDEX "slack_connections_team_id_idx" ON "slack_connections"("team_id");

-- CreateIndex
CREATE INDEX "slack_alerts_status_created_at_idx" ON "slack_alerts"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "slack_alerts_sender_id_hour_window_alert_type_key" ON "slack_alerts"("sender_id", "hour_window", "alert_type");

-- AddForeignKey
ALTER TABLE "senders" ADD CONSTRAINT "senders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "senders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "senders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_aggregate_id_fkey" FOREIGN KEY ("aggregate_id") REFERENCES "scheduled_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slack_connections" ADD CONSTRAINT "slack_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
