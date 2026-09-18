import { Router } from 'express';
import * as controller from '../controllers/category.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const categoryRouter = Router();

categoryRouter.get('/categories', asyncHandler(controller.getCategories));
categoryRouter.post('/categories', asyncHandler(controller.createCategory));

categoryRouter.get('/categories/:slug', asyncHandler(controller.getCategory));
categoryRouter.patch('/categories/:id', asyncHandler(controller.updateCategory));
categoryRouter.delete('/categories/:id', asyncHandler(controller.deleteCategory));
