import { Router } from 'express';
import * as controller from '../controllers/product.controller';
import * as recommendationController from '../controllers/recommendation.controller';
import { adminOnly } from '../middleware/adminOnly';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const productRouter = Router();

// The literal rails are declared first; otherwise `/products/featured` would be
// read as a slug by the `:idOrSlug` route below.
productRouter.get('/products/featured', asyncHandler(controller.getFeaturedProducts));
productRouter.get('/products/best-sellers', asyncHandler(controller.getBestSellers));
productRouter.get('/products/new-arrivals', asyncHandler(controller.getNewArrivals));
productRouter.get('/products/colors', asyncHandler(controller.getColorFamilies));

productRouter.get('/products', asyncHandler(controller.getProducts));
productRouter.get('/products/:idOrSlug/related', asyncHandler(controller.getRelatedProducts));

/**
 * Similar products, added in Phase 11.
 *
 * Distinct from `/related`, which has meant "same category, best rated" since
 * Phase 3 and still does. This one scores category, brand, tags, price
 * proximity and shared variants — so the two rails on a product page answer
 * different questions instead of one being a worse copy of the other.
 */
productRouter.get('/products/:idOrSlug/similar', asyncHandler(recommendationController.getSimilar));
productRouter.get('/products/:idOrSlug', asyncHandler(controller.getProduct));

/**
 * Behind `requireAuth` rather than `optionalAuth`: a guest has no activity row
 * to write, so the request has nothing to do and should not reach the database
 * to discover that.
 */
productRouter.post(
  '/products/:idOrSlug/view',
  asyncHandler(requireAuth),
  asyncHandler(controller.recordProductView),
);

/** Writing is administrator-only, for the reasons set out in category.routes.ts. */
productRouter.post('/products', ...adminOnly, asyncHandler(controller.createProduct));
productRouter.patch('/products/:id', ...adminOnly, asyncHandler(controller.updateProduct));
productRouter.delete('/products/:id', ...adminOnly, asyncHandler(controller.deleteProduct));
