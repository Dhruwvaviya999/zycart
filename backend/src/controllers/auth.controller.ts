import { verifyWebhook } from '@clerk/express/webhooks';
import type { Request, Response } from 'express';
import {
  recordSignIn,
  syncClerkUser,
  unlinkClerkUser,
} from '../services/auth/clerk-sync';
import { getProfile, toSafeUser } from '../services/user.service';
import { User } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { logger, serializeError } from '../utils/logger';

/**
 * Signing in, signing up, signing out and every password and verification
 * flow belong to Clerk. What is left here is the account as ZyCart holds it.
 */
export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Not authenticated', 401);
  res.json({ success: true, data: await getProfile(req.user.id) });
}

/**
 * Brings the account up to date with Clerk and returns it.
 *
 * The storefront calls this when Clerk reports that the user changed — a name
 * edited or an address added in Clerk's profile — and right after a sign-in,
 * so the change is visible immediately rather than whenever the webhook lands.
 * It also makes the whole flow work on a development machine Clerk's webhooks
 * cannot reach.
 */
export async function sync(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Not authenticated', 401);

  const account = await User.findById(req.user.id).select('clerkId');
  const synced = account?.clerkId ? await syncClerkUser(req.env, account.clerkId) : null;

  res.json({ success: true, data: synced ? toSafeUser(synced) : await getProfile(req.user.id) });
}

/**
 * Clerk's webhook: changes to users made anywhere but the storefront.
 *
 * Verified against the endpoint's signing secret before anything is read. A
 * user created or updated is re-read from Clerk's API rather than taken from
 * the payload, so a late or replayed event can only ever apply the current
 * state. Every handler is idempotent, which is what Svix's at-least-once
 * delivery needs.
 */
export async function clerkWebhook(req: Request, res: Response): Promise<void> {
  const signingSecret = req.env.CLERK_WEBHOOK_SIGNING_SECRET;

  if (!signingSecret) {
    logger.warn('clerk_webhook_rejected', { reason: 'not_configured' });
    res.status(503).json({ success: false, message: 'Clerk webhook is not configured' });
    return;
  }

  let event: Awaited<ReturnType<typeof verifyWebhook>>;

  try {
    event = await verifyWebhook(req, { signingSecret });
  } catch (error) {
    logger.warn('clerk_webhook_rejected', { reason: 'signature', error: serializeError(error) });
    res.status(400).json({ success: false, message: 'Invalid webhook signature' });
    return;
  }

  switch (event.type) {
    case 'user.created':
    case 'user.updated':
      await syncClerkUser(req.env, event.data.id);
      break;
    case 'user.deleted':
      if (event.data.id) await unlinkClerkUser(event.data.id);
      break;
    case 'session.created':
      await recordSignIn(event.data.user_id, new Date(event.data.created_at));
      break;
    default:
      // Subscribed to by mistake, or added later: acknowledged, not acted on.
      break;
  }

  res.json({ success: true });
}
