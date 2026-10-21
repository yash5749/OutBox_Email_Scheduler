import 'dotenv/config';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { reconcileScheduledEmails } from '../recovery/reconcile.js';

function positiveInteger(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return parsed;
}

const env = {
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  EMAIL_JOB_ATTEMPTS: positiveInteger('EMAIL_JOB_ATTEMPTS', 5),
  EMAIL_RETRY_BASE_DELAY_MS: positiveInteger('EMAIL_RETRY_BASE_DELAY_MS', 5000),
};
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 200, 30000),
  connectionName: `reachinbox-reconciler-${process.pid}`,
});
const prisma = new PrismaClient();
const queue = new Queue('email-delivery', { connection: redis });

async function main(): Promise<void> {
  try {
    const result = await reconcileScheduledEmails(
      prisma,
      queue,
      redis,
      { attempts: env.EMAIL_JOB_ATTEMPTS, retryDelayMs: env.EMAIL_RETRY_BASE_DELAY_MS },
    );
    console.log(JSON.stringify(result));
  } finally {
    await queue.close();
    if (redis.status !== 'end') await redis.quit();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[Reconciler] Fatal error:', error);
  process.exitCode = 1;
});
