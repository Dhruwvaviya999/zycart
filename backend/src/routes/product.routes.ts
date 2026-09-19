import { Router } from 'express';
import * as controller from '../controllers/product.controller';
import { adminOnly } from '../middleware/adminOnly';
import { asyncHandler } from '../utils/asyncHandler';

export const productRouter = Router();

// The literal rails are declared first; otherwise `/products/featured` would be
// read as a slug by the `:idOrSlug` route below.
productRouter.get('/products/featured', asyncHandler(controller.getFeaturedProducts));
productRouter.get('/products/best-sellers', asyncHandler(controller.getBestSellers));
productRouter.get('/products/new-arrivals', asyncHandler(controller.getNewArrivals));

productRouter.get('/products', asyncHandler(controller.getProducts));
productRouter.get('/products/:idOrSlug/related', asyncHandler(controller.getRelatedProducts));
productRouter.get('/products/:idOrSlug', asyncHandler(controller.getProduct));

/** Writing is administrator-only, for the reasons set out in category.routes.ts. */
productRouter.post('/products', ...adminOnly, asyncHandler(controller.createProduct));
productRouter.patch('/products/:id', ...adminOnly, asyncHandler(controller.updateProduct));
productRouter.delete('/products/:id', ...adminOnly, asyncHandler(controller.deleteProduct));
