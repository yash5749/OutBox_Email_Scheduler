import 'dotenv/config';
import { DelayedError, Queue, Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createDecipheriv } from 'crypto';
import { rateLimiter } from './rate-limit/rate-limiter.js';
import { reconcileScheduledEmails } from './recovery/reconcile.js';
import { searchIndexer } from './search-indexing/indexer.js'; // path adjust according to project

const prisma = new PrismaClient();

// Encryption utilities (copied from API config)
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const VERSION = 'v1';
const KEY = Buffer.from(ENCRYPTION_KEY, 'hex');

function decrypt(encrypted: string): string {
  if (!encrypted.startsWith(`${VERSION}:`)) return encrypted;
  const combined = Buffer.from(encrypted.slice(VERSION.length + 1), 'base64');
  if (combined.length < IV_LENGTH + 16) {
    throw new Error('Ciphertext too short');
  }
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - 16);
  const encryptedData = combined.subarray(IV_LENGTH, combined.length - 16);
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  return decrypted.toString('utf8');
}

function positiveIntegerEnv(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be a positive integer no greater than ${max}`);
  }
  return value;
}

const env = {
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY || '',
  WORKER_CONCURRENCY: positiveIntegerEnv('WORKER_CONCURRENCY', 10, 1000),
  MIN_DELAY_BETWEEN_EMAILS_MS: positiveIntegerEnv('MIN_DELAY_BETWEEN_EMAILS_MS', 2000, 3600000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: positiveIntegerEnv('MAX_EMAILS_PER_HOUR_PER_SENDER', 200, 10000),
  EMAIL_JOB_ATTEMPTS: positiveIntegerEnv('EMAIL_JOB_ATTEMPTS', 5, 100),
  EMAIL_RETRY_BASE_DELAY_MS: positiveIntegerEnv('EMAIL_RETRY_BASE_DELAY_MS', 5000, 3600000),
};
if (!/^[\da-fA-F]{64}$/.test(env.TOKEN_ENCRYPTION_KEY)) {
  throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes)');
}
const redisWorker = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy: (times) => {
    return Math.min(times * 200, 30000);
  },
  connectionName: `reachinbox-worker-${process.pid}`,
});

const QUEUE_NAME = 'email-delivery';
const JOB_NAME = 'send-email';
const RECONCILE_INTERVAL_MS = 30000;
const reconcileQueue = new Queue(QUEUE_NAME, { connection: redisWorker });
let reconcileTimer: NodeJS.Timeout | null = null;
let stopping = false;

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

async function enqueueRateLimitAlert(
  email: { id: string; userId: string; senderId: string; sender: { displayName: string } },
  hourWindowMs: number,
  hourlyLimit: number,
): Promise<void> {
  const connection = await prisma.slackConnection.findUnique({ where: { userId: email.userId } });
  if (!connection || connection.status !== 'ACTIVE') return;

  const hourWindow = new Date(hourWindowMs);
  const alertId = `slack-alert:${email.senderId}:${hourWindow.toISOString()}:rate-limit`;
  await prisma.$transaction(async (tx) => {
    const inserted = await tx.slackAlert.createMany({
      data: [{ id: alertId, senderId: email.senderId, hourWindow, alertType: 'rate-limit', status: 'PENDING' }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return;

    await tx.outboxEvent.create({
      data: {
        eventType: 'SLACK_RATE_LIMIT_ALERT',
        aggregateId: email.id,
        payload: {
          senderId: email.senderId,
          senderName: email.sender.displayName,
          hourWindow: hourWindow.toISOString(),
          limit: hourlyLimit,
          rescheduledCount: 1,
        },
        userId: email.userId,
      },
    });
  });
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name !== JOB_NAME) return;

    const { emailId, reservedSendAt } = job.data as { emailId: string; reservedSendAt?: number };

    console.error(`[Worker] Processing job ${job.id} for email ${emailId}`);
    console.error(`[Worker] About to call findUnique for ${emailId}`);

    let email;
    let sendResult: { messageId: string; accepted: string[]; rejected: string[]; response: string };
    try {
      email = await prisma.scheduledEmail.findUnique({
        where: { id: emailId },
        include: { sender: true },
      });
      console.error(`[Worker] Email ${emailId} findUnique result:`, email ? 'FOUND' : 'NULL');
    } catch (err) {
      console.error(`[Worker] Email ${emailId} findUnique ERROR:`, err);
      throw err;
    }

    console.error(`[Worker] Email ${emailId} found:`, email ? 'YES' : 'NO', email ? `status=${email.status}` : '');

    if (!email) {
      console.warn(`[Worker] Email not found: ${emailId}`);
      return;
    }

    if (email.status === 'SENT' || email.status === 'CANCELLED') {
      console.log(`[Worker] Email ${emailId} already ${email.status}, skipping`);
      return;
    }
    if (email.status === 'SENDING') {
      console.log(`[Worker] Email ${emailId} already has an active database lease; skipping duplicate job`);
      return;
    }

    // Always use the latest scheduledAt from database (updated by rate limiter)
    const currentScheduledAt = email.scheduledAt.getTime();
    const now = Date.now();

    // BullMQ is the scheduling authority. This guard only repairs a job whose DB
    // schedule was moved after it had already been published.
    const dueAt = Math.max(currentScheduledAt, reservedSendAt ?? 0);
    if (now < dueAt) {
      if (reservedSendAt) await job.updateData({ ...job.data, reservedSendAt });
      await job.moveToDelayed(dueAt, job.token);
      throw new DelayedError();
    }

    // A previously persisted reservation has already consumed its atomic Redis
    // slot. Do not reserve a second slot when that delayed job wakes up.
    let reservedAt = reservedSendAt ?? 0;
    let limitReached = false;
    let limitWindow: number | null = null;
    if (!reservedAt) {
      const baseTime = Math.max(currentScheduledAt, Date.now());
      ({ reservedAt, limitReached, limitWindow } = await rateLimiter.reserveSlot(
        email.senderId,
        baseTime,
        email.sender.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER,
        email.sender.minDelayMs ?? env.MIN_DELAY_BETWEEN_EMAILS_MS
      ));
    }

    if (limitReached && reservedAt > now) {
      if (limitWindow !== null) {
        await enqueueRateLimitAlert(
          email,
          limitWindow,
          email.sender.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER,
        );
      }

      // Update DB and emit outbox event in a transaction
      await prisma.$transaction(async (tx) => {
        await tx.scheduledEmail.update({
          where: { id: emailId },
          data: { scheduledAt: new Date(reservedAt) },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: "INDEX_EMAIL",
            aggregateId: emailId,
            payload: {
              emailId,
              rescheduledAt: new Date(reservedAt).toISOString(),
            },
            userId: email.userId,
          },
        });
      });

      await job.updateData({ ...job.data, reservedSendAt: reservedAt });
      await job.moveToDelayed(reservedAt, job.token);
      throw new DelayedError();
    }

    if (reservedAt > now) {
      if (limitReached && limitWindow !== null) {
        await enqueueRateLimitAlert(
          email,
          limitWindow,
          email.sender.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR_PER_SENDER,
        );
      }

      // Update DB and emit outbox event so the search index & frontend update immediately
      await prisma.$transaction(async (tx) => {
        await tx.scheduledEmail.update({
          where: { id: emailId },
          data: { scheduledAt: new Date(reservedAt) },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'INDEX_EMAIL',
            aggregateId: emailId,
            payload: {
              emailId,
              rescheduledAt: new Date(reservedAt).toISOString(),
            },
            userId: email.userId,
          },
        });
      });

      await job.updateData({ ...job.data, reservedSendAt: reservedAt });
      await job.moveToDelayed(reservedAt, job.token);
      throw new DelayedError();
    }

    // Clear the reservation before starting SMTP. Any SMTP retry must obtain a
    // fresh slot, while a crash before send can be recovered through the lease.
    if (reservedSendAt) await job.updateData({ ...job.data, reservedSendAt: undefined });

    // Acquire processing lease
    const leaseUntil = new Date(Date.now() + 120000); // 2 minutes
    console.log(`[Worker] Email ${emailId} attempting lease acquisition...`);
    const leaseResult = await prisma.scheduledEmail.updateMany({
      where: { id: emailId, status: 'SCHEDULED' },
      data: { status: 'SENDING', processingLeaseUntil: leaseUntil },
    });
    if (leaseResult.count !== 1) {
      console.log(`[Worker] Email ${emailId} lease not acquired; another worker changed its status`);
      return;
    }

    // Reload to confirm lease acquired
    const updatedEmail = await prisma.scheduledEmail.findUnique({ where: { id: emailId } });
    if (!updatedEmail || updatedEmail.status !== 'SENDING') {
      console.log(`[Worker] Email ${emailId} lease not acquired, another worker processing, status: ${updatedEmail?.status}`);
      return;
    }

    console.log(`[Worker] Email ${emailId} lease acquired, starting send...`);

    try {
      const transport = await getSenderTransport(email.senderId);
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.default.createTransport(transport);

      const messageId = `<${emailId}@reachinbox.local>`;

      console.log(`[Worker] Sending email ${emailId} to ${email.recipient}...`);
      const info = await transporter.sendMail({
        from: `"${email.sender.displayName}" <${email.sender.fromEmail}>`,
        to: email.recipient,
        subject: email.subject,
        text: email.body,
        messageId,
        headers: { 'X-ReachInbox-Email-Id': emailId },
      });
      console.log(`[Worker] Email ${emailId} sendMail returned:`, info.messageId);

      sendResult = {
        messageId: info.messageId,
        accepted: info.accepted.map(a => typeof a === 'object' ? a.address : a),
        rejected: info.rejected.map(r => typeof r === 'object' ? r.address : r),
        response: info.response,
      };
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
        await prisma.$transaction(async (tx) => {
          await tx.scheduledEmail.update({
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
          await tx.outboxEvent.create({
            data: { eventType: 'INDEX_EMAIL', aggregateId: emailId, payload: { emailId }, userId: email.userId },
          });
        });
        return;
      }
    }

    // SMTP accepted the message. Persist SENT and its indexing event together;
    // indexing failures must never be treated as a reason to send again.
    await prisma.$transaction(async (tx) => {
      await tx.scheduledEmail.update({
        where: { id: emailId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          providerMessageId: sendResult.messageId,
          providerResponse: sendResult,
          attemptCount: { increment: 1 },
          processingLeaseUntil: null,
        },
      });
      await tx.outboxEvent.create({
        data: { eventType: 'INDEX_EMAIL', aggregateId: emailId, payload: { emailId }, userId: email.userId },
      });
    });
    console.log(`[Worker] Email ${emailId} DB updated to SENT; provider message ${sendResult.messageId}`);
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
  if (!(err instanceof DelayedError)) {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  }
});

worker.on('error', (err) => {
  console.error('[Worker] Worker error:', err);
});

async function startWorker() {
  // Test database connection
  try {
    const count = await prisma.scheduledEmail.count();
    console.error(`[Worker] Database connected, ${count} scheduled emails in DB`);
  } catch (err) {
    console.error('[Worker] Database connection failed:', err);
  }

  console.log(`[Worker] Started with concurrency ${env.WORKER_CONCURRENCY}`);
  searchIndexer.start();
  void runRecoveryScan();
}

async function runRecoveryScan(): Promise<void> {
  if (stopping) return;
  try {
    const result = await reconcileScheduledEmails(
      prisma,
      reconcileQueue,
      redisWorker,
      { attempts: env.EMAIL_JOB_ATTEMPTS, retryDelayMs: env.EMAIL_RETRY_BASE_DELAY_MS },
    );
    if (!result.skippedLocked) {
      console.log(`[Reconciler] scan=${result.scanned} recreated=${result.recreated} kept=${result.kept} staleSending=${result.staleSendingRecovered}`);
    }
  } catch (error) {
    console.error('[Reconciler] Recovery scan failed; will retry:', error);
  } finally {
    if (!stopping) reconcileTimer = setTimeout(() => void runRecoveryScan(), RECONCILE_INTERVAL_MS);
  }
}

async function stopWorker() {
  if (stopping) return;
  stopping = true;
  if (reconcileTimer) clearTimeout(reconcileTimer);
  console.log('[Worker] stopWorker called');
  await searchIndexer.stop();
  await worker.close();
  await reconcileQueue.close();
  await rateLimiter.close();
  await redisWorker.quit();
  await prisma.$disconnect();
  console.log('[Worker] Stopped');
}

startWorker().catch(console.error);

// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('SIGTERM', () => {
  console.log('[Worker] Received SIGTERM');
  stopWorker();
});
// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('SIGINT', () => {
  console.log('[Worker] Received SIGINT');
  stopWorker();
});
