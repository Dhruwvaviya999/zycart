import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * What a signed-in customer has done, in the smallest form that supports
 * recommendations.
 *
 * Four fields: who, what, which product, when. Deliberately not an analytics
 * table — there is no session id, no device, no referrer, no IP address, no
 * page URL, no dwell time, and no copy of the product. If a field is not read
 * by the recommendation scorer, it is not here.
 *
 * Nothing in this collection is personal beyond "this account looked at that
 * product". It is never exposed through an API, never sent to a model, and
 * never leaves the recommendation service.
 */
export const ACTIVITY_EVENTS = [
  'product_view',
  'search',
  'add_to_cart',
  'wishlist_add',
  'purchase',
] as const;

export type ActivityEvent = (typeof ACTIVITY_EVENTS)[number];

/**
 * How long activity is kept.
 *
 * Ninety days, enforced by MongoDB rather than by a job somebody has to
 * remember to run. Long enough for a seasonal interest to register, short
 * enough that the collection stays small and a customer's browsing does not
 * follow them around indefinitely. Recommendations weight the last thirty days
 * most heavily anyway, so the older half of this window contributes little.
 */
export const ACTIVITY_RETENTION_DAYS = 90;

const userActivitySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: String, enum: ACTIVITY_EVENTS, required: true },

    /**
     * The product, by reference only.
     *
     * Never a copy of its name or price: those change, and a stored copy would
     * become a second source of truth for facts the catalogue owns. A product
     * deleted later leaves a dangling reference, which the recommendation
     * queries treat as absent rather than as an error.
     *
     * Optional, because a `search` event has no product.
     */
    product: { type: Schema.Types.ObjectId, ref: 'Product', default: null },

    /** The submitted search text, for `search` events only. Trimmed and capped. */
    term: { type: String, trim: true, maxlength: 120, default: null },
  },
  baseSchemaOptions,
);

/**
 * The one index recommendations actually query on: a customer's recent
 * activity, newest first. Nothing else is indexed, because nothing else is
 * read — an index serving no query is write cost with no return.
 */
userActivitySchema.index({ user: 1, createdAt: -1 });

/**
 * Retention, enforced by the database.
 *
 * A TTL index deletes expired documents on MongoDB's own schedule, so there is
 * no cleanup script to run and no way for the policy to quietly stop being
 * applied. `expireAfterSeconds` counts from `createdAt`, which `timestamps`
 * provides.
 */
userActivitySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 },
);

export type UserActivityDocument = InferSchemaType<typeof userActivitySchema>;

export const UserActivity = model('UserActivity', userActivitySchema);
