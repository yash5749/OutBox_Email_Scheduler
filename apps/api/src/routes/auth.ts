import { Router, Request, Response } from 'express';
import passport from 'passport';
import { getEnv } from '../config/env';
import { requireAuth } from '../auth/session';
import { createSuccessResponse, createErrorResponse } from '@reachinbox/shared';

const env = getEnv();
const router: Router = Router();

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'consent' }));

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: `${env.WEB_URL}/login?error=oauth_failed` }),
  (_req: Request, res: Response) => {
    res.redirect(env.WEB_URL);
  }
);

router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = req.user as { id: string; googleSubject: string; email: string; name: string; avatarUrl: string | null; role: string; createdAt: Date; updatedAt: Date; lastLoginAt: Date | null };
  res.json(createSuccessResponse({
    id: user.id,
    googleSubject: user.googleSubject,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  }, crypto.randomUUID()));
});

router.post('/logout', (req: Request, res: Response) => {
  req.logout(err => {
    if (err) {
      return res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Logout failed', crypto.randomUUID()));
    }
    req.session.destroy(() => {
      res.clearCookie(env.SESSION_COOKIE_NAME);
      res.json(createSuccessResponse({ message: 'Logged out' }, crypto.randomUUID()));
    });
  });
});

export default router;