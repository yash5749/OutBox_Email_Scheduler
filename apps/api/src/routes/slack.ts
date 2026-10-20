import { Router, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { requireAuth } from '../auth/session';
import { encrypt, decrypt } from '../config/encryption.js';
import { createSuccessResponse, createErrorResponse } from '@reachinbox/shared';
import { WebClient } from '@slack/web-api';
import crypto from 'crypto';

const router: Router = Router();

const SLACK_STATE_PREFIX = 'slack_oauth_';
const STATE_TTL_MS = 10 * 60 * 1000;

const stateStore = new Map<string, { userId: string; expiresAt: number }>();

function generateState(userId: string): string {
  const state = `${SLACK_STATE_PREFIX}${crypto.randomBytes(16).toString('hex')}`;
  stateStore.set(state, { userId, expiresAt: Date.now() + STATE_TTL_MS });
  return state;
}

function validateState(state: string): { userId: string } | null {
  const entry = stateStore.get(state);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    stateStore.delete(state);
    return null;
  }
  stateStore.delete(state);
  return { userId: entry.userId };
}

router.get('/connect', requireAuth, (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  try {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json(createErrorResponse('UNAUTHENTICATED', 'Authentication required', requestId));
    }
    const state = generateState(user.id);
    const clientId = process.env.SLACK_CLIENT_ID!;
    const redirectUri = process.env.SLACK_CALLBACK_URL!;
    const scope = 'chat:write,channels:read,groups:read,im:read,mpim:read';
    const url = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    res.redirect(url);
  } catch (err) {
    console.error('[Slack] Connect error:', err);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to initiate Slack OAuth', requestId));
  }
});

router.get('/callback', async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`${process.env.WEB_URL}/settings?slack_error=${error}`);
    }

    if (!code || !state) {
      return res.redirect(`${process.env.WEB_URL}/settings?slack_error=missing_params`);
    }

    const validated = validateState(state as string);
    if (!validated) {
      return res.redirect(`${process.env.WEB_URL}/settings?slack_error=invalid_state`);
    }

    const client = new WebClient();
    const tokenResponse = await client.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code: code as string,
      redirect_uri: process.env.SLACK_CALLBACK_URL!,
    });

    if (!tokenResponse.ok || !tokenResponse.access_token) {
      throw new Error(tokenResponse.error || 'Token exchange failed');
    }

    const authTest = await client.auth.test({ token: tokenResponse.access_token });
    const teamInfo = await client.team.info({ token: tokenResponse.access_token });

    let channelId = tokenResponse.incoming_webhook?.channel_id;
    let channelName = tokenResponse.incoming_webhook?.channel;

    if (!channelId && tokenResponse.authed_user?.scope?.includes('channels:read')) {
      const channels = await client.conversations.list({ token: tokenResponse.access_token, types: 'public_channel,private_channel', limit: 1 });
      if (channels.channels?.length) {
        channelId = channels.channels[0].id;
        channelName = channels.channels[0].name;
      }
    }

    await prisma.slackConnection.upsert({
      where: { userId: validated.userId },
      create: {
        userId: validated.userId,
        teamId: authTest.team_id!,
        teamName: teamInfo.team?.name || 'Unknown',
        botUserId: authTest.user_id!,
        channelId: channelId || 'general',
        channelName: channelName || 'general',
        botTokenEncrypted: encrypt(tokenResponse.access_token),
        scopes: tokenResponse.scope?.split(',') || [],
        status: 'ACTIVE',
      },
      update: {
        teamId: authTest.team_id!,
        teamName: teamInfo.team?.name || 'Unknown',
        botUserId: authTest.user_id!,
        channelId: channelId || 'general',
        channelName: channelName || 'general',
        botTokenEncrypted: encrypt(tokenResponse.access_token),
        scopes: tokenResponse.scope?.split(',') || [],
        status: 'ACTIVE',
        disconnectedAt: null,
      },
    });

    res.redirect(`${process.env.WEB_URL}/settings?slack_connected=true`);
  } catch (err) {
    console.error('[Slack] Callback error:', err);
    res.redirect(`${process.env.WEB_URL}/settings?slack_error=callback_failed`);
  }
});

router.get('/status', requireAuth, async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  try {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json(createErrorResponse('UNAUTHENTICATED', 'Authentication required', requestId));
    }
    const userId = user.id;
    const conn = await prisma.slackConnection.findUnique({ where: { userId } });

    if (!conn || conn.status !== 'ACTIVE') {
      return res.json(createSuccessResponse({ connected: false }, requestId));
    }

    res.json(createSuccessResponse({
      connected: true,
      teamName: conn.teamName,
      teamId: conn.teamId,
      channelId: conn.channelId,
      channelName: conn.channelName,
      connectedAt: conn.connectedAt.toISOString(),
    }, requestId));
  } catch (err) {
    console.error('[Slack] Status error:', err);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch Slack status', requestId));
  }
});

router.post('/disconnect', requireAuth, async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  try {
    const user = req.user as { id: string } | undefined;
    if (!user) {
      return res.status(401).json(createErrorResponse('UNAUTHENTICATED', 'Authentication required', requestId));
    }
    const userId = user.id;
    await prisma.slackConnection.update({
      where: { userId },
      data: { status: 'DISCONNECTED', disconnectedAt: new Date() },
    });
    res.json(createSuccessResponse({ message: 'Slack disconnected' }, requestId));
  } catch (err) {
    console.error('[Slack] Disconnect error:', err);
    res.status(500).json(createErrorResponse('INTERNAL_ERROR', 'Failed to disconnect Slack', requestId));
  }
});

export async function sendSlackAlert(senderId: string, senderName: string, hourWindow: Date, limit: number, rescheduledCount: number): Promise<void> {
  const conn = await prisma.slackConnection.findFirst({
    where: { user: { senders: { some: { id: senderId } } }, status: 'ACTIVE' },
  });

  if (!conn) return;

  const alertKey = `slack-alert:${senderId}:${hourWindow.toISOString()}:rate-limit`;
  const existing = await prisma.slackAlert.findUnique({ where: { id: alertKey } });
  if (existing?.status === 'SENT') return;

  try {
    const token = decrypt(conn.botTokenEncrypted);
    const client = new WebClient(token);

    const message = `⚠️ *Rate Limit Reached*\nSender: ${senderName}\nHour Window: ${hourWindow.toISOString()}\nLimit: ${limit}/hour\nRescheduled: ${rescheduledCount} emails to next window`;

    await client.chat.postMessage({
      channel: conn.channelId,
      text: message,
      mrkdwn: true,
    });

    await prisma.slackAlert.upsert({
      where: { id: alertKey },
      create: { id: alertKey, senderId, hourWindow, alertType: 'rate-limit', status: 'SENT', sentAt: new Date() },
      update: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
    });
  } catch (err) {
    console.error('[Slack] Alert send failed:', err);
    await prisma.slackAlert.upsert({
      where: { id: alertKey },
      create: { id: alertKey, senderId, hourWindow, alertType: 'rate-limit', status: 'FAILED', lastError: (err as Error).message, attempts: 1 },
      update: { status: 'FAILED', lastError: (err as Error).message, attempts: { increment: 1 } },
    });
  }
}

export default router;