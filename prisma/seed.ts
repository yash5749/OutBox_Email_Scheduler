import { PrismaClient } from '@prisma/client';
import { encrypt } from '../apps/api/src/config/encryption';

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Starting database seed...');

  // Create demo user (will be created via Google OAuth in real usage)
  // This is just for local development with seeded senders

  // Create Ethereal senders for demo
  // In production, these would be created via Ethereal API or configured manually
  const senders = [
    {
      displayName: 'Demo Sender 1',
      fromEmail: 'sender1@ethereal.email',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'sender1@ethereal.email',
      smtpPassword: 'ethereal-password-1',
      hourlyLimit: 200,
      minDelayMs: 2000,
    },
    {
      displayName: 'Demo Sender 2',
      fromEmail: 'sender2@ethereal.email',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'sender2@ethereal.email',
      smtpPassword: 'ethereal-password-2',
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
      console.log('[Seed] Sender already exists:', sender.fromEmail);
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