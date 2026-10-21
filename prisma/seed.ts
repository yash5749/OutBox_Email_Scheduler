import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../apps/api/src/config/encryption.js';

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Starting database seed...');

  // Create demo user (will be created via Google OAuth in real usage)
  // This is just for local development with seeded senders

  // Create Ethereal senders for demo using real credentials
  const senders = [
    {
      displayName: 'Ethereal Sender 1',
      fromEmail: 'kamren.raynor@ethereal.email',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'kamren.raynor@ethereal.email',
      smtpPassword: 'u46yCMhtadvnypB5QM',
      hourlyLimit: 200,
      minDelayMs: 2000,
    },
    {
      displayName: 'Ethereal Sender 2',
      fromEmail: 'elmore.dicki@ethereal.email',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'elmore.dicki@ethereal.email',
      smtpPassword: 'ZhUhe91q4y1Dfk99q4',
      hourlyLimit: 100,
      minDelayMs: 3000,
    },
  ];

  // We need a user to associate senders with
  // In real usage, this would be the authenticated user
  // For seed, we'll create a placeholder user
  let user = await prisma.user.findFirst({ where: { email: 'demo@reachinbox.local' } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        googleSubject: 'demo-user-seed',
        email: 'demo@reachinbox.local',
        name: 'Demo User',
        role: 'ADMIN',
      },
    });
    console.log('[Seed] Created demo user:', user.id);
  }

  for (const sender of senders) {
    const existing = await prisma.sender.findFirst({ where: { fromEmail: sender.fromEmail } });
    if (existing) {
      // Update with new credentials
      await prisma.sender.update({
        where: { id: existing.id },
        data: {
          smtpUser: sender.smtpUser,
          smtpPasswordEncrypted: encrypt(sender.smtpPassword),
          hourlyLimit: sender.hourlyLimit,
          minDelayMs: sender.minDelayMs,
        },
      });
      console.log('[Seed] Updated sender:', sender.fromEmail);
      continue;
    }

    await prisma.sender.create({
      data: {
        userId: user.id,
        displayName: sender.displayName,
        fromEmail: sender.fromEmail,
        smtpHost: sender.smtpHost,
        smtpPort: sender.smtpPort,
        smtpUser: sender.smtpUser,
        smtpPasswordEncrypted: encrypt(sender.smtpPassword),
        hourlyLimit: sender.hourlyLimit,
        minDelayMs: sender.minDelayMs,
        isActive: true,
      },
    });
    console.log('[Seed] Created sender:', sender.fromEmail);
  }

  console.log('[Seed] Done!');
}

main()
  .catch(err => {
    console.error('[Seed] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });