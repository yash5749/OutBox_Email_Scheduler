import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { indexEmail, deleteEmail } from '../config/elasticsearch.js';
import { EmailStatus } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

const BATCH_SIZE = 100;

async function reindex() {
  console.log('[ES Reindex] Starting full reindex...');

  const emails = await prisma.scheduledEmail.findMany({
    include: { sender: true, campaign: true },
  });

  console.log(`[ES Reindex] Found ${emails.length} emails to index`);

  let indexed = 0;
  let failed = 0;

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);

    for (const email of batch) {
      try {
        if (email.status === 'CANCELLED') {
          await deleteEmail(email.id);
        } else {
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
        }
        indexed++;
      } catch (err: unknown) {
        console.error(`[ES Reindex] Failed to index ${email.id}:`, err);
        failed++;
      }
    }

    console.log(`[ES Reindex] Progress: ${Math.min(i + BATCH_SIZE, emails.length)}/${emails.length}`);
  }

  console.log(`[ES Reindex] Complete: ${indexed} indexed, ${failed} failed`);
  await prisma.$disconnect();
}

reindex().catch((err: unknown) => {
  console.error('[ES Reindex] Fatal error:', err);
  process.exit(1);
});