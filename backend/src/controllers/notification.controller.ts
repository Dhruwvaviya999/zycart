import type { Request, Response } from 'express';
import * as notifications from '../services/notifications/notification.service';
import { recordAudit } from '../services/admin/audit.service';
import { requireActor } from '../utils/actor';
import {
  adminNotificationQuerySchema,
  notificationIdSchema,
  retryNotificationSchema,
} from '../validators/notification.validator';

/**
 * The transactional communication console.
 *
 * ## Three endpoints, and what is conspicuously missing
 *
 * List, read, retry. There is no endpoint here that composes a message, no
 * endpoint that takes a recipient, and no endpoint that takes a template or an
 * event name. Messages exist because a business transition happened on the
 * server; the only thing an administrator can do to one is ask for it to be
 * attempted again.
 *
 * That is not an oversight to be filled in later. A `POST /admin/send-email`
 * would turn a transactional system into a mail relay reachable by anybody who
 * obtained an administrator session, and would make the delivery records — the
 * point of the whole subsystem — stop meaning "ZyCart owed this customer this
 * message".
 *
 * ## Authorisation
 *
 * Every path below is mounted under `/api/admin`, which the router guards once
 * with `requireAuth` and `requireRole('ADMIN')`. There is no customer-facing
 * notification endpoint anywhere in ZyCart.
 */

const notificationId = (req: Request): string =>
  notificationIdSchema.parse({ id: req.params.id }).id;

export async function listNotifications(req: Request, res: Response): Promise<void> {
  const query = adminNotificationQuerySchema.parse(req.query);
  const { items, pagination } = await notifications.listNotifications(query);

  res.json({ success: true, data: items, pagination });
}

/** Counts for the operations page. Cheap: three indexed counts. */
export async function getCommunicationSummary(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await notifications.getCommunicationSummary(req.env) });
}

export async function getNotification(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await notifications.getNotification(notificationId(req)) });
}

/**
 * One further attempt at one message.
 *
 * ## Why this is audited
 *
 * Retrying is an administrative action with an outward-facing consequence — a
 * customer's inbox — so it goes in the audit trail beside every other one.
 * Written *after* the attempt and only for an attempt that actually happened,
 * which is the rule `recordAudit` has always followed: the trail records what
 * was done, not what was tried.
 *
 * ## Why the audit row is not inside a transaction
 *
 * There is nothing to be atomic with. Sending is a network call whose outcome
 * is already recorded on the delivery row; the audit entry describes the person
 * who asked for it. This is the same case `recordAudit` documents for product
 * creation — a single write, after the fact.
 *
 * ## What it cannot do
 *
 * Nothing here touches an order, a shipment, a return, a payment or stock. The
 * service it calls writes to exactly one delivery row. Retrying an email cannot
 * issue a refund.
 */
export async function retryNotification(req: Request, res: Response): Promise<void> {
  // Refuses any body at all. See `retryNotificationSchema` for why an ignored
  // field is a weaker guarantee than a rejected one.
  retryNotificationSchema.parse(req.body ?? {});

  const actor = requireActor(req);
  const result = await notifications.retryNotification(req.env, notificationId(req));

  await recordAudit({
    actor,
    action: 'NOTIFICATION_RETRIED',
    entityType: 'NOTIFICATION',
    entityId: result.delivery.id,
    entityLabel: result.delivery.entityLabel,
    summary:
      `Retried the ${result.delivery.event.toLowerCase().replace(/_/g, ' ')} email for ` +
      `${result.delivery.entityLabel} - ${result.sent ? 'sent' : 'still failing'}`,
    changes: [{ field: 'status', from: 'FAILED', to: result.delivery.status }],
  });

  res.json({ success: true, message: result.message, data: result });
}
