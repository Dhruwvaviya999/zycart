import mongoose, { type Types } from 'mongoose';
import type { Env } from '../../config/env';
import { appUrl } from '../../config/notifications';
/**
 * Registered for their side effect. `resolveCart` populates a product's brand
 * and category, and a populate needs the referenced model to exist. Inside the
 * API every model is loaded by the routes; this module also runs in the
 * `reminders:send` process, where nothing else would load these two.
 */
import '../../models/brand.model';
import '../../models/category.model';
import { Cart } from '../../models/cart.model';
import { NotificationDelivery } from '../../models/notification-delivery.model';
import { Order } from '../../models/order.model';
import { User } from '../../models/user.model';
import { logger } from '../../utils/logger';
import { signLink } from '../../utils/signed-links';
import { cartLines, resolveCart } from '../cart.service';
import {
  NotificationOutbox,
  notificationKey,
  queueNotification,
} from '../notifications/notification.service';
import { buildAbandonedCartPayload, buildPaymentFailedPayload } from '../notifications/payloads';

/**
 * The two messages that are about something that did *not* happen.
 *
 * Every other message ZyCart sends is raised by a transition, in the
 * transaction that performed it. "You left something in your cart" and "your
 * payment did not go through" are raised by the passage of time instead — no
 * request marks the moment a cart becomes abandoned — so they are found by a
 * sweep, and the sweep is a command run by cron, exactly as the notification
 * drain is. No worker, no scheduler, no timer in the API process.
 *
 * ## What makes a second run harmless
 *
 * Each message's idempotency key names the thing it is about *in the state it
 * was in*: a cart reminder's key includes the moment the cart last changed, a
 * payment reminder's is the order number. The unique index on the key then
 * means a second run, or two runs at once, raise nothing new. The cart's
 * `reminderHandledAt` exists so the job does not reconsider the same basket on
 * every run; it is an optimisation, and the key is the guarantee.
 */

/** A cart untouched for this long is worth a reminder. */
export const CART_IDLE_MS = 3 * 60 * 60 * 1_000;

/** Older than this and a reminder would be about a basket the customer has forgotten. */
export const CART_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;

/** The least time between two reminders to one cart, however often it changes. */
export const CART_REMINDER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1_000;

/**
 * How long a failed payment is left before the customer is told.
 *
 * Most failures are a declined card retried with another within a minute; a
 * reminder sent into that minute would arrive beside the confirmation for the
 * payment that worked. Half an hour is long enough to be sure it was not
 * retried, and short enough that the basket is still on their mind.
 */
export const PAYMENT_GRACE_MS = 30 * 60 * 1_000;

/** Older than this and the order is stale; no reminder is sent about it. */
export const PAYMENT_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1_000;

export const REMINDERS_DEFAULT_LIMIT = 100;
export const REMINDERS_MAX_LIMIT = 500;

export interface ReminderCounts {
  /** Found by the sweep and worth considering. */
  considered: number;
  /** A message was recorded (or, in a dry run, would have been). */
  queued: number;
  /** Considered and deliberately not sent — opted out, nothing buyable, already told. */
  skipped: number;
}

export interface ReminderSummary {
  dryRun: boolean;
  carts: ReminderCounts;
  payments: ReminderCounts;
}

export interface ReminderOptions {
  limit: number;
  dryRun: boolean;
  now?: Date;
}

const emptyCounts = (): ReminderCounts => ({ considered: 0, queued: 0, skipped: 0 });

/**
 * The link at the foot of every reminder that switches reminders off.
 *
 * Signed for this account and this purpose; see `utils/signed-links.ts`. It
 * points at a storefront page, which asks before it acts — a mail scanner that
 * follows every link in a message must not be able to opt somebody out.
 */
export function cartReminderOptOutUrl(env: Env, userId: string): string {
  const signature = signLink(env.JWT_SECRET, 'cart-reminders-opt-out', userId);
  return appUrl(
    env,
    `/email-preferences/cart-reminders?u=${encodeURIComponent(userId)}&s=${encodeURIComponent(signature)}`,
  );
}

/** Records that the job has dealt with this version of a cart, without touching `updatedAt`. */
async function markHandled(
  cartId: Types.ObjectId,
  updatedAt: Date,
  now: Date,
  session?: mongoose.ClientSession,
): Promise<boolean> {
  const result = await Cart.updateOne(
    // Conditional on the cart being exactly the version that was read: a
    // basket the customer changed a second ago is not the one being reminded.
    { _id: cartId, updatedAt },
    { $set: { reminderHandledAt: now } },
    { timestamps: false, ...(session ? { session } : {}) },
  );

  return result.modifiedCount > 0;
}

async function remindAbandonedCarts(
  env: Env,
  options: ReminderOptions,
  now: Date,
  outbox: NotificationOutbox,
): Promise<ReminderCounts> {
  const counts = emptyCounts();

  const carts = await Cart.find({
    'items.0': { $exists: true },
    updatedAt: {
      $lte: new Date(now.getTime() - CART_IDLE_MS),
      $gte: new Date(now.getTime() - CART_MAX_AGE_MS),
    },
    $or: [
      { reminderHandledAt: null },
      {
        $expr: {
          $and: [
            { $lt: ['$reminderHandledAt', '$updatedAt'] },
            { $lt: ['$reminderHandledAt', new Date(now.getTime() - CART_REMINDER_COOLDOWN_MS)] },
          ],
        },
      },
    ],
  })
    // Oldest first: the basket closest to being forgotten is reminded first.
    .sort({ updatedAt: 1, _id: 1 })
    .limit(options.limit);

  for (const cart of carts) {
    counts.considered += 1;

    const user = await User.findById(cart.user).select('email firstName isActive emailPreferences');

    // Resolved against the live catalogue, so the email names only things the
    // customer could actually buy if they clicked through now.
    const resolved = await resolveCart(cartLines(cart));
    const buyable = resolved.items.filter(
      (item) =>
        item.product !== null &&
        item.availability !== 'out_of_stock' &&
        item.availability !== 'unavailable',
    );

    const declined =
      !user ||
      !user.isActive ||
      user.emailPreferences?.cartReminders === false ||
      buyable.length === 0;

    if (declined) {
      counts.skipped += 1;
      if (!options.dryRun) await markHandled(cart._id, cart.updatedAt, now);
      continue;
    }

    if (options.dryRun) {
      counts.queued += 1;
      continue;
    }

    const session = await mongoose.startSession();

    try {
      let queued = false;

      await session.withTransaction(async () => {
        queued = false;

        if (!(await markHandled(cart._id, cart.updatedAt, now, session))) return;

        const created = await queueNotification(
          {
            event: 'ABANDONED_CART',
            entityType: 'CART',
            entityId: cart._id,
            entityLabel: user.email,
            keyReference: `${String(cart._id)}:${cart.updatedAt.getTime().toString(36)}`,
            orderNumber: '',
            userId: user._id,
            buildPayload: (recipient) =>
              buildAbandonedCartPayload(
                recipient.firstName,
                buyable.map((item) => ({
                  productName: item.product?.name ?? '',
                  quantity: item.quantity,
                  selectedColor: item.selectedColor,
                  selectedSize: item.selectedSize,
                })),
                cartReminderOptOutUrl(env, String(user._id)),
              ),
          },
          session,
          outbox,
        );

        queued = created !== null;
      });

      if (queued) {
        counts.queued += 1;
        logger.info('reminder_queued', { kind: 'abandoned_cart', cartId: String(cart._id) });
      } else {
        counts.skipped += 1;
      }
    } finally {
      await session.endSession();
    }
  }

  return counts;
}

async function remindFailedPayments(
  options: ReminderOptions,
  now: Date,
  outbox: NotificationOutbox,
): Promise<ReminderCounts> {
  const counts = emptyCounts();

  const orders = await Order.find({
    'payment.method': 'RAZORPAY',
    'payment.status': 'FAILED',
    status: 'PENDING',
    updatedAt: {
      $lte: new Date(now.getTime() - PAYMENT_GRACE_MS),
      $gte: new Date(now.getTime() - PAYMENT_MAX_AGE_MS),
    },
  })
    .sort({ updatedAt: 1, _id: 1 })
    .limit(options.limit);

  for (const order of orders) {
    counts.considered += 1;

    // The cheap check: an order already told costs one indexed read and no
    // transaction. The unique key inside `queueNotification` is still the
    // guarantee when two runs overlap.
    if (
      await NotificationDelivery.exists({
        key: notificationKey('PAYMENT_FAILED', order.orderNumber),
      })
    ) {
      counts.skipped += 1;
      continue;
    }

    if (options.dryRun) {
      counts.queued += 1;
      continue;
    }

    const session = await mongoose.startSession();

    try {
      let queued = false;

      await session.withTransaction(async () => {
        queued = false;

        // Re-read inside the transaction: a payment that landed since the
        // sweep began must not be followed by an email saying it failed.
        const current = await Order.findOne({
          _id: order._id,
          status: 'PENDING',
          'payment.status': 'FAILED',
        }).session(session);

        if (!current) return;

        const created = await queueNotification(
          {
            event: 'PAYMENT_FAILED',
            entityType: 'ORDER',
            entityId: current._id,
            entityLabel: current.orderNumber,
            orderNumber: current.orderNumber,
            userId: current.user,
            buildPayload: (recipient) => buildPaymentFailedPayload(recipient.firstName, current),
          },
          session,
          outbox,
        );

        queued = created !== null;
      });

      if (queued) {
        counts.queued += 1;
        logger.info('reminder_queued', { kind: 'payment_failed', orderNumber: order.orderNumber });
      } else {
        counts.skipped += 1;
      }
    } finally {
      await session.endSession();
    }
  }

  return counts;
}

/**
 * One pass of both sweeps, then the sends.
 *
 * Bounded by `limit` per sweep, so one run cannot turn into an unbounded
 * mailing; the next scheduled run picks up where this one stopped. In a dry run
 * nothing is written and nothing is sent — the counts say what a real run
 * would have done.
 */
export async function sendReminders(env: Env, options: ReminderOptions): Promise<ReminderSummary> {
  const now = options.now ?? new Date();
  const outbox = new NotificationOutbox();

  const carts = await remindAbandonedCarts(env, options, now, outbox);
  const payments = await remindFailedPayments(options, now, outbox);

  // After every transaction has committed, and unable to throw.
  await outbox.flush(env);

  return { dryRun: options.dryRun, carts, payments };
}
