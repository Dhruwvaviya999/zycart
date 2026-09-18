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
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  let suffix = '';
  for (let index = 0; index < 4; index += 1) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }

  return `ZYC-${date}-${suffix}`;
}
