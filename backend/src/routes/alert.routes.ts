import { Router } from 'express';
import * as controller from '../controllers/alert.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

/**
 * Back-in-stock and price-drop alerts (Phase 20).
 *
 * Signed-in only: an alert is answered by email, and the address is the
 * account's. There is no route that names a recipient, and none that takes
 * another customer's alert id — every query below is scoped to `req.user`.
 */
export const alertRouter = Router();

alertRouter.use('/alerts', asyncHandler(requireAuth));

alertRouter.get('/alerts', asyncHandler(controller.listAlerts));
alertRouter.post('/alerts', asyncHandler(controller.createAlert));
alertRouter.delete('/alerts/:alertId', asyncHandler(controller.deleteAlert));
