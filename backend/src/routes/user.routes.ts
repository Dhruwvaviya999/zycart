import { Router } from 'express';
import * as controller from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const userRouter = Router();

// Everything below is the signed-in customer acting on their own record; there
// is no route that takes another user's id, so ownership cannot be confused.
userRouter.use('/users/me', asyncHandler(requireAuth));

userRouter.get('/users/me', asyncHandler(controller.getMe));
userRouter.patch('/users/me', asyncHandler(controller.updateMe));
userRouter.patch('/users/me/password', asyncHandler(controller.changePassword));

userRouter.get('/users/me/addresses', asyncHandler(controller.listAddresses));
userRouter.post('/users/me/addresses', asyncHandler(controller.createAddress));
userRouter.patch('/users/me/addresses/:addressId', asyncHandler(controller.updateAddress));
userRouter.delete('/users/me/addresses/:addressId', asyncHandler(controller.deleteAddress));
userRouter.patch(
  '/users/me/addresses/:addressId/default',
  asyncHandler(controller.setDefaultAddress),
);
