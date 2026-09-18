import { Router } from 'express';
import * as controller from '../controllers/brand.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const brandRouter = Router();

brandRouter.get('/brands', asyncHandler(controller.getBrands));
brandRouter.post('/brands', asyncHandler(controller.createBrand));

brandRouter.get('/brands/:slug', asyncHandler(controller.getBrand));
brandRouter.patch('/brands/:id', asyncHandler(controller.updateBrand));
brandRouter.delete('/brands/:id', asyncHandler(controller.deleteBrand));
