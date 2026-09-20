import { randomInt } from 'node:crypto';

/**
 * Deliberately excludes I, O, 0 and 1: an order number gets read down a phone
 * line and typed back in, and those are the characters people get wrong.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Builds a customer-facing order number such as `ZYC-20260919-AB12`.
 *
 * The date makes it meaningful to a human; the random suffix makes it unique
 * without exposing how many orders the shop has taken, which a sequence would.
 * Uniqueness is guaranteed by the unique index, not by this function — callers
 * retry on collision.
 */
export function generateOrderNumber(now = new Date()): string {
  return reference('ZYC', now);
}

/**
 * The same shape for a return request: `ZYR-20260919-AB12`.
 *
 * A distinct prefix rather than a shared sequence, because the two get quoted
 * in the same conversation — "my order ZYC-…, the return ZYR-…" — and a
 * customer reading one out should not have to remember which kind it was. It
 * also means `orderRefSchema`'s pattern matches both, so a return number typed
 * into an order lookup fails as "not found" rather than as a validation error
 * whose wording would leak that the reference exists somewhere else.
 *
 * Uniqueness is the unique index's job here too; callers retry on collision.
 */
export function generateReturnNumber(now = new Date()): string {
  return reference('ZYR', now);
}

function reference(prefix: string, now: Date): string {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  let suffix = '';
  for (let index = 0; index < 4; index += 1) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }

  return `${prefix}-${date}-${suffix}`;
}
