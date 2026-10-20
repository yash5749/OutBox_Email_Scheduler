import { prisma } from '@reachinbox/api/config/prisma.js';
import { redisWorker } from '@reachinbox/api/config/redis.js';
import { Queue } from 'bullmq';
import { getEnv } from '@reachinbox/api/config/env.js';
import { EmailStatus } from '@prisma/client';

const env = getEnv();
const QUEUE_NAME = 'email-delivery';
const JOB_NAME = 'send-email';

const queue = new Queue(QUEUE_NAME, { connection: redisWorker });

async function reconcile() {
  console.log('[Reconciler] Starting reconciliation...');

  const nonterminalEmails = await prisma.scheduledEmail.findMany({
    where: {
      status: { in: ['SCHEDULED', 'SENDING'] },
    },
    select: { id: true, scheduledAt: true, status: true, senderId: true },
  });

  console.log(`[Reconciler] Found ${nonterminalEmails.length} non-terminal emails`);

  let recreated = 0;
  let skipped = 0;

  for (const email of nonterminalEmails) {
    const jobId = `email-${email.id}`;

    try {
      const existingJob = await queue.getJob(jobId);
      if (existingJob) {
        skipped++;
        continue;
      }

      const delay = Math.max(0, email.scheduledAt.getTime() - Date.now());
      await queue.add(
        JOB_NAME,
        { emailId: email.id },
        { jobId, delay, attempts: env.EMAIL_JOB_ATTEMPTS, backoff: { type: 'exponential', delay: env.EMAIL_RETRY_BASE_DELAY_MS } }
      );
      recreated++;
      console.log(`[Reconciler] Recreated job for email ${email.id}`);
    } catch (err) {
      console.error(`[Reconciler] Failed to recreate job for ${email.id}:`, err);
    }
  }

  // Check for stuck SENDING emails (lease expired)
  const leaseExpiry = new Date(Date.now() - 120000);
  const stuckEmails = await prisma.scheduledEmail.findMany({
    where: {
      status: 'SENDING',
      processingLeaseUntil: { lt: leaseExpiry },
    },
    select: { id: true },
  });

  if (stuckEmails.length > 0) {
    const ids = stuckEmails.map(e => e.id);
    await prisma.scheduledEmail.updateMany({
      where: { id: { in: ids } },
      data: { status: 'SCHEDULED', processingLeaseUntil: null },
    });
    console.log(`[Reconciler] Reset ${stuckEmails.length} stuck SENDING emails to SCHEDULED`);

    for (const email of stuckEmails) {
      const jobId = `email-${email.id}`;
      try {
        await queue.add(
          JOB_NAME,
          { emailId: email.id },
          { jobId, delay: 0, attempts: env.EMAIL_JOB_ATTEMPTS, backoff: { type: 'exponential', delay: env.EMAIL_RETRY_BASE_DELAY_MS } }
        );
        recreated++;
      } catch (err) {
        console.error(`[Reconciler] Failed to requeue stuck email ${email.id}:`, err);
      }
    }
  }

  console.log(`[Reconciler] Complete: ${recreated} jobs recreated, ${skipped} already existed`);
  await queue.close();
  await prisma.$disconnect();
}

reconcile().catch(err => {
  console.error('[Reconciler] Fatal error:', err);
  process.exit(1);
});