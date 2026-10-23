import session from 'express-session';
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env';

const env = getEnv();

export const sessionMiddleware: express.RequestHandler = session({
  name: env.SESSION_COOKIE_NAME,
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    // Vercel and Render use different sites by default. The browser needs
    // cross-site cookies for credentialed API requests in production.
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
  rolling: true,
});

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      meta: { requestId: crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      meta: { requestId: crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
    return;
  }

  const user = req.user as { role: string; email: string } | undefined;
  const adminEmails = new Set(
    (env.BULL_BOARD_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase())
  );

  const isAdmin = user?.role === 'ADMIN' || (user?.email && adminEmails.has(user.email.toLowerCase()));

  if (!isAdmin) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
      meta: { requestId: crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
    return;
  }

  next();
}
