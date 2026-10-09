import type { User as ClerkUser } from '@clerk/express';
import mongoose from 'mongoose';
import { clerkFor } from '../../config/clerk';
import type { Env } from '../../config/env';
import { User } from '../../models/user.model';
import { logger, serializeError } from '../../utils/logger';
import { NotificationOutbox, queueNotification } from '../notifications/notification.service';

/**
 * Where a Clerk user becomes a ZyCart account.
 *
 * Clerk owns who somebody is — their sign-in methods, their sessions, their
 * address and whether it is verified. ZyCart owns everything it stores about
 * them: role, addresses, phone, preferences, and every order, cart and review
 * that points at `User._id`. This module is the one bridge between the two,
 * and the `clerkId` it writes is the one link.
 *
 * Three callers, one rule:
 *
 *  - `requireAuth`, the first time a Clerk user is seen — sign-up, or the
 *    first sign-in after the move to Clerk;
 *  - `POST /api/auth/sync`, which the storefront calls when Clerk tells it the
 *    user changed, so a name edited in Clerk's profile shows up straight away;
 *  - the Clerk webhook, for changes made outside the storefront.
 *
 * Every one of them reads the user from Clerk's API rather than from whatever
 * the caller was holding, so events arriving late or out of order can never
 * roll an account back.
 */

type UserDoc = InstanceType<typeof User>;

/** What ZyCart keeps of a Clerk user. */
export interface ClerkProfile {
  clerkId: string;
  email: string;
  emailVerified: boolean;
  /** As Clerk has them, which may be empty: a sign-up form need not ask. */
  firstName: string;
  lastName: string;
  /** Empty unless the person has a picture of their own — Google's, or an upload. */
  imageUrl: string;
  lastSignInAt: Date | null;
}

const NAME_MAX = 60;

/**
 * Null when the user has no primary email address. Every ZyCart account has
 * one — it is where receipts go — so such a user cannot have an account until
 * they add one.
 */
export function profileOf(user: ClerkUser): ClerkProfile | null {
  const primary = user.primaryEmailAddress;
  if (!primary) return null;

  return {
    clerkId: user.id,
    email: primary.emailAddress.trim().toLowerCase(),
    emailVerified: primary.verification?.status === 'verified',
    firstName: (user.firstName ?? '').trim().slice(0, NAME_MAX),
    lastName: (user.lastName ?? '').trim().slice(0, NAME_MAX),
    imageUrl: user.hasImage ? user.imageUrl : '',
    lastSignInAt: user.lastSignInAt ? new Date(user.lastSignInAt) : null,
  };
}

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;

const isNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { status?: number }).status === 404;

/**
 * Copies Clerk's side of the account onto ours.
 *
 * Names are taken only when Clerk has them, so a sign-up form configured
 * without names never blanks a name the customer typed into ZyCart. The avatar
 * is not touched here at all: it is ZyCart's own field, seeded once at
 * creation. Returns whether the address has just become verified.
 */
function applyProfile(user: UserDoc, profile: ClerkProfile): boolean {
  const wasVerified = user.isEmailVerified;

  if (user.email !== profile.email) user.email = profile.email;
  user.isEmailVerified = profile.emailVerified;

  if (profile.firstName) user.firstName = profile.firstName;
  if (profile.lastName) user.lastName = profile.lastName;
  if (profile.lastSignInAt) user.lastLoginAt = profile.lastSignInAt;

  return !wasVerified && profile.emailVerified;
}

/**
 * Raises the welcome email, once per account.
 *
 * Never throws: an account that exists exists, and a mail problem must not
 * turn a successful sign-in into an error. The notification's key is the
 * account id, so asking twice — two first requests racing, a webhook arriving
 * after the request — still sends one.
 */
async function welcome(env: Env, user: UserDoc): Promise<void> {
  const session = await mongoose.startSession();
  const outbox = new NotificationOutbox();

  try {
    await session.withTransaction(async () => {
      await queueNotification(
        {
          event: 'WELCOME',
          entityType: 'USER',
          entityId: user._id,
          entityLabel: user.email,
          keyReference: String(user._id),
          orderNumber: '',
          userId: user._id,
          buildPayload: (recipient) => ({ customerName: recipient.firstName }),
        },
        session,
        outbox,
      );
    });

    await outbox.flush(env);
  } catch (error) {
    // The account stands; only the greeting is lost.
    logger.error('notification_failed', {
      reason: 'welcome_not_queued',
      userId: String(user._id),
      error: serializeError(error, { stack: true }),
    });
  } finally {
    await session.endSession();
  }
}

/** Saves, keeping the stored address when the new one already belongs to another account. */
async function saveProfile(user: UserDoc, previousEmail: string): Promise<void> {
  try {
    await user.save();
  } catch (error) {
    if (!isDuplicateKey(error) || user.email === previousEmail) throw error;

    logger.warn('account_link_refused', {
      reason: 'email_in_use',
      userId: String(user._id),
    });
    user.email = previousEmail;
    await user.save();
  }
}

/**
 * Whether a Clerk user id still exists. Only asked when an account is linked
 * to a different Clerk user than the one now presenting its address — which
 * is what a user deleted and recreated in Clerk looks like when no webhook
 * told us about the deletion.
 */
async function clerkUserExists(env: Env, clerkId: string): Promise<boolean> {
  try {
    await clerkFor(env).users.getUser(clerkId);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/**
 * The account for this Clerk user, creating or linking it if there is none.
 *
 * ## Linking by address, and when not to
 *
 * Somebody who had a ZyCart account before Clerk and signs in with the same
 * address — through Google, say, before the import ran — is the same person,
 * and their orders should be waiting for them. But only when Clerk has
 * *verified* the address. Otherwise anybody could sign up as
 * `someone@example.com` and inherit that customer's orders and addresses, so
 * an unverified match is refused rather than linked.
 *
 * Returns null when no account can be attached; the request is then simply
 * not authenticated.
 */
export async function upsertFromClerk(env: Env, profile: ClerkProfile): Promise<UserDoc | null> {
  const linked = await User.findOne({ clerkId: profile.clerkId });

  if (linked) {
    const previousEmail = linked.email;
    const verifiedNow = applyProfile(linked, profile);

    if (linked.isModified()) await saveProfile(linked, previousEmail);
    if (verifiedNow) await welcome(env, linked);

    return linked;
  }

  const byEmail = await User.findOne({ email: profile.email });

  if (byEmail) {
    if (!profile.emailVerified) {
      logger.warn('account_link_refused', {
        reason: 'email_unverified',
        userId: String(byEmail._id),
      });
      return null;
    }

    if (byEmail.clerkId && (await clerkUserExists(env, byEmail.clerkId))) {
      logger.warn('account_link_refused', {
        reason: 'linked_elsewhere',
        userId: String(byEmail._id),
      });
      return null;
    }

    byEmail.clerkId = profile.clerkId;
    const verifiedNow = applyProfile(byEmail, profile);

    try {
      await byEmail.save();
    } catch (error) {
      // Two first requests racing to link the same account: the other won.
      if (isDuplicateKey(error)) return User.findOne({ clerkId: profile.clerkId });
      throw error;
    }

    logger.info('account_linked', { userId: String(byEmail._id) });
    if (verifiedNow) await welcome(env, byEmail);

    return byEmail;
  }

  try {
    // `role` is never set here: the model's default is USER, so no sign-up
    // can mint an administrator. That stays `pnpm make-admin`'s job.
    const created = await User.create({
      clerkId: profile.clerkId,
      email: profile.email,
      // A greeting needs something to say: the address's local part stands in
      // until the customer adds a name.
      firstName: profile.firstName || profile.email.split('@')[0]!.slice(0, NAME_MAX),
      lastName: profile.lastName,
      avatar: profile.imageUrl,
      isEmailVerified: profile.emailVerified,
      lastLoginAt: profile.lastSignInAt ?? new Date(),
    });

    logger.info('account_provisioned', { userId: String(created._id) });
    if (created.isEmailVerified) await welcome(env, created);

    return created;
  } catch (error) {
    if (isDuplicateKey(error)) return User.findOne({ clerkId: profile.clerkId });
    throw error;
  }
}

/** Reads the user from Clerk and brings the account up to date. */
export async function syncClerkUser(env: Env, clerkId: string): Promise<UserDoc | null> {
  let clerkUser: ClerkUser;

  try {
    clerkUser = await clerkFor(env).users.getUser(clerkId);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }

  const profile = profileOf(clerkUser);

  if (!profile) {
    logger.warn('account_link_refused', { reason: 'no_email' });
    return null;
  }

  return upsertFromClerk(env, profile);
}

/**
 * The account behind a verified Clerk session, or null.
 *
 * The common case is one indexed read. Clerk's API is only called the first
 * time a Clerk user is seen.
 */
export async function accountForSession(env: Env, clerkId: string): Promise<UserDoc | null> {
  const user = await User.findOne({ clerkId }).select('firstName lastName email role isActive');
  return user ?? syncClerkUser(env, clerkId);
}

/**
 * Clerk deleted the user: the account is deactivated and unlinked.
 *
 * Not deleted — its orders, returns and reviews are the store's records as
 * much as the customer's. Unlinking means that if the same person signs up
 * again, the new Clerk user is matched to this account by address and finds
 * it deactivated, which an administrator can reverse.
 */
export async function unlinkClerkUser(clerkId: string): Promise<void> {
  const user = await User.findOneAndUpdate(
    { clerkId },
    { $set: { isActive: false, clerkId: null } },
  ).select('_id');

  if (user) logger.info('account_unlinked', { userId: String(user._id) });
}

/** Clerk's own record of a sign-in, mirrored for the admin console. */
export async function recordSignIn(clerkId: string, at: Date): Promise<void> {
  await User.updateOne({ clerkId }, { $set: { lastLoginAt: at } });
}

/**
 * Pushes a name changed in ZyCart's profile form to Clerk, so the two never
 * disagree and the webhook that follows has nothing to undo.
 */
export async function pushName(
  env: Env,
  clerkId: string,
  name: { firstName: string; lastName: string },
): Promise<void> {
  await clerkFor(env).users.updateUser(clerkId, name);
}

/**
 * Mirrors an administrator's deactivation into Clerk.
 *
 * ZyCart already refuses an inactive account on every request, so this is not
 * what enforces it. It is what stops the person signing in to Clerk at all —
 * otherwise they would arrive signed in to a store that refuses them, which
 * reads as a broken site rather than a closed account. Banning also ends their
 * existing Clerk sessions.
 *
 * Best effort: the store's own refusal already holds, so a Clerk outage is
 * logged rather than allowed to fail the administrator's action.
 */
export async function setClerkBan(env: Env, clerkId: string, banned: boolean): Promise<void> {
  try {
    const users = clerkFor(env).users;
    await (banned ? users.banUser(clerkId) : users.unbanUser(clerkId));
  } catch (error) {
    logger.error('clerk_ban_failed', { banned, error: serializeError(error) });
  }
}
