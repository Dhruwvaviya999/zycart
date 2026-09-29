import type { Request, Response } from 'express';
import * as accountService from '../services/auth/account.service';
import * as authService from '../services/auth.service';
import { getProfile } from '../services/user.service';
import { AppError } from '../utils/AppError';
import { clearAuthCookie, setAuthCookie } from '../utils/cookies';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validators/auth.validator';

/** The token only ever travels in the HTTP-only cookie, never in a response body. */
export async function register(req: Request, res: Response): Promise<void> {
  const input = registerSchema.parse(req.body);
  const { user, token } = await authService.register(input, req.env);

  // After the account exists, and unable to fail the sign-up: see
  // `sendWelcomeVerification`.
  await accountService.sendWelcomeVerification(req.env, user.id);

  setAuthCookie(res, token, req.env);
  res.status(201).json({ success: true, data: user });
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const { user, token } = await authService.login(input, req.env);

  setAuthCookie(res, token, req.env);
  res.json({ success: true, data: user });
}

/** Safe to call without a session: clearing an absent cookie is a no-op. */
export function logout(req: Request, res: Response): void {
  clearAuthCookie(res, req.env);
  res.json({ success: true, message: 'Logged out successfully' });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Not authenticated', 401);
  res.json({ success: true, data: await getProfile(req.user.id) });
}

/**
 * Always the same answer, whether or not the address has an account. See
 * `requestPasswordReset` for what that does and does not protect.
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const { email } = forgotPasswordSchema.parse(req.body);

  await accountService.requestPasswordReset(req.env, email);

  res.json({
    success: true,
    message:
      'If an account exists for that address, we have emailed it a link to reset the password.',
  });
}

/**
 * Sets the new password and signs this browser in.
 *
 * Every other session ended when the password changed; this one is issued
 * fresh, after the change, so the person who just proved they own the inbox is
 * not immediately asked to type the password they chose a moment ago.
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, password } = resetPasswordSchema.parse(req.body);

  const userId = await accountService.resetPassword(token, password);

  setAuthCookie(res, authService.issueFor(userId, req.env), req.env);
  res.json({ success: true, data: await getProfile(userId) });
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const { token } = verifyEmailSchema.parse(req.body);

  await accountService.verifyEmail(req.env, token);

  res.json({ success: true, message: 'Your email address is verified.' });
}

const RESEND_MESSAGES: Record<accountService.ResendOutcome, string> = {
  SENT: 'We have sent a new verification link. It works for 24 hours.',
  ALREADY_VERIFIED: 'Your email address is already verified.',
  // Deliberately phrased as success: the previous email is still valid, and
  // the right thing for the customer to do is check their inbox.
  COOLDOWN: 'We sent you a link a moment ago. Check your inbox, including the spam folder.',
};

export async function resendVerification(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Not authenticated', 401);

  const outcome = await accountService.resendVerification(req.env, req.user.id);

  res.json({ success: true, message: RESEND_MESSAGES[outcome] });
}
