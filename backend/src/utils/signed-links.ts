import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Links that act on an account or an address without a sign-in.
 *
 * "Stop cart reminders" and "Unsubscribe" have to work from an inbox, on a
 * phone that has never seen the storefront, for somebody who has forgotten
 * their password. So the link itself carries the authority: an HMAC over what
 * it does and to whom, keyed with the server's secret. Nobody can forge one for
 * another account, and nothing about it needs storing.
 *
 * ## Why these may be stored when reset tokens may not
 *
 * The worst a stolen opt-out link can do is switch off a reminder the owner can
 * switch back on. A reset link takes over an account. The difference in
 * consequence is the whole reason one kind rides a delivery's payload and the
 * other never touches the database.
 *
 * ## Domain separation
 *
 * The purpose is part of the signed message, so a signature minted to stop
 * cart reminders for an account cannot be replayed to unsubscribe a newsletter
 * address that happens to share its id — and the key is the JWT secret used
 * for a different purpose, which is safe precisely because of that prefix.
 */

export type SignedLinkPurpose = 'cart-reminders-opt-out' | 'newsletter-unsubscribe';

export function signLink(secret: string, purpose: SignedLinkPurpose, subject: string): string {
  return createHmac('sha256', secret).update(`${purpose}:${subject}`, 'utf8').digest('base64url');
}

/** Compared in constant time, so a signature cannot be guessed a byte at a time. */
export function verifyLink(
  secret: string,
  purpose: SignedLinkPurpose,
  subject: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signLink(secret, purpose, subject));
  const presented = Buffer.from(signature);

  return expected.length === presented.length && timingSafeEqual(expected, presented);
}
