import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import { getEnv } from './config/env';
import { sessionMiddleware } from './auth/session';
import './auth/google';
import { disconnectRedis } from './config/redis';
import { ensureIndex } from './config/elasticsearch';
import { startOutboxPublisher, stopOutboxPublisher } from './services/outbox-publisher';
import { prisma } from './config/prisma';
import authRoutes from './routes/auth';
import senderRoutes from './routes/senders';
import emailRoutes from './routes/emails';
import slackRoutes from './routes/slack';
import healthRoutes from './routes/health';
import { createSuccessResponse, createErrorResponse } from '@reachinbox/shared';
import { requireAuth } from './auth/session.js';
import { UserRole } from '@prisma/client';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getQueue } from './services/outbox-publisher.js';

// Initialize Bull Board at module level
const bullBoardAdapter = new ExpressAdapter();
bullBoardAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(getQueue())],
  serverAdapter: bullBoardAdapter,
});
const bullBoardRouter = bullBoardAdapter.getRouter();

const env = getEnv();

const app: Express = express();

app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: env.WEB_URL,
  credentials: true,
}));

app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(env.SESSION_SECRET));
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip ?? 'unknown',
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/senders', senderRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/integrations/slack', slackRoutes);
app.use('/health', healthRoutes);

app.get('/api', (_req: Request, res: Response) => {
  res.json(createSuccessResponse({ name: 'ReachInbox API', version: '0.1.0' }, crypto.randomUUID()));
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err);
  const requestId = crypto.randomUUID();
  if (err.name === 'ValidationError' || err.name === 'ZodError') {
    return res.status(400).json(createErrorResponse('VALIDATION_ERROR', err.message, requestId));
  }
  res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Internal server error', requestId));
});

export async function startApp(): Promise<void> {
  try {
    await ensureIndex();
  } catch (error) {
    console.error('[App] Elasticsearch unavailable at startup; indexing outbox will retry:', error);
  }
  await startOutboxPublisher();

  app.use('/admin/queues', requireAuth, (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as { role: UserRole } | undefined;
    if (user?.role !== 'ADMIN') {
      return res.status(403).json(createErrorResponse('FORBIDDEN', 'Admin access required', crypto.randomUUID()));
    }
    next();
  }, bullBoardRouter);

  console.log('[App] Started');
}

export async function stopApp(): Promise<void> {
  await stopOutboxPublisher();
  await disconnectRedis();
  await prisma.$disconnect();
  console.log('[App] Stopped');
}

export default app;
