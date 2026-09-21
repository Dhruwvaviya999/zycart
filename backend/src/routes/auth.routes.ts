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

authRouter.post('/auth/register', registerLimiter, asyncHandler(controller.register));
authRouter.post('/auth/login', loginLimiter, asyncHandler(controller.login));
authRouter.post('/auth/logout', controller.logout);
authRouter.get('/auth/me', asyncHandler(requireAuth), asyncHandler(controller.me));
