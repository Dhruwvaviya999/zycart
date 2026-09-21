import { Router } from 'express';
import * as controller from '../controllers/brand.controller';
import { adminOnly } from '../middleware/adminOnly';
import { asyncHandler } from '../utils/asyncHandler';

export const brandRouter = Router();

/** Reading is public; the storefront's filters depend on it. */
brandRouter.get('/brands', asyncHandler(controller.getBrands));
brandRouter.get('/brands/:slug', asyncHandler(controller.getBrand));

/** Writing is administrator-only, for the reasons set out in category.routes.ts. */
brandRouter.post('/brands', ...adminOnly, asyncHandler(controller.createBrand));
brandRouter.patch('/brands/:id', ...adminOnly, asyncHandler(controller.updateBrand));
brandRouter.delete('/brands/:id', ...adminOnly, asyncHandler(controller.deleteBrand));
