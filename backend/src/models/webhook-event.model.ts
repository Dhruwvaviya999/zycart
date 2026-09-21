import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * A record that one Razorpay webhook event has been dealt with.
 *
 * Razorpay states plainly that duplicate deliveries are to be expected and that
 * `x-razorpay-event-id` is what identifies a repeat. This collection is the
 * whole of ZyCart's answer: claim the id by inserting it, and let the unique
 * index reject the second attempt. No Redis, no queue — the database already
 * knows how to enforce uniqueness across concurrent writers, which is the only
 * hard part.
 *
 * It is a fast path, not the only guard. Payment finalisation is independently
 * idempotent, because the duplicate that matters most is not a repeated webhook
 * but a webhook racing the browser callback — two different requests carrying
 * the same payment, which no event-id check could catch.
 */
const webhookEventSchema = new Schema(
  {
    /** Razorpay's `x-razorpay-event-id`. The unique index is the lock. */
    eventId: { type: String, required: true, unique: true },
    event: { type: String, required: true },

    /**
     * PROCESSING is a claim in flight. It is left behind only if the process
     * dies mid-handler; Razorpay's retry then finds it, and the finalisation
     * logic re-checks the real state rather than trusting this row.
     */
    status: {
      type: String,
      enum: ['PROCESSING', 'PROCESSED', 'IGNORED'],
      required: true,
      default: 'PROCESSING',
    },

    /** Non-sensitive breadcrumbs: ids, never payloads. */
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    order: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    outcome: { type: String, default: null },
  },
  baseSchemaOptions,
);

/**
 * Razorpay retries a failed webhook for a bounded window, so a ledger entry has
 * no value long after that. Thirty days keeps it useful for an audit without
 * growing without limit.
 */
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export type WebhookEventDocument = InferSchemaType<typeof webhookEventSchema>;

export const WebhookEvent = model('WebhookEvent', webhookEventSchema);
