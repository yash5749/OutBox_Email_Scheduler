import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { indexEmail, deleteEmail } from '../config/elasticsearch.js';
import { OutboxEventType, OutboxEventStatus } from '@prisma/client';

const env = {
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
};

let redisWorker: Redis | null = null;

function getRedis(): Redis {
  if (!redisWorker) {
    redisWorker = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
      connectionName: `reachinbox-indexer-${process.pid}`,
    });
  }
  return redisWorker;
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

const QUEUE_NAME = 'email-indexing';

const indexerWorker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { emailId } = job.data as { emailId: string };

    const email = await prisma.scheduledEmail.findUnique({
      where: { id: emailId },
      include: { sender: true, campaign: true },
    });

    if (!email) {
      console.warn(`[Indexer] Email not found: ${emailId}`);
      return;
    }

    if (email.status === 'CANCELLED') {
      await deleteEmail(emailId);
      return;
    }

    const doc = {
      emailId: email.id,
      userId: email.userId,
      campaignId: email.campaignId,
      senderId: email.senderId,
      recipient: email.recipient,
      subject: email.subject,
      body: email.body,
      status: email.status,
      scheduledAt: email.scheduledAt.toISOString(),
      sentAt: email.sentAt?.toISOString(),
      failedAt: email.failedAt?.toISOString(),
      createdAt: email.createdAt.toISOString(),
      updatedAt: email.updatedAt.toISOString(),
    };

    await indexEmail(doc);
    console.log(`[Indexer] Indexed email ${emailId} with status ${email.status}`);
  },
  {
    connection: getRedis(),
    concurrency: 5,
  }
);

const indexerQueue = new Queue(QUEUE_NAME, { connection: getRedis() });

indexerWorker.on('failed', (job, err) => {
  console.error(`[Indexer] Job ${job?.id} failed:`, err.message);
});

async function processOutboxIndexing(): Promise<void> {
  const BATCH_SIZE = 50;
  const now = new Date();

  const events = await prisma.$transaction(async (tx) => {
    const pending = await tx.outboxEvent.findMany({
      where: {
        eventType: OutboxEventType.INDEX_EMAIL,
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
      data: { status: OutboxEventStatus.PROCESSING, attempts: { increment: 1 } },
    });

    return pending;
  });

  for (const event of events) {
    try {
      const { emailId } = event.payload as { emailId: string };
      await indexerQueue.add('index-email', { emailId }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: OutboxEventStatus.COMPLETED, publishedAt: new Date() },
      });
    } catch (err: unknown) {
      console.error(`[Indexer] Failed to queue indexing for ${event.id}:`, err);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: OutboxEventStatus.PENDING, lastError: (err as Error).message },
      });
    }
  }
}

export const searchIndexer = {
  start: () => {
    setInterval(() => { processOutboxIndexing().catch(console.error); }, 5000);
    console.log('[Indexer] Started');
  },
  stop: async () => {
    await indexerWorker.close();
    await indexerQueue.close();
    const redis = getRedis();
    await redis.quit();
  },
};