import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * How many virtual try-ons one account has used on one day.
 *
 * ## Why a document and not the rate limiter
 *
 * Every try is a paid image generation, so the daily allowance is a spending
 * control, not just politeness. The in-memory limiter counts per process: a
 * serverless deployment runs many processes, each with its own count, and a
 * restart forgets them all. A counter in the database is one number, shared by
 * every instance, and it survives a deploy.
 *
 * ## Why it cannot be overspent
 *
 * A try is reserved with one conditional upsert — "increment, if below the
 * limit" — against a unique `{ user, day }` pair. Two tries racing for the last
 * slot are two writes to one document; exactly one matches the filter, and the
 * other either matches nothing or collides with the unique index. Neither path
 * lets the count pass the limit.
 *
 * ## What is not here
 *
 * The photo, the result, the product, a timestamp per try. The customer's
 * picture is never stored anywhere; this records that a try happened, and only
 * as a number.
 */
const tryOnUsageSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** `2026-09-29`: the day in the store's timezone, so the allowance resets at IST midnight. */
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    count: { type: Number, required: true, min: 0, default: 0 },
  },
  baseSchemaOptions,
);

tryOnUsageSchema.index({ user: 1, day: 1 }, { unique: true });

/** A week of history is plenty to answer "is somebody hammering this?"; then it goes. */
tryOnUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export type TryOnUsageDocument = InferSchemaType<typeof tryOnUsageSchema>;

export const TryOnUsage = model('TryOnUsage', tryOnUsageSchema);
