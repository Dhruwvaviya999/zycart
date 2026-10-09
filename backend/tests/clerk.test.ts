import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { User as ClerkUser } from '@clerk/express';
import { authenticateOptions } from '../src/config/clerk';
import { loadEnv } from '../src/config/env';
import { profileOf } from '../src/services/auth/clerk-sync';

/**
 * Clerk owns sign-in; these are the decisions ZyCart still makes about it —
 * which keys it will boot with, which tokens it accepts, and what it copies
 * out of a Clerk user into an account.
 */

const BASE = {
  MONGODB_URI: 'mongodb://localhost:27017/zycart-test',
  JWT_SECRET: 'x'.repeat(48),
  CLERK_SECRET_KEY: `sk_test_${'x'.repeat(40)}`,
  CLERK_PUBLISHABLE_KEY: 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k',
} as const;

const env = (overrides: Record<string, string> = {}) => loadEnv({ ...BASE, ...overrides });

/** Only what `profileOf` reads; the SDK's class carries far more. */
function clerkUser(overrides: {
  email?: string | null;
  verified?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  hasImage?: boolean;
  lastSignInAt?: number | null;
}): ClerkUser {
  const email = overrides.email === undefined ? 'Asha@Example.COM' : overrides.email;

  return {
    id: 'user_2abc',
    firstName: overrides.firstName === undefined ? 'Asha' : overrides.firstName,
    lastName: overrides.lastName === undefined ? 'Rao' : overrides.lastName,
    hasImage: overrides.hasImage ?? false,
    imageUrl: 'https://img.clerk.com/abc',
    lastSignInAt: overrides.lastSignInAt === undefined ? 1_760_000_000_000 : overrides.lastSignInAt,
    primaryEmailAddress:
      email === null
        ? null
        : {
            emailAddress: email,
            verification: { status: overrides.verified === false ? 'unverified' : 'verified' },
          },
  } as unknown as ClerkUser;
}

describe('Clerk configuration', () => {
  it('requires both keys', () => {
    assert.throws(() => loadEnv({ ...BASE, CLERK_SECRET_KEY: '' }), /CLERK_SECRET_KEY/);
    assert.throws(() => loadEnv({ ...BASE, CLERK_PUBLISHABLE_KEY: '' }), /CLERK_PUBLISHABLE_KEY/);
  });

  it('refuses keys that are not Clerk keys', () => {
    assert.throws(() => env({ CLERK_SECRET_KEY: 'not-a-key' }), /sk_test_/);
    assert.throws(() => env({ CLERK_PUBLISHABLE_KEY: 'sk_test_swapped' }), /pk_test_/);
    assert.throws(() => env({ CLERK_WEBHOOK_SIGNING_SECRET: 'secret' }), /whsec_/);
  });

  it('refuses a secret key and a publishable key from different kinds of instance', () => {
    assert.throws(
      () => env({ CLERK_PUBLISHABLE_KEY: 'pk_live_Y2xlcmsuenljYXJ0LmV4YW1wbGUk' }),
      /different kind of Clerk instance/,
    );
  });

  it('accepts a session token only from the storefront it was minted for', () => {
    const options = authenticateOptions(env({ CLIENT_URL: 'https://shop.zycart.example/' }));

    assert.deepEqual(options.authorizedParties, ['https://shop.zycart.example']);
  });
});

describe('A Clerk user, as an account', () => {
  it('normalises the address and keeps the names', () => {
    const profile = profileOf(clerkUser({}));

    assert.deepEqual(profile, {
      clerkId: 'user_2abc',
      email: 'asha@example.com',
      emailVerified: true,
      firstName: 'Asha',
      lastName: 'Rao',
      imageUrl: '',
      lastSignInAt: new Date(1_760_000_000_000),
    });
  });

  it('carries an unverified address as unverified', () => {
    assert.equal(profileOf(clerkUser({ verified: false }))?.emailVerified, false);
  });

  it('takes the picture only when the person has one of their own', () => {
    assert.equal(profileOf(clerkUser({ hasImage: false }))?.imageUrl, '');
    assert.equal(profileOf(clerkUser({ hasImage: true }))?.imageUrl, 'https://img.clerk.com/abc');
  });

  it('leaves names empty rather than inventing them, so a sync never overwrites ours', () => {
    const profile = profileOf(clerkUser({ firstName: null, lastName: '  ' }));

    assert.equal(profile?.firstName, '');
    assert.equal(profile?.lastName, '');
  });

  it('cannot be an account without an address', () => {
    assert.equal(profileOf(clerkUser({ email: null })), null);
  });
});
