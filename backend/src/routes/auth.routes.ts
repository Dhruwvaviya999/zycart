import { Router } from 'express';
import * as controller from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const authRouter = Router();

/**
 * Credential endpoints are the ones worth throttling. The allowances are loose
 * enough that a person mistyping a password never meets them.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many sign-in attempts. Please try again in a few minutes.',
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many accounts created from this device. Please try again later.',
});

/**
 * Phase 18's account links.
 *
 * "Forgot password" sends mail to an address the caller names, so it is the
 * one most worth bounding: per IP here, and per account by the cooldown in the
 * service, which is what stops a thousand IPs filling one inbox. Redeeming a
 * link is bounded more loosely — a 256-bit token cannot be guessed, but there
 * is no reason to let anybody try at speed.
 */
const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many reset requests. Please try again in a few minutes.',
});

const linkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Please try again in a few minutes.',
});

const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyBy: (req) => `verify-resend:${req.user?.id ?? req.ip ?? 'unknown'}`,
  message: 'Too many requests for a new link. Please try again in a few minutes.',
});

authRouter.post('/auth/register', registerLimiter, asyncHandler(controller.register));
authRouter.post('/auth/login', loginLimiter, asyncHandler(controller.login));
authRouter.post('/auth/logout', controller.logout);
authRouter.get('/auth/me', asyncHandler(requireAuth), asyncHandler(controller.me));

authRouter.post('/auth/forgot-password', forgotLimiter, asyncHandler(controller.forgotPassword));
authRouter.post('/auth/reset-password', linkLimiter, asyncHandler(controller.resetPassword));
authRouter.post('/auth/verify-email', linkLimiter, asyncHandler(controller.verifyEmail));
authRouter.post(
  '/auth/verify-email/resend',
  asyncHandler(requireAuth),
  resendLimiter,
  asyncHandler(controller.resendVerification),
);
