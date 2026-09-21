import { Router } from 'express';
import * as controller from '../controllers/return.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const returnRouter = Router();

/**
 * Every return route is the signed-in customer acting on their own returns.
 *
 * The guard is mounted on the paths rather than remembered per route, so "is
 * this endpoint protected?" is answerable by reading these three lines — and a
 * route added later cannot be unprotected by omission. There is no route here
 * that takes a user id; ownership comes from the session and is applied inside
 * the query, not checked after it.
 */
returnRouter.use('/returns', asyncHandler(requireAuth));

returnRouter.get('/returns', asyncHandler(controller.listReturns));
returnRouter.get('/returns/:returnRef', asyncHandler(controller.getReturn));
returnRouter.post('/returns/:returnRef/cancel', asyncHandler(controller.cancelReturn));

/**
 * Raising a return lives under the order it belongs to.
 *
 * `POST /orders/:orderRef/returns` rather than `POST /returns` with an order id
 * in the body: the order is what is being acted on, it is what ownership is
 * checked against, and putting it in the path means there is no request shape
 * in which it can be absent or mismatched.
 *
 * Mounted on its own router line because `/orders` already has its guard in
 * `order.routes`, and this needs the same one.
 */
returnRouter.post(
  '/orders/:orderRef/returns',
  asyncHandler(requireAuth),
  asyncHandler(controller.createReturn),
);
