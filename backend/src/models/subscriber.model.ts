import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * Where a newsletter address stands.
 *
 * - **PENDING** — somebody typed it into a form. That proves nothing about who
 *   owns it, so nothing is sent to it except the one message asking.
 * - **SUBSCRIBED** — its owner followed the confirmation link. Double opt-in is
 *   the only state in which this address may be exported for a campaign.
 * - **UNSUBSCRIBED** — its owner said stop. Kept rather than deleted, so a
 *   later export cannot quietly resurrect an address that asked to leave.
 */
export const SUBSCRIBER_STATUSES = ['PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED'] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

/** Where on the storefront the address was entered. A label, never free text. */
export const SUBSCRIBER_SOURCES = ['homepage', 'footer', 'account'] as const;
export type SubscriberSource = (typeof SUBSCRIBER_SOURCES)[number];

/**
 * One newsletter address.
 *
 * Deliberately not tied to `User`. Anybody may subscribe, signed in or not, and
 * a customer's account email and their newsletter address are different facts
 * that happen to be equal more often than not. Joining them would mean an
 * account deletion silently unsubscribes somebody, or an unsubscribe changes an
 * account — neither of which anybody asked for.
 *
 * The confirmation token follows the same rule as account tokens: only its
 * hash is stored, and the raw value exists in exactly one email.
 */
const subscriberSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    status: { type: String, enum: SUBSCRIBER_STATUSES, required: true, default: 'PENDING' },
    source: { type: String, enum: SUBSCRIBER_SOURCES, required: true, default: 'homepage' },

    confirmTokenHash: { type: String, default: null, select: false },
    confirmTokenExpiresAt: { type: Date, default: null },

    /** The last time a confirmation was sent — the resend cooldown reads it. */
    confirmationSentAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

subscriberSchema.index({ email: 1 }, { unique: true });
subscriberSchema.index({ confirmTokenHash: 1 });
subscriberSchema.index({ status: 1, createdAt: -1 });

export type SubscriberDocument = InferSchemaType<typeof subscriberSchema>;

export const Subscriber = model('Subscriber', subscriberSchema);
