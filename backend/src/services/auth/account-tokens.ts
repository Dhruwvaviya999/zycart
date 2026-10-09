import { createHash, randomBytes } from 'node:crypto';

/**
 * Single-use link tokens: minted here, stored only as a hash.
 *
 * The newsletter's double opt-in is the one flow left that sends one — account
 * links (verification, password reset) moved to Clerk. A token has 256 bits of
 * entropy, so a fast hash is enough to make a stored copy useless and still
 * lets a presented token be found by index.
 */

/** 32 random bytes, URL-safe: 43 characters, 256 bits. */
export function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The stored form. Deterministic, so a presented token can be found by index. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
