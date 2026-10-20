import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { requireAuth } from '../auth/session';
import { createSuccessResponse, createErrorResponse } from '@reachinbox/shared';

const router: Router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json(createErrorResponse('UNAUTHENTICATED', 'Authentication required', crypto.randomUUID()));
    }
    const userId = user.id;
    const senders = await prisma.sender.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        displayName: true,
        fromEmail: true,
        isActive: true,
        hourlyLimit: true,
        minDelayMs: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(createSuccessResponse(senders, crypto.randomUUID()));
  } catch (err) {
    console.error('[Senders] List error:', err);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch senders', crypto.randomUUID()));
  }
});

export default router;