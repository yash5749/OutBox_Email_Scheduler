import { Queue } from 'bullmq';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { getEnv } from '../config/env';
import { OutboxEventType, OutboxEventStatus } from '@prisma/client';
import { esClient, indexEmail, ES_INDEX } from '../config/elasticsearch.js';
import { sendSlackAlert } from '../routes/slack.js';

const env = getEnv();

const QUEUE_NAME = 'email-delivery';
const JOB_NAME = 'send-email';
const PUBLISHER_LEASE_MS = 10 * 60 * 1000;
const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 5000;
const MAX_RETRIES = 10;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

let queue: Queue | null = null;
let isRunning = false;
let pollTimer: NodeJS.Timeout | null = null;

export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: redis, defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 } });
  }
  return queue;
}
function buildJobId(emailId: string): string {
  return `email-${emailId}`;
}

async function publishEmailJob(emailId: string, scheduledAt: Date): Promise<void> {
  const q = getQueue();
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());
  const jobId = buildJobId(emailId);

  await q.add(
    JOB_NAME,
    { emailId, reservedSendAt: 0 }, // 0 means not yet rate-limited; worker will reserve slot
    { jobId, delay, attempts: env.EMAIL_JOB_ATTEMPTS, backoff: { type: 'exponential', delay: env.EMAIL_RETRY_BASE_DELAY_MS } }
  );
}

async function processOutboxEvents(): Promise<void> {
  const now = new Date();

  try {
    const events = await prisma.$transaction(async (tx) => {
      const leaseUntil = new Date(Date.now() + PUBLISHER_LEASE_MS);
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        WITH candidates AS (
          SELECT id
          FROM outbox_events
          WHERE status = 'PENDING'
            AND (next_attempt_at IS NULL OR next_attempt_at <= ${now})
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${BATCH_SIZE}
        )
        UPDATE outbox_events AS event
        SET status = 'PROCESSING',
            attempts = event.attempts + 1,
            last_error = NULL,
            next_attempt_at = ${leaseUntil}
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING event.id
      `;
      if (claimed.length === 0) return [];
      return tx.outboxEvent.findMany({ where: { id: { in: claimed.map(event => event.id) } } });
    });

    for (const event of events) {
      try {
        switch (event.eventType) {
          case OutboxEventType.PUBLISH_EMAIL_JOB: {
            const { emailId, scheduledAt } = event.payload as { emailId: string; scheduledAt: string };
            await publishEmailJob(emailId, new Date(scheduledAt));
            break;
          }
          case OutboxEventType.INDEX_EMAIL: {
            const { emailId } = event.payload as { emailId: string };
            const email = await prisma.scheduledEmail.findUnique({ where: { id: emailId } });
            if (email) {
              await indexEmail({
                emailId: email.id,
                userId: email.userId,
                campaignId: email.campaignId,
                senderId: email.senderId,
                recipient: email.recipient,
                subject: email.subject,
                body: email.body,
                status: email.status,
                scheduledAt: email.scheduledAt,
                sentAt: email.sentAt,
                failedAt: email.failedAt,
                createdAt: email.createdAt,
                updatedAt: email.updatedAt,
              });
            }
            break;
          }
          case OutboxEventType.SLACK_RATE_LIMIT_ALERT: {
            const alert = event.payload as {
              senderId: string;
              senderName: string;
              hourWindow: string;
              limit: number;
              rescheduledCount: number;
            };
            await sendSlackAlert(
              alert.senderId,
              alert.senderName,
              new Date(alert.hourWindow),
              alert.limit,
              alert.rescheduledCount,
            );
            break;
          }
        }

        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: OutboxEventStatus.COMPLETED, publishedAt: new Date(), nextAttemptAt: null },
        });
      } catch (err) {
        const error = err as Error;
        // Queue publication is the only durable bridge from a committed
        // schedule request. Never dead-letter it merely because Redis stayed
        // down; keep retrying at a bounded rate until queue.add succeeds.
        const exhausted = event.eventType !== OutboxEventType.PUBLISH_EMAIL_JOB && event.attempts >= MAX_RETRIES;
        const nextAttempt = exhausted
          ? null
          : new Date(Date.now() + Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, Math.min(event.attempts, MAX_RETRIES)), MAX_RETRY_DELAY_MS));
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: exhausted ? OutboxEventStatus.FAILED : OutboxEventStatus.PENDING,
            lastError: error.message,
            nextAttemptAt: nextAttempt,
          },
        });
        console.error(`[OutboxPublisher] Failed to process event ${event.id}:`, error.message);
      }
    }
  } catch (err) {
    console.error('[OutboxPublisher] Batch processing error:', err);
  }
}

async function recoveryScan(): Promise<void> {
  console.log('[OutboxPublisher] Running recovery scan...');
  const now = new Date();

  const stuckEvents = await prisma.outboxEvent.findMany({
    where: {
      status: OutboxEventStatus.PROCESSING,
      OR: [
        { nextAttemptAt: { lte: now } },
        { nextAttemptAt: null, createdAt: { lt: new Date(now.getTime() - PUBLISHER_LEASE_MS) } },
      ],
    },
    take: BATCH_SIZE,
  });

  if (stuckEvents.length > 0) {
    const ids = stuckEvents.map(e => e.id);
    await prisma.outboxEvent.updateMany({
      where: {
        id: { in: ids },
        status: OutboxEventStatus.PROCESSING,
        OR: [
          { nextAttemptAt: { lte: now } },
          { nextAttemptAt: null, createdAt: { lt: new Date(now.getTime() - PUBLISHER_LEASE_MS) } },
        ],
      },
      data: { status: OutboxEventStatus.PENDING, nextAttemptAt: null, lastError: 'Publisher lease expired, re-queued' },
    });
    console.log(`[OutboxPublisher] Re-queued ${stuckEvents.length} stuck events`);
  }

  const pendingEvents = await prisma.outboxEvent.findMany({
    where: { status: OutboxEventStatus.PENDING },
    take: BATCH_SIZE,
  });

  if (pendingEvents.length > 0) {
    console.log(`[OutboxPublisher] Found ${pendingEvents.length} pending events to process`);
  }
}

export async function startOutboxPublisher(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  await recoveryScan();

  const poll = async () => {
    if (!isRunning) return;
    try {
      await recoveryScan();
      await processOutboxEvents();
    } catch (err) {
      console.error('[OutboxPublisher] Poll error:', err);
    }
    pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
  };

  void poll();
  console.log('[OutboxPublisher] Started');
}

export async function stopOutboxPublisher(): Promise<void> {
  isRunning = false;
  if (pollTimer) clearTimeout(pollTimer);
  if (queue) {
    await queue.close();
    queue = null;
  }
  console.log('[OutboxPublisher] Stopped');
}
