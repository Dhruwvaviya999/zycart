import { Router } from 'express';
import * as controller from '../controllers/order.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const orderRouter = Router();

// Every order route is the signed-in customer acting on their own orders; there
// is no route that takes a user id.
orderRouter.use('/orders', asyncHandler(requireAuth));

orderRouter.get('/orders', asyncHandler(controller.listOrders));
orderRouter.post('/orders', asyncHandler(controller.createOrder));

orderRouter.get('/orders/:orderRef', asyncHandler(controller.getOrder));
orderRouter.get('/orders/:orderRef/invoice', asyncHandler(controller.getInvoice));
orderRouter.post('/orders/:orderRef/cancel', asyncHandler(controller.cancelOrder));
