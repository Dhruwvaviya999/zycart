import { Router } from 'express';
import * as controller from '../controllers/cart.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const cartRouter = Router();

// Public: resolves a guest's lines against live products and stores nothing.
// Declared before the guard so it is not caught by it.
cartRouter.post('/cart/preview', asyncHandler(controller.previewCart));

cartRouter.use('/cart', asyncHandler(requireAuth));

cartRouter.get('/cart', asyncHandler(controller.getCart));
cartRouter.delete('/cart', asyncHandler(controller.clearCart));

cartRouter.post('/cart/merge', asyncHandler(controller.mergeCart));

cartRouter.post('/cart/items', asyncHandler(controller.addItem));
cartRouter.patch('/cart/items/:itemId', asyncHandler(controller.updateItem));
cartRouter.delete('/cart/items/:itemId', asyncHandler(controller.removeItem));
