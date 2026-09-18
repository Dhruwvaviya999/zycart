import { Router } from 'express';
import * as controller from '../controllers/checkout.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const checkoutRouter = Router();

checkoutRouter.use('/checkout', asyncHandler(requireAuth));

checkoutRouter.get('/checkout/summary', asyncHandler(controller.getSummary));
