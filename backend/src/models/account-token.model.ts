import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * What a single-use account link is for.
 *
 * Separate purposes so a verification link can never be replayed as a password
 * reset: the purpose is part of every lookup, and a token minted for one is
 * simply not found by the other.
 */
export const ACCOUNT_TOKEN_PURPOSES = ['PASSWORD_RESET', 'EMAIL_VERIFICATION'] as const;
export type AccountTokenPurpose = (typeof ACCOUNT_TOKEN_PURPOSES)[number];

/**
 * One single-use link sent to a customer's inbox.
 *
 * ## Only the hash is stored
 *
 * The token itself is 32 random bytes, sent once and kept nowhere. What is
 * stored is its SHA-256, which is enough to recognise the token when it comes
 * back and useless to anybody reading this collection — a database dump, a
 * backup or an over-broad admin query yields no working reset link.
 *
 * SHA-256 rather than bcrypt because the input is not a password: it has 256
 * bits of entropy, so there is nothing for a slow hash to protect against, and
 * a fast one is what allows the token to be looked up by an index.
 *
 * The raw token does not reach the notification record either. See
 * `NotificationOutbox` for how it travels from the request that mints it to the
 * email that carries it without ever being written down.
 *
 * ## Expiry
 *
 * `expiresAt` is checked on every use, and it is also a TTL index, so MongoDB
 * deletes tokens once they lapse — used or not. The TTL is housekeeping, not
 * the security control: the monitor runs about once a minute, and a token must
 * not work for that minute, which is why the check is in the query as well.
 */
const accountTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: ACCOUNT_TOKEN_PURPOSES, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    /** Set by the one request that redeems it. A second use matches nothing. */
    consumedAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

accountTokenSchema.index({ tokenHash: 1 }, { unique: true });
accountTokenSchema.index({ user: 1, purpose: 1, createdAt: -1 });
accountTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AccountTokenDocument = InferSchemaType<typeof accountTokenSchema>;

export const AccountToken = model('AccountToken', accountTokenSchema);
