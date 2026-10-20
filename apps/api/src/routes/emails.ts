import { Router, Request, Response } from 'express';
import multer from 'multer';
import { prisma } from '../config/prisma';
import { requireAuth } from '../auth/session';
import { parseRecipients, ScheduleEmailsRequestSchema } from '../services/csv-parser.js';
import { createSuccessResponse, createErrorResponse } from '@reachinbox/shared';
import { v4 as uuidv4 } from 'uuid';
import { OutboxEventType } from '@prisma/client';
import { searchEmails } from '../config/elasticsearch.js';

const router: Router = Router();

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV or text files allowed'));
    }
  },
});

function generateIdempotencyKey(userId: string, campaignId: string | undefined, recipient: string, contentHash: string): string {
  const base = campaignId ? `${userId}:${campaignId}:${recipient}` : `${userId}:${recipient}`;
  return `${base}:${contentHash.slice(0, 16)}`;
}

function hashContent(subject: string, body: string): string {
  let hash = 0;
  const str = subject + body;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

router.post('/parse', requireAuth, async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  try {
    const { content, mimeType } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Content is required', requestId));
    }
    const result = parseRecipients(content, mimeType || 'text/plain');
    res.json(createSuccessResponse(result, requestId));
  } catch (err) {
    console.error('[Emails] Parse error:', err);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to parse recipients', requestId));
  }
});

router.post('/schedule', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  try {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json(createErrorResponse('UNAUTHENTICATED', 'Authentication required', requestId));
    }
    const userId = user.id;
    const idempotencyKey = req.header('Idempotency-Key');

    let parsed: { campaignId?: string; senderId: string; subject?: string; body?: string; recipients?: string[]; startAt: string; minDelayBetweenEmailsMs: number; maxEmailsPerHour: number };

    if (req.file) {
      const content = req.file.buffer.toString('utf8');
      const parseResult = parseRecipients(content, req.file.mimetype);
      const body = { ...req.body, recipients: parseResult.valid.map(v => v.email) };
      const result = ScheduleEmailsRequestSchema.safeParse(body);
      if (!result.success) {
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Invalid request', requestId, result.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))));
      }
      parsed = result.data;

      if (parseResult.invalid.length > 0 || parseResult.duplicates.length > 0) {
        // We'll include these in the response
      }
    } else {
      const result = ScheduleEmailsRequestSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Invalid request', requestId, result.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))));
      }
      parsed = result.data;
    }

    const { campaignId, senderId, subject, body, recipients, startAt, minDelayBetweenEmailsMs, maxEmailsPerHour } = parsed;

    if (!recipients || recipients.length === 0) {
      return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'No valid recipients provided', requestId));
    }

    const sender = await prisma.sender.findFirst({ where: { id: senderId, userId, isActive: true } });
    if (!sender) {
      return res.status(404).json(createErrorResponse('NOT_FOUND', 'Sender not found or inactive', requestId));
    }

    const campaign = campaignId
      ? await prisma.campaign.findFirst({ where: { id: campaignId, userId } })
      : null;

    if (campaignId && !campaign) {
      return res.status(404).json(createErrorResponse('NOT_FOUND', 'Campaign not found', requestId));
    }

    const finalSubject = subject ?? campaign?.subject;
    const finalBody = body ?? campaign?.body;

    if (!finalSubject || !finalBody) {
      return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Subject and body are required', requestId));
    }

    const contentHash = hashContent(finalSubject, finalBody);
    const scheduledAt = new Date(startAt);
    const now = new Date();

    if (scheduledAt < now) {
      return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'startAt must be in the future', requestId));
    }

    // Check for duplicate idempotency key if provided
    if (idempotencyKey) {
      const existing = await prisma.scheduledEmail.findUnique({ where: { idempotencyKey } });
      if (existing) {
        return res.status(409).json(createErrorResponse('CONFLICT', 'Idempotency key already used', requestId));
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const emails: Array<{
        id: string;
        userId: string;
        campaignId: string | null;
        senderId: string;
        recipient: string;
        subject: string;
        body: string;
        scheduledAt: Date;
        idempotencyKey: string;
      }> = [];

      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const emailId = uuidv4();
        const delayMs = minDelayBetweenEmailsMs * i;
        const emailScheduledAt = new Date(scheduledAt.getTime() + delayMs);

        const key = idempotencyKey
          ? `${idempotencyKey}:${i}`
          : generateIdempotencyKey(userId, campaignId, recipient, contentHash);

        emails.push({
          id: emailId,
          userId,
          campaignId: campaignId ?? null,
          senderId,
          recipient,
          subject: finalSubject,
          body: finalBody,
          scheduledAt: emailScheduledAt,
          idempotencyKey: key,
        });
      }

      const created = await tx.scheduledEmail.createMany({ data: emails, skipDuplicates: true });

      const createdEmails = await tx.scheduledEmail.findMany({
        where: { id: { in: emails.map(e => e.id) } },
      });

      const outboxEvents = createdEmails.map(e => ({
        eventType: OutboxEventType.PUBLISH_EMAIL_JOB,
        aggregateId: e.id,
        payload: { emailId: e.id, scheduledAt: e.scheduledAt.toISOString() },
        userId,
      }));

      await tx.outboxEvent.createMany({ data: outboxEvents });

      // Also create indexing events
      const indexEvents = createdEmails.map(e => ({
        eventType: OutboxEventType.INDEX_EMAIL,
        aggregateId: e.id,
        payload: { emailId: e.id },
        userId,
      }));
      await tx.outboxEvent.createMany({ data: indexEvents });

      return { created: createdEmails, parseResult: req.file ? parseRecipients(req.file.buffer.toString('utf8'), req.file.mimetype) : { valid: recipients.map((r, i) => ({ email: r, row: i + 1, raw: r })), invalid: [], duplicates: [] } };
    });

    res.status(202).json(createSuccessResponse({
      campaignId: campaignId ?? null,
      scheduledCount: result.created.length,
      invalidCount: result.parseResult.invalid.length,
      duplicateCount: result.parseResult.duplicates.length,
      invalidRows: result.parseResult.invalid,
      duplicateEmails: result.parseResult.duplicates,
    }, requestId));
  } catch (err) {
    console.error('[Emails] Schedule error:', err);
    if ((err as Error).name === 'MulterError') {
      return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'File upload error', requestId));
    }
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to schedule emails', requestId));
  }
});

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  try {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json(createErrorResponse('UNAUTHENTICATED', 'Authentication required', requestId));
    }
    const userId = user.id;
    const { status, senderId, campaignId, cursor, limit } = req.query;

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (senderId) where.senderId = senderId;
    if (campaignId) where.campaignId = campaignId;

    const take = Number(limit) || 50;
    const emails = await prisma.scheduledEmail.findMany({
      where,
      take: take + 1,
      cursor: cursor ? { id: cursor as string } : undefined,
      orderBy: { scheduledAt: 'asc' },
      select: {
        id: true,
        recipient: true,
        subject: true,
        status: true,
        scheduledAt: true,
        sender: { select: { id: true, displayName: true, fromEmail: true } },
        campaignId: true,
        createdAt: true,
      },
    });

    let nextCursor: string | undefined;
    if (emails.length > take) {
      const next = emails.pop();
      nextCursor = next!.id;
    }

    res.json(createSuccessResponse({ items: emails, nextCursor, hasMore: !!nextCursor }, requestId));
  } catch (err) {
    console.error('[Emails] List error:', err);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch emails', requestId));
  }
});

router.get('/search', requireAuth, async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  try {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json(createErrorResponse('UNAUTHENTICATED', 'Authentication required', requestId));
    }
    const userId = user.id;
    const { q, status, senderId, campaignId, from, to, cursor, limit } = req.query;

    const statusArray = status
      ? (Array.isArray(status) ? status.filter((s): s is string => typeof s === 'string') : (typeof status === 'string' ? [status] : []))
      : undefined;

    const result = await searchEmails({
      userId,
      query: q as string,
      status: statusArray,
      senderId: senderId as string,
      campaignId: campaignId as string,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
      cursor: cursor as string,
      limit: Number(limit) || 50,
    });

    res.json(createSuccessResponse({ items: result.hits, nextCursor: result.nextCursor, hasMore: !!result.nextCursor, totalHits: result.total }, requestId));
  } catch (err) {
    console.error('[Emails] Search error:', err);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Search failed', requestId));
  }
});

router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  try {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json(createErrorResponse('UNAUTHENTICATED', 'Authentication required', requestId));
    }
    const userId = user.id;
    const email = await prisma.scheduledEmail.findFirst({
      where: { id: req.params.id, userId },
      include: {
        sender: { select: { id: true, displayName: true, fromEmail: true } },
        campaign: { select: { id: true, name: true } },
      },
    });

    if (!email) {
      return res.status(404).json(createErrorResponse('NOT_FOUND', 'Email not found', requestId));
    }

    res.json(createSuccessResponse(email, requestId));
  } catch (err) {
    console.error('[Emails] Get error:', err);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch email', requestId));
  }
});

router.post('/:id/cancel', requireAuth, async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  try {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json(createErrorResponse('UNAUTHENTICATED', 'Authentication required', requestId));
    }
    const userId = user.id;
    const email = await prisma.scheduledEmail.findFirst({ where: { id: req.params.id, userId } });

    if (!email) {
      return res.status(404).json(createErrorResponse('NOT_FOUND', 'Email not found', requestId));
    }

    if (email.status !== 'SCHEDULED') {
      return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Only scheduled emails can be cancelled', requestId));
    }

    await prisma.$transaction([
      prisma.scheduledEmail.update({ where: { id: email.id }, data: { status: 'CANCELLED' } }),
      prisma.outboxEvent.create({
        data: {
          eventType: OutboxEventType.PUBLISH_EMAIL_JOB,
          aggregateId: email.id,
          payload: { emailId: email.id, action: 'cancel' },
          userId,
        },
      }),
    ]);

    res.json(createSuccessResponse({ message: 'Email cancelled' }, requestId));
  } catch (err) {
    console.error('[Emails] Cancel error:', err);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to cancel email', requestId));
  }
});

export default router;