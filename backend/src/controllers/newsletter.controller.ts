import type { Request, Response } from 'express';
import * as newsletterService from '../services/newsletter/newsletter.service';
import {
  adminSubscriberQuerySchema,
  confirmSubscriptionSchema,
  subscribeSchema,
  unsubscribeSchema,
} from '../validators/newsletter.validator';

/**
 * The newsletter's public handlers, and the console's two.
 *
 * The public ones need no session — a subscriber is an address, not an account —
 * and answer in the same words whatever the address's history, so the form
 * cannot be used to learn who is on the list.
 */

export async function subscribe(req: Request, res: Response): Promise<void> {
  const { email, source } = subscribeSchema.parse(req.body);

  await newsletterService.subscribe(req.env, email, source);

  res.json({
    success: true,
    message: 'Almost done — check your inbox for a link to confirm your subscription.',
  });
}

export async function confirm(req: Request, res: Response): Promise<void> {
  const { token } = confirmSubscriptionSchema.parse(req.body);

  await newsletterService.confirmSubscription(token);

  res.json({ success: true, message: 'You are subscribed. Thanks for joining.' });
}

export async function unsubscribe(req: Request, res: Response): Promise<void> {
  const { id, s } = unsubscribeSchema.parse(req.body);

  await newsletterService.unsubscribe(req.env.JWT_SECRET, id, s);

  res.json({
    success: true,
    message: 'You have been unsubscribed and will not hear from us again.',
  });
}

export async function listSubscribers(req: Request, res: Response): Promise<void> {
  const query = adminSubscriberQuerySchema.parse(req.query);
  const { items, pagination } = await newsletterService.listSubscribers(query);

  res.json({ success: true, data: items, pagination });
}

export async function getSubscriberCounts(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await newsletterService.subscriberCounts() });
}

/**
 * The confirmed list, as a file.
 *
 * `no-store`, because it is a list of people's addresses and has no business
 * sitting in a shared cache longer than it must.
 */
export async function exportSubscribers(req: Request, res: Response): Promise<void> {
  const csv = await newsletterService.exportSubscribers(req.env);
  const stamp = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="zycart-subscribers-${stamp}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
}
