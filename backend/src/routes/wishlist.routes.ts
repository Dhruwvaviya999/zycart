import { Router } from 'express';
import * as controller from '../controllers/wishlist.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const wishlistRouter = Router();

wishlistRouter.use('/wishlist', asyncHandler(requireAuth));

wishlistRouter.get('/wishlist', asyncHandler(controller.getWishlist));
wishlistRouter.delete('/wishlist', asyncHandler(controller.clearWishlist));

wishlistRouter.post('/wishlist/items', asyncHandler(controller.addItem));
wishlistRouter.delete('/wishlist/items/:itemId', asyncHandler(controller.removeItem));
wishlistRouter.post('/wishlist/items/:itemId/move-to-cart', asyncHandler(controller.moveToCart));
