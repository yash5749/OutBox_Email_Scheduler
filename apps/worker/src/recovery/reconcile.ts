import { randomUUID } from 'node:crypto';
import { EmailStatus, PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import Redis from 'ioredis';

const QUEUE_NAME = 'email-delivery';
const JOB_NAME = 'send-email';
const LOCK_KEY = 'reachinbox:email-delivery:reconcile-lock';
const LOCK_TTL_MS = 5 * 60 * 1000;
const SENDING_LEASE_MS = 2 * 60 * 1000;

export interface ReconcileResult {
  scanned: number;
  recreated: number;
  kept: number;
  staleSendingRecovered: number;
  skippedLocked: boolean;
}

export async function reconcileScheduledEmails(
  prisma: PrismaClient,
  queue: Queue,
  redis: Redis,
  config: { attempts: number; retryDelayMs: number; emailIds?: string[]; lockKey?: string },
  nowParam?: Date,
): Promise<ReconcileResult> {
  const now = nowParam ?? new Date();
  const result: ReconcileResult = {
    scanned: 0,
    recreated: 0,
    kept: 0,
    staleSendingRecovered: 0,
    skippedLocked: false,
  };

  const lockToken = randomUUID();
  const lockKey = config.lockKey ?? LOCK_KEY;
  const locked = await redis.set(lockKey, lockToken, 'PX', LOCK_TTL_MS, 'NX');
  if (locked !== 'OK') {
    result.skippedLocked = true;
    return result;
  }

  try {
    // 1. Recover emails stuck in 'SENDING' state due to worker crashes mid-send
    const expiredLease = new Date(now.getTime() - SENDING_LEASE_MS);
    const recovered = await prisma.scheduledEmail.updateMany({
      where: {
        status: EmailStatus.SENDING,
        ...(config.emailIds ? { id: { in: config.emailIds } } : {}),
        OR: [
          { processingLeaseUntil: { lte: now } },
          { processingLeaseUntil: null, updatedAt: { lte: expiredLease } },
        ],
      },
      data: {
        status: EmailStatus.SCHEDULED,
        processingLeaseUntil: null,
        lastErrorCode: 'WORKER_LEASE_EXPIRED',
        lastErrorMessage: 'Recovered after worker lease expired; delivery re-queued.',
      },
    });
    result.staleSendingRecovered = recovered.count;

    // 2. Fetch all SCHEDULED emails from DB
    const emails = await prisma.scheduledEmail.findMany({
      where: {
        status: EmailStatus.SCHEDULED,
        ...(config.emailIds ? { id: { in: config.emailIds } } : {}),
      },
      select: { id: true, scheduledAt: true },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    });
    result.scanned = emails.length;

    // 3. Batch process emails (25 at a time)
    for (let offset = 0; offset < emails.length; offset += 25) {
      const batch = emails.slice(offset, offset + 25);
      await Promise.all(
        batch.map(async (email) => {
          const jobId = `email-${email.id}`;
          const existingJob = await queue.getJob(jobId);

          if (existingJob) {
            const state = await existingJob.getState().catch(() => 'unknown');

            // If the job is active, or waiting/delayed in the future, leave it alone!
            if (state === 'active' || state === 'waiting' || state === 'delayed') {
              result.kept++;
              return;
            }

            // Clean up completed/failed/unknown job hashes before re-adding
            await existingJob.remove().catch(() => {});
          }

          // Calculate delay relative to the current scan timestamp
          const delay = Math.max(0, email.scheduledAt.getTime() - now.getTime());

          await queue.add(
            JOB_NAME,
            { emailId: email.id, schemaVersion: 1 },
            {
              jobId,
              delay,
              attempts: config.attempts,
              backoff: { type: 'exponential', delay: config.retryDelayMs },
            },
          );
          result.recreated++;
        }),
      );
    }

    return result;
  } finally {
    // Release the distributed Redis lock atomically
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      lockKey,
      lockToken,
    );
  }
}