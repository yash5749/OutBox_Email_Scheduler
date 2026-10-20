import { Worker } from 'bullmq';
import { prisma } from '@reachinbox/api/config/prisma.js';
import { redisWorker } from '@reachinbox/api/config/redis.js';
import { getEnv } from '@reachinbox/api/config/env.js';
import { rateLimiter } from './rate-limit/rate-limiter.js';
import { searchIndexer } from './search-indexing/indexer.js';
import { decrypt } from '@reachinbox/api/config/encryption.js';
import { EmailStatus } from '@prisma/client';

const env = getEnv();

const QUEUE_NAME = 'email-delivery';
const JOB_NAME = 'send-email';

async function getSenderTransport(senderId: string) {
  const sender = await prisma.sender.findUnique({ where: { id: senderId } });
  if (!sender) throw new Error(`Sender not found: ${senderId}`);

  const password = decrypt(sender.smtpPasswordEncrypted);

  return {
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpPort === 465,
    auth: { user: sender.smtpUser, pass: password },
    pool: true,
    maxConnections: env.WORKER_CONCURRENCY,
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 30000,
  };
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name !== JOB_NAME) return;

    const { emailId, reservedSendAt } = job.data as { emailId: string; reservedSendAt?: number };

    const email = await prisma.scheduledEmail.findUnique({
      where: { id: emailId },
      include: { sender: true },
    });

    if (!email) {
      console.warn(`[Worker] Email not found: ${emailId}`);
      return;
    }

    if (email.status === 'SENT' || email.status === 'CANCELLED') {
      console.log(`[Worker] Email ${emailId} already ${email.status}, skipping`);
      return;
    }

    // Check if we have a reservation and it's time
    if (reservedSendAt && Date.now() < reservedSendAt) {
      const delay = reservedSendAt - Date.now();
      console.log(`[Worker] Email ${emailId} reserved for ${new Date(reservedSendAt).toISOString()}, re-delaying ${delay}ms`);
      await job.moveToDelayed(reservedSendAt, job.token);
      throw new Error('DelayedError'); // BullMQ will catch this and not retry
    }

    // Reserve rate limit slot if not already reserved
    if (!reservedSendAt) {
      const { reservedAt, limitReached } = await rateLimiter.reserveSlot(
        email.senderId,
        email.scheduledAt.getTime(),
        email.sender.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER,
        email.sender.minDelayMs ?? env.MIN_DELAY_BETWEEN_EMAILS_MS
      );

      if (limitReached && reservedAt > Date.now()) {
        await job.updateData({ ...job.data, reservedSendAt: reservedAt });
        await job.moveToDelayed(reservedAt, job.token);
        throw new Error('DelayedError');
      }

      if (reservedAt > Date.now()) {
        await job.updateData({ ...job.data, reservedSendAt: reservedAt });
        await job.moveToDelayed(reservedAt, job.token);
        throw new Error('DelayedError');
      }
    }

    // Acquire processing lease
    const leaseUntil = new Date(Date.now() + 120000); // 2 minutes
    await prisma.scheduledEmail.update({
      where: { id: emailId, status: 'SCHEDULED' },
      data: { status: 'SENDING', processingLeaseUntil: leaseUntil },
    });

    // Reload to confirm lease acquired
    const updatedEmail = await prisma.scheduledEmail.findUnique({ where: { id: emailId } });
    if (!updatedEmail || updatedEmail.status !== 'SENDING') {
      console.log(`[Worker] Email ${emailId} lease not acquired, another worker processing`);
      return;
    }

    try {
      const transport = await getSenderTransport(email.senderId);
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport(transport);

      const messageId = `<${emailId}@reachinbox.local>`;

      const info = await transporter.sendMail({
        from: `"${email.sender.displayName}" <${email.sender.fromEmail}>`,
        to: email.recipient,
        subject: email.subject,
        text: email.body,
        messageId,
        headers: { 'X-ReachInbox-Email-Id': emailId },
      });

      const accepted = info.accepted.map(a => typeof a === 'object' ? a.address : a);
      const rejected = info.rejected.map(r => typeof r === 'object' ? r.address : r);

      await prisma.scheduledEmail.update({
        where: { id: emailId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          providerMessageId: info.messageId,
          providerResponse: { accepted, rejected, response: info.response },
          attemptCount: { increment: 1 },
          processingLeaseUntil: null,
        },
      });

      // Queue indexing
      await prisma.outboxEvent.create({
        data: {
          eventType: 'INDEX_EMAIL',
          aggregateId: emailId,
          payload: { emailId },
          userId: email.userId,
        },
      });

      console.log(`[Worker] Email ${emailId} sent to ${email.recipient}, messageId: ${info.messageId}`);
    } catch (err) {
      const error = err as Error;
      console.error(`[Worker] Email ${emailId} send failed:`, error.message);

      const isRetryable = !error.message.includes('Invalid') &&
        !error.message.includes('Rejected') &&
        !error.message.includes('Authentication') &&
        !error.message.includes('550') &&
        !error.message.includes('553') &&
        !error.message.includes('554');

      if (isRetryable && job.attemptsMade < job.opts.attempts!) {
        await prisma.scheduledEmail.update({
          where: { id: emailId },
          data: {
            status: 'SCHEDULED',
            attemptCount: { increment: 1 },
            lastErrorCode: 'TRANSIENT_ERROR',
            lastErrorMessage: error.message,
            processingLeaseUntil: null,
          },
        });
        throw error; // Let BullMQ handle retry
      } else {
        await prisma.scheduledEmail.update({
          where: { id: emailId },
          data: {
            status: 'FAILED',
            failedAt: new Date(),
            attemptCount: { increment: 1 },
            lastErrorCode: isRetryable ? 'MAX_RETRIES_EXCEEDED' : 'PERMANENT_ERROR',
            lastErrorMessage: error.message,
            processingLeaseUntil: null,
          },
        });

        // Queue indexing for failed status
        await prisma.outboxEvent.create({
          data: {
            eventType: 'INDEX_EMAIL',
            aggregateId: emailId,
            payload: { emailId },
            userId: email.userId,
          },
        });
      }
    }
  },
  {
    connection: redisWorker,
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: 120000,
    maxStalledCount: 2,
    stalledInterval: 30000,
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  if (err.message !== 'DelayedError') {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  }
});

worker.on('error', (err) => {
  console.error('[Worker] Worker error:', err);
});

async function startWorker() {
  await redisWorker.connect();
  console.log('[Worker] Started');
}

async function stopWorker() {
  await worker.close();
  await redisWorker.quit();
  await prisma.$disconnect();
  console.log('[Worker] Stopped');
}

startWorker().catch(console.error);

// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('SIGTERM', () => stopWorker());
// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('SIGINT', () => stopWorker());