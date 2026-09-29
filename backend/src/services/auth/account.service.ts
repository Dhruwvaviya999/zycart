import mongoose from 'mongoose';
import type { Env } from '../../config/env';
import { AccountToken } from '../../models/account-token.model';
import { User } from '../../models/user.model';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { hashPassword } from '../auth.service';
import { NotificationOutbox, queueNotification } from '../notifications/notification.service';
import { consumeAccountToken, issueAccountToken, lastIssuedAt } from './account-tokens';

/**
 * The two flows that prove a person reads an inbox: verifying an address, and
 * resetting a forgotten password.
 *
 * ## One shape for both
 *
 *     begin transaction
 *       retire this account's older links for the purpose
 *       store the new link's hash
 *       record the intent to email it           <- the raw token rides the outbox
 *     commit
 *     send
 *
 * and, when the link comes back:
 *
 *     begin transaction
 *       redeem the token (once, atomically)
 *       change the account
 *       record any follow-up message
 *     commit
 *
 * Nothing here holds a raw token longer than the request that minted it, and
 * nothing here writes one down. See `NotificationOutbox` for how it reaches the
 * email without touching the delivery record.
 */

/** How long a reset link works. An hour: long enough to find the email, short enough to matter. */
export const PASSWORD_RESET_TTL_MINUTES = 60;

/** How long a verification link works. A day, because nothing is at stake if it is stolen. */
export const EMAIL_VERIFICATION_TTL_HOURS = 24;

/**
 * The shortest gap between two links of the same kind to one account.
 *
 * The route's rate limiter counts per IP; this counts per account, which is
 * what stops somebody filling a stranger's inbox with reset emails from a
 * thousand addresses. A request inside the cooldown is answered exactly as one
 * outside it, and simply sends nothing.
 */
export const LINK_COOLDOWN_MS = 60_000;

type UserDoc = InstanceType<typeof User>;

const withinCooldown = (issuedAt: Date | null, now: Date = new Date()): boolean =>
  issuedAt !== null && now.getTime() - issuedAt.getTime() < LINK_COOLDOWN_MS;

/**
 * Mints a verification link and emails it. Shared by registration and "resend".
 */
async function issueVerification(env: Env, user: UserDoc): Promise<void> {
  const session = await mongoose.startSession();
  const outbox = new NotificationOutbox();

  try {
    await session.withTransaction(async () => {
      const issued = await issueAccountToken(
        user._id,
        'EMAIL_VERIFICATION',
        EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1_000,
        session,
      );

      await queueNotification(
        {
          event: 'EMAIL_VERIFICATION',
          entityType: 'USER',
          entityId: user._id,
          entityLabel: user.email,
          // One message per link, so a resend is a new delivery rather than a
          // duplicate of the first one.
          keyReference: String(issued.id),
          orderNumber: '',
          userId: user._id,
          buildPayload: (recipient) => ({
            customerName: recipient.firstName,
            expiresInHours: EMAIL_VERIFICATION_TTL_HOURS,
          }),
        },
        session,
        outbox,
        { token: issued.token },
      );
    });

    await outbox.flush(env);
  } finally {
    await session.endSession();
  }
}

/**
 * Sends the verification email that follows registration.
 *
 * Never throws. An account that was created is created, and a mail problem
 * must not turn a successful sign-up into an error — the customer can ask for
 * another link from their account page.
 */
export async function sendWelcomeVerification(env: Env, userId: string): Promise<void> {
  try {
    const user = await User.findById(userId).select('email firstName isEmailVerified');
    if (user && !user.isEmailVerified) await issueVerification(env, user);
  } catch {
    // Recorded, if it got that far, on the delivery row; the account stands.
  }
}

export type ResendOutcome = 'SENT' | 'ALREADY_VERIFIED' | 'COOLDOWN';

/** "Send me another link", from a signed-in customer. */
export async function resendVerification(env: Env, userId: string): Promise<ResendOutcome> {
  const user = await User.findById(userId).select('email firstName isEmailVerified');
  if (!user) throw new AppError('Account not found', 404);

  if (user.isEmailVerified) return 'ALREADY_VERIFIED';
  if (withinCooldown(await lastIssuedAt(user._id, 'EMAIL_VERIFICATION'))) return 'COOLDOWN';

  await issueVerification(env, user);
  return 'SENT';
}

const INVALID_VERIFICATION_LINK =
  'This verification link is invalid or has expired. Sign in and ask for a new one from your account.';

/**
 * Redeems a verification link.
 *
 * Does not need a session: the link may well be opened on a phone while the
 * customer is signed in on a laptop, and possession of the token is the proof
 * this flow exists to collect. The welcome email is raised in the same
 * transaction, once per account — an address verified a second time, after a
 * change of heart and a resend, is not welcomed twice.
 */
export async function verifyEmail(env: Env, token: string): Promise<void> {
  const session = await mongoose.startSession();
  const outbox = new NotificationOutbox();

  try {
    let verifiedUserId = '';

    await session.withTransaction(async () => {
      const userId = await consumeAccountToken(token, 'EMAIL_VERIFICATION', session);
      if (!userId) throw new AppError(INVALID_VERIFICATION_LINK, 400);

      const user = await User.findById(userId).session(session);
      if (!user) throw new AppError(INVALID_VERIFICATION_LINK, 400);

      const firstTime = !user.isEmailVerified;

      user.isEmailVerified = true;
      await user.save({ session });

      if (firstTime) {
        await queueNotification(
          {
            event: 'WELCOME',
            entityType: 'USER',
            entityId: user._id,
            entityLabel: user.email,
            // Keyed on the account, so the unique index guarantees one welcome.
            keyReference: String(user._id),
            orderNumber: '',
            userId: user._id,
            buildPayload: (recipient) => ({ customerName: recipient.firstName }),
          },
          session,
          outbox,
        );
      }

      verifiedUserId = String(user._id);
    });

    logger.info('email_verified', { userId: verifiedUserId });

    await outbox.flush(env);
  } finally {
    await session.endSession();
  }
}

/**
 * "I forgot my password."
 *
 * ## The answer is the same whatever happens
 *
 * An unknown address, a deactivated account, a request inside the cooldown and
 * a link genuinely sent all produce the same response, so the endpoint does not
 * say which addresses have accounts. It is not hardened against timing — a
 * send takes longer than a refusal — because registration already answers that
 * question outright with a 409, and pretending this endpoint was the only door
 * would be theatre.
 */
export async function requestPasswordReset(env: Env, email: string): Promise<void> {
  const user = await User.findOne({ email }).select('email firstName isActive');

  if (!user || !user.isActive) return;
  if (withinCooldown(await lastIssuedAt(user._id, 'PASSWORD_RESET'))) return;

  const session = await mongoose.startSession();
  const outbox = new NotificationOutbox();

  try {
    await session.withTransaction(async () => {
      const issued = await issueAccountToken(
        user._id,
        'PASSWORD_RESET',
        PASSWORD_RESET_TTL_MINUTES * 60 * 1_000,
        session,
      );

      await queueNotification(
        {
          event: 'PASSWORD_RESET',
          entityType: 'USER',
          entityId: user._id,
          entityLabel: user.email,
          keyReference: String(issued.id),
          orderNumber: '',
          userId: user._id,
          buildPayload: (recipient) => ({
            customerName: recipient.firstName,
            expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
          }),
        },
        session,
        outbox,
        { token: issued.token },
      );
    });

    // The account, not the address: the address is what this endpoint must not
    // confirm, and a log line is one more place it could leak from.
    logger.info('password_reset_requested', { userId: String(user._id) });

    await outbox.flush(env);
  } finally {
    await session.endSession();
  }
}

const INVALID_RESET_LINK =
  'This reset link is invalid or has expired. Request a new one to continue.';

/**
 * Redeems a reset link and sets the new password.
 *
 * Three more things happen in the same transaction, each for a reason:
 *
 *  - `passwordChangedAt` moves, which ends every session that existed before —
 *    including whichever one somebody else may have been using.
 *  - The address is marked verified. Following a link sent to it proves the
 *    same thing a verification link would.
 *  - Any other reset link still outstanding is retired, so an older email left
 *    in the inbox cannot be used to change the password again.
 *
 * Returns the account id so the caller can sign this browser in.
 */
export async function resetPassword(token: string, newPassword: string): Promise<string> {
  // Hashed before the transaction: bcrypt is deliberately slow, and a slow step
  // inside a transaction holds it open for nothing.
  const passwordHash = await hashPassword(newPassword);

  const session = await mongoose.startSession();

  try {
    let resetUserId = '';

    await session.withTransaction(async () => {
      const userId = await consumeAccountToken(token, 'PASSWORD_RESET', session);
      if (!userId) throw new AppError(INVALID_RESET_LINK, 400);

      const user = await User.findById(userId).select('+password').session(session);
      if (!user || !user.isActive) throw new AppError(INVALID_RESET_LINK, 400);

      user.password = passwordHash;
      // Backdated a second for the reason `changePassword` gives: `iat` is whole
      // seconds, and the session issued below must not predate the change.
      user.passwordChangedAt = new Date(Date.now() - 1000);
      user.isEmailVerified = true;
      await user.save({ session });

      await AccountToken.deleteMany(
        { user: user._id, purpose: 'PASSWORD_RESET', consumedAt: null },
        { session },
      );

      resetUserId = String(user._id);
    });

    logger.info('password_reset_completed', { userId: resetUserId });

    return resetUserId;
  } finally {
    await session.endSession();
  }
}
