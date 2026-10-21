import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { reconcileScheduledEmails } from '../src/recovery/reconcile.js';

const prisma = new PrismaClient();
const queueRedis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const lockRedis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });

afterAll(async () => {
  await queueRedis.quit();
  await lockRedis.quit();
  await prisma.$disconnect();
});

describe('database to BullMQ reconciliation', () => {
  it('replaces terminal jobs, recreates missing jobs, and recovers expired SENDING leases', async () => {
    const unique = randomUUID();
    const user = await prisma.user.create({
      data: {
        googleSubject: `reconcile-test-${unique}`,
        email: `reconcile-${unique}@example.invalid`,
        name: 'Reconciliation integration test',
      },
    });
    const sender = await prisma.sender.create({
      data: {
        userId: user.id,
        displayName: 'Disposable sender',
        fromEmail: `reconcile-${unique}@example.invalid`,
        smtpHost: '127.0.0.1',
        smtpPort: 2525,
        smtpUser: 'unused-test-account',
        smtpPasswordEncrypted: 'unused-test-password',
      },
    });
    const queueName = `email-delivery-reconcile-${unique}`;
    const queue = new Queue(queueName, { connection: queueRedis });
    const worker = new Worker(queueName, async () => undefined, { connection: queueRedis });
    const emailIds = [randomUUID(), randomUUID(), randomUUID()];
    const future = new Date(Date.now() + 60 * 60 * 1000);

    try {
      await prisma.scheduledEmail.createMany({
        data: [
          ...emailIds.slice(0, 2).map((id, index) => ({
            id,
            userId: user.id,
            senderId: sender.id,
            recipient: `recipient-${index}-${unique}@example.invalid`,
            subject: 'Recovery test',
            body: 'No SMTP send is performed by this test.',
            scheduledAt: future,
            idempotencyKey: `reconcile-test:${unique}:${index}`,
          })),
          {
            id: emailIds[2],
            userId: user.id,
            senderId: sender.id,
            recipient: `recipient-stale-${unique}@example.invalid`,
            subject: 'Recovery test',
            body: 'No SMTP send is performed by this test.',
            scheduledAt: future,
            idempotencyKey: `reconcile-test:${unique}:stale`,
            status: 'SENDING',
            processingLeaseUntil: new Date(Date.now() - 60_000),
          },
        ],
      });

      const terminalJobId = `email-${emailIds[0]}`;
      const completed = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Disposable queue job did not complete')), 10_000);
        worker.on('completed', (job) => {
          if (job.id === terminalJobId) {
            clearTimeout(timeout);
            resolve();
          }
        });
        worker.once('error', reject);
      });
      await queue.add('send-email', { emailId: emailIds[0] }, { jobId: terminalJobId, removeOnComplete: false });
      await completed;

      const result = await reconcileScheduledEmails(
        prisma,
        queue,
        lockRedis,
        {
          attempts: 3,
          retryDelayMs: 100,
          emailIds,
          lockKey: `reconcile-test-lock-${unique}`,
        },
        new Date(),
      );

      expect(result.scanned).toBe(3);
      expect(result.recreated).toBe(3);
      expect(result.staleSendingRecovered).toBe(1);

      for (const id of emailIds) {
        const job = await queue.getJob(`email-${id}`);
        expect(job).toBeDefined();
        expect(await job?.getState()).toBe('delayed');
      }

      const recovered = await prisma.scheduledEmail.findUniqueOrThrow({ where: { id: emailIds[2] } });
      expect(recovered.status).toBe('SCHEDULED');
      expect(recovered.lastErrorCode).toBe('WORKER_LEASE_EXPIRED');
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
