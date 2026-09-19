import { Types } from 'mongoose';
import { UserActivity, type ActivityEvent } from '../../models/user-activity.model';

/**
 * Records what a signed-in customer did, so recommendations have something to
 * be based on.
 *
 * Three rules govern everything in this file:
 *
 *  1. **It is never on the critical path.** Every write is fire-and-forget and
 *     every failure is swallowed. A product page must render, a cart must
 *     accept an item and a wishlist must save whether or not this collection is
 *     writable. Nothing a shopper does should be slower, or fail, because a
 *     recommendation-feeding write did.
 *  2. **The server decides who and what.** There is no endpoint through which a
 *     browser can post an event. Every call comes from inside a service that
 *     has already done the real work — the cart accepted the item, the order
 *     completed — so a row is evidence of something that happened rather than a
 *     claim that it did.
 *  3. **Signed-in customers only.** A guest has no row here at all.
 */

/**
 * How long the same customer viewing the same product counts as one view.
 *
 * A refresh, a bounce back from the gallery, React re-running an effect in
 * development — none of those are new interest, and every one of them would
 * otherwise write a row. Ten minutes collapses them while still recording a
 * genuine return visit later in the day.
 */
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

/** Events where repetition is noise rather than signal. */
const DEDUPED: ReadonlySet<ActivityEvent> = new Set(['product_view', 'search']);

interface RecordInput {
  userId: string;
  event: ActivityEvent;
  productId?: string | Types.ObjectId | null;
  term?: string | null;
}

const toObjectId = (value: string | Types.ObjectId | null | undefined): Types.ObjectId | null => {
  if (!value) return null;
  if (value instanceof Types.ObjectId) return value;
  return /^[0-9a-fA-F]{24}$/.test(value) ? new Types.ObjectId(value) : null;
};

/**
 * Writes one activity row, unless an equivalent one was written moments ago.
 *
 * The dedupe check is a single indexed read against the same
 * `{ user, createdAt }` index the recommendation query uses, so preventing a
 * refresh loop from writing thousands of rows costs one cheap lookup.
 */
async function write(input: RecordInput): Promise<void> {
  const user = toObjectId(input.userId);
  if (!user) return;

  const product = toObjectId(input.productId);
  const term = input.term?.trim().slice(0, 120) ?? null;

  // A `search` row with no term, or a product event with no product, carries
  // no signal and would only take up space.
  if (input.event === 'search' ? !term : !product) return;

  if (DEDUPED.has(input.event)) {
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);

    const existing = await UserActivity.exists({
      user,
      event: input.event,
      ...(product ? { product } : { term }),
      createdAt: { $gte: since },
    });

    if (existing) return;
  }

  await UserActivity.create({ user, event: input.event, product, term });
}

/**
 * Records an activity without making the caller wait for it.
 *
 * This is the form business services use, and the dropped promise is
 * deliberate: an `await` would put a database round trip in front of the
 * response to an action the customer has already completed, and a rejection
 * would turn a successful add-to-cart into a failed request.
 */
export function record(input: RecordInput): void {
  void write(input).catch((error: unknown) => {
    // Logged once, for an operator. The customer never learns that the store
    // keeps activity at all, let alone that a write failed.
    console.warn(
      `[activity] could not record ${input.event}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
}

/** Awaitable form, for scripts and tests that need the row to exist. */
export const recordAndWait = write;

export interface ActivityEntry {
  productId: string;
  event: ActivityEvent;
  at: Date;
}

/**
 * A customer's recent product activity, newest first.
 *
 * Bounded by both count and age. Recommendations are about what someone is
 * shopping for now, and a query that grows without limit as an account ages is
 * a query that gets slower forever.
 */
export async function recentActivity(
  userId: string,
  options: { limit?: number; days?: number } = {},
): Promise<ActivityEntry[]> {
  const user = toObjectId(userId);
  if (!user) return [];

  const limit = Math.min(options.limit ?? 120, 300);
  const since = new Date(Date.now() - (options.days ?? 90) * 24 * 60 * 60 * 1000);

  const rows = await UserActivity.find({
    user,
    product: { $ne: null },
    createdAt: { $gte: since },
  })
    .select('event product createdAt')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return rows.map((row) => ({
    productId: String(row.product),
    event: row.event as ActivityEvent,
    at: row.createdAt,
  }));
}
