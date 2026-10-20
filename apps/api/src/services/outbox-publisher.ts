import { Queue } from 'bullmq';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { getEnv } from '../config/env';
import { OutboxEventType, OutboxEventStatus } from '@prisma/client';

const env = getEnv();

const QUEUE_NAME = 'email-delivery';
const JOB_NAME = 'send-email';
const PUBLISHER_LEASE_MS = 30000;
const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 5000;
const MAX_RETRIES = 10;
const BASE_RETRY_DELAY_MS = 1000;

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
    { emailId, reservedSendAt: scheduledAt.getTime() },
    { jobId, delay, attempts: env.EMAIL_JOB_ATTEMPTS, backoff: { type: 'exponential', delay: env.EMAIL_RETRY_BASE_DELAY_MS } }
  );
}

async function processOutboxEvents(): Promise<void> {
  const leaseId = `publisher-${process.pid}-${Date.now()}`;
  const now = new Date();

  try {
    const events = await prisma.$transaction(async (tx) => {
      const pending = await tx.outboxEvent.findMany({
        where: {
          status: OutboxEventStatus.PENDING,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });

      if (pending.length === 0) return [];

      const ids = pending.map(e => e.id);
      await tx.outboxEvent.updateMany({
        where: { id: { in: ids } },
        data: { status: OutboxEventStatus.PROCESSING, attempts: { increment: 1 }, lastError: null },
      });

      return pending;
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
            // Handled by separate indexing worker
            break;
          }
          case OutboxEventType.SLACK_RATE_LIMIT_ALERT: {
            // Handled by separate alert worker
            break;
          }
        }

        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: OutboxEventStatus.COMPLETED, publishedAt: new Date() },
        });
      } catch (err) {
        const error = err as Error;
        const nextAttempt = new Date(Date.now() + BASE_RETRY_DELAY_MS * Math.pow(2, Math.min(event.attempts, MAX_RETRIES)));
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: event.attempts >= MAX_RETRIES ? OutboxEventStatus.FAILED : OutboxEventStatus.PENDING,
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
      createdAt: { lt: new Date(now.getTime() - PUBLISHER_LEASE_MS) },
    },
    take: BATCH_SIZE,
  });

  if (stuckEvents.length > 0) {
    const ids = stuckEvents.map(e => e.id);
    await prisma.outboxEvent.updateMany({
      where: { id: { in: ids } },
      data: { status: OutboxEventStatus.PENDING, lastError: 'Publisher lease expired, re-queued' },
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

  await connectRedis();
  await recoveryScan();

  const poll = async () => {
    if (!isRunning) return;
    try {
      await processOutboxEvents();
    } catch (err) {
      console.error('[OutboxPublisher] Poll error:', err);
    }
    pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
  };

  pollTimer = setTimeout(poll, 100);
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

async function connectRedis(): Promise<void> {
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      await redis.ping();
      return;
    } catch {
      retries++;
      const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retries), 30000);
      console.warn(`[OutboxPublisher] Redis connection failed, retrying in ${delay}ms (attempt ${retries}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('[OutboxPublisher] Failed to connect to Redis after max retries');
}