import { Router } from 'express';
import * as controller from '../controllers/category.controller';
import { adminOnly } from '../middleware/adminOnly';
import { asyncHandler } from '../utils/asyncHandler';

export const categoryRouter = Router();

/** Reading the catalogue is public; the storefront depends on it. */
categoryRouter.get('/categories', asyncHandler(controller.getCategories));
categoryRouter.get('/categories/:slug', asyncHandler(controller.getCategory));

/**
 * Writing is not.
 *
 * These were open development endpoints from Phase 3, left that way because no
 * roles existed yet. Roles exist now and an admin console uses them, so leaving
 * `POST /api/categories` unauthenticated would mean the console's front door is
 * locked while a window beside it stands open.
 *
 * The console itself calls the `/api/admin/*` equivalents; these are guarded
 * rather than deleted so anything already pointing at them keeps working — as
 * an administrator.
 */
categoryRouter.post('/categories', ...adminOnly, asyncHandler(controller.createCategory));
categoryRouter.patch('/categories/:id', ...adminOnly, asyncHandler(controller.updateCategory));
categoryRouter.delete('/categories/:id', ...adminOnly, asyncHandler(controller.deleteCategory));
