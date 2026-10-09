import 'dotenv/config';
import mongoose from 'mongoose';
import { clerkFor } from '../config/clerk';
import { connectDatabase } from '../config/database';
import { loadEnv } from '../config/env';
import { User } from '../models/user.model';

/**
 * Moves the accounts that predate Clerk into Clerk, passwords included.
 *
 * Every account with a bcrypt hash and no `clerkId` becomes a Clerk user
 * created *from that hash* — Clerk accepts bcrypt digests — so customers sign
 * in with the password they already have and never learn anything changed.
 * The account is then linked (`clerkId`) and its hash unset: from then on
 * Clerk is the only place a password lives.
 *
 *   pnpm clerk:import            # dry run: says what it would do, changes nothing
 *   pnpm clerk:import --apply    # does it
 *
 * ## Choices worth knowing about
 *
 * - **Verification status is carried over, not upgraded.** An address ZyCart
 *   never verified is created as `reserved` in Clerk — it still signs in, and
 *   nobody else can claim it, but it is not vouched for. Marking it verified
 *   would let a "Sign in with Google" for that address attach to an account
 *   somebody else may have registered with it.
 * - **A Clerk user that already has the address is linked, not duplicated** —
 *   somebody who signed up through Clerk before this ran, or a second run.
 * - **Deactivated accounts are imported banned**, so they stay unable to sign
 *   in, exactly as before.
 * - **Synthetic accounts are skipped**: the seed and verification scripts'
 *   domains, and the reserved example domains, which no inbox can receive.
 *
 * Idempotent: a second run finds nothing left to import. Safe to stop midway.
 */

const SYNTHETIC_DOMAIN = /(^|\.)(test|example|invalid|localhost|zycart\.demo)$|^example\.(com|net|org)$/;

/** `$2a$`, `$2b$` or `$2y$`, a two-digit cost, 53 characters of salt and hash. */
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Clerk's Backend API rate-limits user creation, so one account at a time with
 * a pause between; a 429 waits and retries.
 */
const PAUSE_MS = 600;
const RETRY_AFTER_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const statusOf = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null
    ? (error as { status?: number }).status
    : undefined;

/** Clerk's own explanation, which names the field at fault and nothing secret. */
function clerkMessage(error: unknown): string {
  const errors = (error as { errors?: { longMessage?: string; message?: string }[] }).errors;
  const first = Array.isArray(errors) ? errors[0] : undefined;
  return first?.longMessage ?? first?.message ?? (error instanceof Error ? error.message : String(error));
}

async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (statusOf(error) !== 429 || attempt >= 3) throw error;
      console.log(`  rate limited by Clerk; waiting ${RETRY_AFTER_MS / 1000}s`);
      await sleep(RETRY_AFTER_MS);
    }
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const apply = process.argv.includes('--apply');
  const clerk = clerkFor(env);

  await connectDatabase(env.MONGODB_URI);
  console.log(`Database: ${mongoose.connection.name}`);
  console.log(`Clerk:    ${env.CLERK_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test'} instance`);
  console.log(apply ? 'Mode:     APPLY\n' : 'Mode:     dry run (pass --apply to import)\n');

  // The partial unique index on `clerkId` must exist before anything is linked.
  await User.createIndexes();

  const candidates = await User.find({ clerkId: null })
    .select('+password email firstName lastName isEmailVerified isActive createdAt')
    .sort({ createdAt: 1 });

  const tally = { imported: 0, linked: 0, skipped: 0, failed: 0 };

  for (const user of candidates) {
    const domain = user.email.split('@')[1] ?? '';

    if (SYNTHETIC_DOMAIN.test(domain)) {
      tally.skipped += 1;
      continue;
    }

    if (!user.password || !BCRYPT_HASH.test(user.password)) {
      console.log(`  skip    ${user.email}  (no password hash to carry over)`);
      tally.skipped += 1;
      continue;
    }

    try {
      const { data: existing } = await withRetry(() =>
        clerk.users.getUserList({ emailAddress: [user.email], limit: 1 }),
      );
      const match = existing[0];

      if (match) {
        console.log(`  link    ${user.email}  → ${match.id} (already in Clerk)`);
        if (apply) {
          await User.updateOne(
            { _id: user._id },
            { $set: { clerkId: match.id }, $unset: { password: 1 } },
          );
        }
        tally.linked += 1;
      } else {
        console.log(
          `  import  ${user.email}${user.isEmailVerified ? '' : '  (unverified)'}` +
            `${user.isActive ? '' : '  (deactivated → banned)'}`,
        );

        if (apply) {
          const created = await withRetry(() =>
            clerk.users.createUser({
              externalId: String(user._id),
              emailAddress: [user.email],
              emailAddressIdentificationStatus: [user.isEmailVerified ? 'verified' : 'reserved'],
              firstName: user.firstName,
              ...(user.lastName ? { lastName: user.lastName } : {}),
              passwordDigest: user.password!,
              passwordHasher: 'bcrypt',
              skipLegalChecks: true,
              banned: !user.isActive,
              ...(user.createdAt ? { createdAt: user.createdAt } : {}),
            }),
          );

          await User.updateOne(
            { _id: user._id },
            { $set: { clerkId: created.id }, $unset: { password: 1 } },
          );
        }
        tally.imported += 1;
      }
    } catch (error) {
      console.log(`  FAILED  ${user.email}  ${clerkMessage(error)}`);
      tally.failed += 1;
    }

    if (apply) await sleep(PAUSE_MS);
  }

  /**
   * Accounts linked before this ran — signed in through Google, say — keep a
   * hash nothing will ever check again. Clerk cannot take a digest for an
   * existing user, so the hash is dropped rather than carried over: they sign
   * in the way they already did.
   */
  const stale = await User.countDocuments({
    clerkId: { $type: 'string' },
    password: { $exists: true },
  });

  if (stale > 0) {
    console.log(`\n  ${stale} already-linked account(s) still hold an old hash; ${apply ? 'removing' : 'would remove'} it.`);
    if (apply) {
      await User.updateMany(
        { clerkId: { $type: 'string' }, password: { $exists: true } },
        { $unset: { password: 1 } },
      );
    }
  }

  const verb = apply ? '' : ' (dry run — nothing changed)';
  console.log(
    `\nImported ${tally.imported}, linked ${tally.linked}, skipped ${tally.skipped}, failed ${tally.failed}${verb}.`,
  );
  if (tally.failed > 0) process.exitCode = 1;

  await mongoose.disconnect();
}

main().catch(async (error: unknown) => {
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
