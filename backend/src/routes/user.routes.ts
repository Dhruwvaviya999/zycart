import { Router } from 'express';
import * as controller from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const userRouter = Router();

// Everything below is the signed-in customer acting on their own record; there
// is no route that takes another user's id, so ownership cannot be confused.
userRouter.use('/users/me', asyncHandler(requireAuth));

userRouter.get('/users/me', asyncHandler(controller.getMe));
userRouter.patch('/users/me', asyncHandler(controller.updateMe));
userRouter.patch('/users/me/preferences', asyncHandler(controller.updatePreferences));

/**
 * Outside `/users/me` on purpose: the person following an opt-out link is very
 * often not signed in, and the signature in the body is what authorises it.
 * Rate-limited per IP, because it is a public write.
 */
userRouter.post(
  '/email-preferences/cart-reminders/opt-out',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many attempts. Please try again in a few minutes.',
  }),
  asyncHandler(controller.optOutOfCartReminders),
);

userRouter.get('/users/me/addresses', asyncHandler(controller.listAddresses));
userRouter.post('/users/me/addresses', asyncHandler(controller.createAddress));
userRouter.patch('/users/me/addresses/:addressId', asyncHandler(controller.updateAddress));
userRouter.delete('/users/me/addresses/:addressId', asyncHandler(controller.deleteAddress));
userRouter.patch(
  '/users/me/addresses/:addressId/default',
  asyncHandler(controller.setDefaultAddress),
);
