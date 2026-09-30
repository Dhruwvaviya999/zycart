import { Types } from 'mongoose';
import { TryOnUsage } from '../../models/try-on-usage.model';

/**
 * Each account's daily allowance of virtual try-ons.
 *
 * See `TryOnUsage` for why this is a document rather than the in-memory rate
 * limiter, and why the counter cannot be pushed past the limit.
 */

const IST_OFFSET_MS = 330 * 60 * 1_000;

/**
 * `2026-09-29` for any moment of that day in the store's timezone.
 *
 * The allowance resets at midnight IST for everybody, rather than 24 hours
 * after a customer's first try — "you have 3 left today" should mean today on
 * the store's clock, which is the clock every other date in ZyCart uses.
 */
export function tryOnDay(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;

export interface Reservation {
  reserved: boolean;
  /** Tries used today, including this one when it was reserved. */
  used: number;
  day: string;
}

/**
 * Takes one try from today's allowance, if there is one left.
 *
 * One conditional upsert: "add one, where the count is below the limit". The
 * first try of the day creates the document; a later one increments it; one
 * past the limit matches nothing, tries to insert a second document for the
 * same `{ user, day }`, and meets the unique index.
 *
 * That duplicate-key error has two causes and they must not be confused. Past
 * the limit is one. The other is two first-of-the-day tries racing, where both
 * found no document and both tried to create it — the loser is not over any
 * limit at all. So a duplicate is retried once, without the upsert, against the
 * document that now certainly exists; only if that matches nothing too is the
 * allowance genuinely spent.
 */
export async function reserveTry(
  userId: string,
  limit: number,
  now: Date = new Date(),
): Promise<Reservation> {
  const day = tryOnDay(now);
  const filter = { user: new Types.ObjectId(userId), day, count: { $lt: limit } };
  const update = { $inc: { count: 1 } };

  try {
    const usage = await TryOnUsage.findOneAndUpdate(filter, update, {
      upsert: true,
      returnDocument: 'after',
    });

    return { reserved: true, used: usage?.count ?? 1, day };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }

  const retried = await TryOnUsage.findOneAndUpdate(filter, update, { returnDocument: 'after' });

  return retried
    ? { reserved: true, used: retried.count, day }
    : { reserved: false, used: limit, day };
}

/**
 * Gives a try back.
 *
 * Called when a reserved try produced no picture — the model refused the photo,
 * the service timed out, the key was rejected. A customer who got nothing has
 * spent nothing. Conditional on the count being positive, so it can never go
 * below zero whatever calls it.
 */
export async function releaseTry(userId: string, day: string): Promise<void> {
  await TryOnUsage.updateOne(
    { user: new Types.ObjectId(userId), day, count: { $gt: 0 } },
    { $inc: { count: -1 } },
  );
}

/** How many tries this account has used today. */
export async function triesUsedToday(userId: string, now: Date = new Date()): Promise<number> {
  const usage = await TryOnUsage.findOne({ user: new Types.ObjectId(userId), day: tryOnDay(now) })
    .select('count')
    .lean<{ count: number } | null>();

  return usage?.count ?? 0;
}
