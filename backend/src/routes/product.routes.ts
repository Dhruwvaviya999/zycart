import { Router } from 'express';
import * as controller from '../controllers/product.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const productRouter = Router();

// The literal rails are declared first; otherwise `/products/featured` would be
// read as a slug by the `:idOrSlug` route below.
productRouter.get('/products/featured', asyncHandler(controller.getFeaturedProducts));
productRouter.get('/products/best-sellers', asyncHandler(controller.getBestSellers));
productRouter.get('/products/new-arrivals', asyncHandler(controller.getNewArrivals));

productRouter.get('/products', asyncHandler(controller.getProducts));
productRouter.post('/products', asyncHandler(controller.createProduct));

productRouter.get('/products/:idOrSlug/related', asyncHandler(controller.getRelatedProducts));
productRouter.get('/products/:idOrSlug', asyncHandler(controller.getProduct));

productRouter.patch('/products/:id', asyncHandler(controller.updateProduct));
productRouter.delete('/products/:id', asyncHandler(controller.deleteProduct));
