import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { redis } from '../config/redis';
import { esClient } from '../config/elasticsearch';
import { createSuccessResponse, createErrorResponse } from '@reachinbox/shared';

const router: Router = Router();

router.get('/live', (_req: Request, res: Response) => {
  res.json(createSuccessResponse({ status: 'alive' }, crypto.randomUUID()));
});

router.get('/ready', async (_req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  const checks: Record<string, { status: 'ok' | 'degraded' | 'down'; latencyMs?: number; error?: string }> = {};

  // PostgreSQL
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    checks.postgres = { status: 'down', error: (err as Error).message };
  }

  // Redis
  try {
    const start = Date.now();
    await redis.ping();
    checks.redis = { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    checks.redis = { status: 'down', error: (err as Error).message };
  }

  // Elasticsearch
  try {
    const start = Date.now();
    await esClient.ping();
    checks.elasticsearch = { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    checks.elasticsearch = { status: 'degraded', error: (err as Error).message };
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const anyDown = Object.values(checks).some(c => c.status === 'down');

  if (anyDown) {
    return res.status(503).json(createErrorResponse('SERVICE_UNAVAILABLE', 'Dependencies unhealthy', requestId, undefined));
  }

  res.json(createSuccessResponse({ status: allOk ? 'ready' : 'degraded', checks }, requestId));
});

export default router;