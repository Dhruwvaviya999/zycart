import { createHash, randomBytes } from 'node:crypto';
import type mongoose from 'mongoose';
import type { Types } from 'mongoose';
import { AccountToken, type AccountTokenPurpose } from '../../models/account-token.model';

/**
 * Minting and redeeming single-use account links.
 *
 * See `AccountToken` for why only a hash is stored. Everything that touches a
 * raw token is in this file, and the raw value leaves it in exactly one
 * direction: returned to the caller that is about to put it in an email.
 */

/** 32 random bytes, URL-safe: 43 characters, 256 bits. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The stored form. Deterministic, so a presented token can be found by index. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface IssuedToken {
  /** The raw value. Goes into one email and is then forgotten. */
  token: string;
  /** The record's id — a legible, non-secret reference for the delivery key. */
  id: Types.ObjectId;
  expiresAt: Date;
}

/**
 * Issues a fresh link, retiring any this account still has for the same
 * purpose. Runs inside the caller's transaction.
 *
 * Retiring the old ones means only the newest email in an inbox works. A
 * customer who asks twice and clicks the first message is told it has expired
 * and asks again, which is a small cost for there never being two live reset
 * links for one account.
 */
export async function issueAccountToken(
  userId: Types.ObjectId,
  purpose: AccountTokenPurpose,
  ttlMs: number,
  session: mongoose.ClientSession,
): Promise<IssuedToken> {
  await AccountToken.deleteMany({ user: userId, purpose, consumedAt: null }, { session });

  const token = mintToken();
  const expiresAt = new Date(Date.now() + ttlMs);

  const [created] = await AccountToken.create(
    [{ user: userId, purpose, tokenHash: hashToken(token), expiresAt }],
    { session },
  );

  if (!created) throw new Error('Could not issue an account token');

  return { token, id: created._id, expiresAt };
}

/**
 * Redeems a link, once.
 *
 * One conditional update: the purpose, the expiry and "not yet used" are all in
 * the filter, so two requests racing with the same link cannot both succeed —
 * the second matches nothing. Every way of failing returns null, and the caller
 * gives the same answer for all of them: a link that never existed, one that
 * expired and one already used are indistinguishable from the outside.
 */
export async function consumeAccountToken(
  token: string,
  purpose: AccountTokenPurpose,
  session?: mongoose.ClientSession,
): Promise<Types.ObjectId | null> {
  if (!token || token.length < 16 || token.length > 200) return null;

  const now = new Date();

  const redeemed = await AccountToken.findOneAndUpdate(
    { tokenHash: hashToken(token), purpose, consumedAt: null, expiresAt: { $gt: now } },
    { $set: { consumedAt: now } },
    { session, returnDocument: 'after' },
  );

  return redeemed?.user ?? null;
}

/** When this account was last sent a link for this purpose, for the resend cooldown. */
export async function lastIssuedAt(
  userId: Types.ObjectId,
  purpose: AccountTokenPurpose,
): Promise<Date | null> {
  const latest = await AccountToken.findOne({ user: userId, purpose })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean<{ createdAt?: Date } | null>();

  return latest?.createdAt ?? null;
}
