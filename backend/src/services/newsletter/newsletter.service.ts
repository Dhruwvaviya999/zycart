import mongoose from 'mongoose';
import type { Env } from '../../config/env';
import { appUrl } from '../../config/notifications';
import {
  Subscriber,
  type SubscriberSource,
  type SubscriberStatus,
} from '../../models/subscriber.model';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { signLink, verifyLink } from '../../utils/signed-links';
import { escapeRegex, isObjectId } from '../../validators/common';
import type { AdminSubscriberQuery } from '../../validators/newsletter.validator';
import { hashToken, mintToken } from '../auth/account-tokens';
import { NotificationOutbox, queueNotification } from '../notifications/notification.service';

/**
 * The newsletter list: joining it, confirming, leaving, and exporting it.
 *
 * ## Double opt-in, and why the form cannot be trusted
 *
 * The sign-up form accepts any address from anybody. So an address typed into
 * it becomes PENDING and receives exactly one message — "confirm this was you"
 * — and becomes SUBSCRIBED only when its owner follows the link. An address
 * nobody confirms is never exported and never mailed again.
 *
 * ## What ZyCart does not do
 *
 * Send the newsletter. This is the list, kept honestly; the campaigns go out
 * through whichever marketing tool the store uses, fed by the export. Building
 * a bulk sender here would put marketing volume on the same mail account as
 * order confirmations, and one spam complaint about a promotion would then
 * start costing the store its shipping notices.
 */

/** How long a confirmation link works. Two days: newsletters are not urgent. */
export const CONFIRMATION_TTL_HOURS = 48;

/**
 * The shortest gap between two confirmation emails to one address.
 *
 * The form is public, so without this anybody could use it to send a stranger
 * a confirmation email every few seconds. Ten minutes makes that pointless
 * while still letting a real person who mistyped nothing ask again.
 */
export const CONFIRMATION_COOLDOWN_MS = 10 * 60 * 1_000;

/**
 * Adds an address to the list, pending confirmation.
 *
 * ## Every outcome looks the same from outside
 *
 * Already subscribed, pending, cooling down or new: the response is identical,
 * so the form cannot be used to discover who is on the list. Only a new or
 * lapsed address that is outside the cooldown is actually sent anything.
 *
 * ## Re-joining after leaving
 *
 * An UNSUBSCRIBED address that is entered again goes back to PENDING and must
 * be confirmed again. Somebody else typing a former subscriber's address into
 * the form must not be able to put them back on the list.
 */
export async function subscribe(env: Env, email: string, source: SubscriberSource): Promise<void> {
  const existing = await Subscriber.findOne({ email }).select('status confirmationSentAt');

  if (existing?.status === 'SUBSCRIBED') return;

  const now = new Date();
  const sentAt = existing?.confirmationSentAt;

  if (sentAt && now.getTime() - sentAt.getTime() < CONFIRMATION_COOLDOWN_MS) return;

  const token = mintToken();
  const session = await mongoose.startSession();
  const outbox = new NotificationOutbox();

  try {
    await session.withTransaction(async () => {
      const subscriber = await Subscriber.findOneAndUpdate(
        // The status guard means a confirmation that landed between the read
        // above and this write is not undone by it.
        { email, status: { $ne: 'SUBSCRIBED' } },
        {
          $set: {
            status: 'PENDING',
            confirmTokenHash: hashToken(token),
            confirmTokenExpiresAt: new Date(now.getTime() + CONFIRMATION_TTL_HOURS * 3_600_000),
            confirmationSentAt: now,
          },
          // `email` is not repeated here: an upsert takes it from the filter.
          $setOnInsert: { source },
        },
        { upsert: true, returnDocument: 'after', session },
      );

      if (!subscriber) throw new AppError('Could not record the subscription', 500);

      await queueNotification(
        {
          event: 'NEWSLETTER_CONFIRMATION',
          entityType: 'SUBSCRIBER',
          entityId: subscriber._id,
          entityLabel: subscriber.email,
          // One message per request, distinguished by when it was sent.
          keyReference: `${String(subscriber._id)}:${now.getTime().toString(36)}`,
          orderNumber: '',
          subscriberId: subscriber._id,
          buildPayload: () => ({ expiresInHours: CONFIRMATION_TTL_HOURS }),
        },
        session,
        outbox,
        { token },
      );
    });
  } catch (error) {
    /**
     * The upsert above races a concurrent confirmation or a concurrent
     * sign-up for the same address. The loser meets the unique index on
     * `email` and has nothing to add — the address is on the list either way.
     */
    const duplicate =
      typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
    if (!duplicate) throw error;
    return;
  } finally {
    await session.endSession();
  }

  logger.info('newsletter_subscription_requested', { source });

  await outbox.flush(env);
}

const INVALID_CONFIRMATION =
  'This confirmation link is invalid or has expired. Sign up again to get a new one.';

/**
 * Confirms a subscription from the link in the email.
 *
 * Idempotent while the link is live: a second click on a link that has already
 * worked finds the address SUBSCRIBED and says so, rather than telling somebody
 * who is on the list that their link is broken.
 */
export async function confirmSubscription(token: string): Promise<void> {
  if (!token || token.length < 16 || token.length > 200) {
    throw new AppError(INVALID_CONFIRMATION, 400);
  }

  const now = new Date();

  const subscriber = await Subscriber.findOneAndUpdate(
    {
      confirmTokenHash: hashToken(token),
      confirmTokenExpiresAt: { $gt: now },
      status: { $in: ['PENDING', 'SUBSCRIBED'] },
    },
    { $set: { status: 'SUBSCRIBED', unsubscribedAt: null } },
    { returnDocument: 'after' },
  );

  if (!subscriber) throw new AppError(INVALID_CONFIRMATION, 400);

  // Stamped once, by the first confirmation: a repeat click is not a new one.
  await Subscriber.updateOne(
    { _id: subscriber._id, confirmedAt: null },
    { $set: { confirmedAt: now } },
  );

  logger.info('newsletter_confirmed', {});
}

/**
 * Leaves the list, from a signed link. No sign-in, because a subscriber may
 * have no account at all; the signature is the authority.
 */
export async function unsubscribe(secret: string, id: string, signature: string): Promise<void> {
  if (!isObjectId(id) || !verifyLink(secret, 'newsletter-unsubscribe', id, signature)) {
    throw new AppError('This unsubscribe link is not valid.', 400);
  }

  const result = await Subscriber.updateOne(
    { _id: id, status: { $ne: 'UNSUBSCRIBED' } },
    {
      $set: {
        status: 'UNSUBSCRIBED',
        unsubscribedAt: new Date(),
        confirmTokenHash: null,
        confirmTokenExpiresAt: null,
      },
    },
  );

  // Already unsubscribed is success, not an error: the person asked for this
  // state and they are in it.
  if (result.matchedCount === 0 && !(await Subscriber.exists({ _id: id }))) {
    throw new AppError('This unsubscribe link is not valid.', 400);
  }

  logger.info('newsletter_unsubscribed', {});
}

/* ---------------------------------------------------------------- */
/* The console                                                       */
/* ---------------------------------------------------------------- */

export interface SubscriberRow {
  id: string;
  email: string;
  status: SubscriberStatus;
  source: SubscriberSource;
  createdAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

export interface SubscriberCounts {
  subscribed: number;
  pending: number;
  unsubscribed: number;
}

type SubscriberLean = {
  _id: mongoose.Types.ObjectId;
  email: string;
  status: SubscriberStatus;
  source: SubscriberSource;
  createdAt: Date;
  confirmedAt?: Date | null;
  unsubscribedAt?: Date | null;
};

function toRow(entry: SubscriberLean): SubscriberRow {
  return {
    id: String(entry._id),
    email: entry.email,
    status: entry.status,
    source: entry.source,
    createdAt: entry.createdAt.toISOString(),
    confirmedAt: entry.confirmedAt?.toISOString() ?? null,
    unsubscribedAt: entry.unsubscribedAt?.toISOString() ?? null,
  };
}

export async function listSubscribers(query: AdminSubscriberQuery) {
  const filter: Record<string, unknown> = {};

  if (query.status) filter.status = query.status;
  if (query.search) filter.email = new RegExp(escapeRegex(query.search), 'i');

  const [entries, total] = await Promise.all([
    Subscriber.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<SubscriberLean[]>(),
    Subscriber.countDocuments(filter),
  ]);

  return {
    items: entries.map(toRow),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

/** How many addresses are in each state — the three numbers the list page leads with. */
export async function subscriberCounts(): Promise<SubscriberCounts> {
  const counts = await Subscriber.aggregate<{ _id: SubscriberStatus; count: number }>([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const byStatus = new Map(counts.map((entry) => [entry._id, entry.count]));

  return {
    subscribed: byStatus.get('SUBSCRIBED') ?? 0,
    pending: byStatus.get('PENDING') ?? 0,
    unsubscribed: byStatus.get('UNSUBSCRIBED') ?? 0,
  };
}

/**
 * One CSV cell, safe to open in a spreadsheet.
 *
 * Quoted, with quotes doubled, and prefixed with an apostrophe when it begins
 * with a character a spreadsheet would treat as a formula. An address is
 * attacker-chosen text — anybody can sign up as `=HYPERLINK(...)@x.co` — and
 * an export is opened by somebody on the store's staff.
 */
export function csvCell(value: string): string {
  const neutralised = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${neutralised.replace(/"/g, '""')}"`;
}

/**
 * The signed link that takes one address off the list.
 *
 * Exported with every row so the campaign tool can put it in each email: an
 * unsubscribe that only the campaign tool knew about would leave this list —
 * the source of the next export — still saying SUBSCRIBED.
 */
export function unsubscribeUrl(env: Env, subscriberId: string): string {
  const signature = signLink(env.JWT_SECRET, 'newsletter-unsubscribe', subscriberId);

  return appUrl(
    env,
    `/newsletter/unsubscribe?id=${encodeURIComponent(subscriberId)}&s=${encodeURIComponent(signature)}`,
  );
}

/**
 * The confirmed list, as CSV.
 *
 * SUBSCRIBED only: a pending address has not consented and an unsubscribed one
 * has withdrawn consent, so neither belongs in a file whose purpose is to be
 * imported into a mailing tool.
 */
export async function exportSubscribers(env: Env): Promise<string> {
  const rows = await Subscriber.find({ status: 'SUBSCRIBED' })
    .sort({ confirmedAt: 1, _id: 1 })
    .select('_id email source confirmedAt')
    .lean<
      { _id: mongoose.Types.ObjectId; email: string; source: string; confirmedAt?: Date | null }[]
    >();

  const lines = [
    ['email', 'source', 'confirmed_at', 'unsubscribe_url'].map(csvCell).join(','),
    ...rows.map((row) =>
      [
        row.email,
        row.source,
        row.confirmedAt?.toISOString() ?? '',
        unsubscribeUrl(env, String(row._id)),
      ]
        .map(csvCell)
        .join(','),
    ),
  ];

  return `${lines.join('\r\n')}\r\n`;
}
