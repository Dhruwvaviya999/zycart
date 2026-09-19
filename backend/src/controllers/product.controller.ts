import type { Request, Response } from 'express';
import { z } from 'zod';
import * as productService from '../services/product.service';
import { record } from '../services/activity/activity.service';
import { idOrSlugParamSchema, idParamSchema } from '../validators/common';
import {
  createProductSchema,
  productQuerySchema,
  updateProductSchema,
} from '../validators/product.validator';

/** Merchandising rails are short by nature; the cap keeps a stray `?limit=` cheap. */
const railQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(8),
});

export async function getProducts(req: Request, res: Response): Promise<void> {
  const query = productQuerySchema.parse(req.query);
  const { items, pagination } = await productService.listProducts(query);

  res.json({ success: true, data: items, pagination });
}

export async function getProduct(req: Request, res: Response): Promise<void> {
  const { idOrSlug } = idOrSlugParamSchema.parse(req.params);
  res.json({ success: true, data: await productService.getProduct(idOrSlug) });
}

export async function getRelatedProducts(req: Request, res: Response): Promise<void> {
  const { idOrSlug } = idOrSlugParamSchema.parse(req.params);
  const { limit } = railQuerySchema.parse(req.query);

  res.json({ success: true, data: await productService.listRelated(idOrSlug, limit) });
}

/** The colour families worth offering as a filter. Public and cheap. */
export async function getColorFamilies(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await productService.listColorFamilies() });
}

export async function getFeaturedProducts(req: Request, res: Response): Promise<void> {
  const { limit } = railQuerySchema.parse(req.query);
  res.json({ success: true, data: await productService.listFeatured(limit) });
}

export async function getBestSellers(req: Request, res: Response): Promise<void> {
  const { limit } = railQuerySchema.parse(req.query);
  res.json({ success: true, data: await productService.listBestSellers(limit) });
}

export async function getNewArrivals(req: Request, res: Response): Promise<void> {
  const { limit } = railQuerySchema.parse(req.query);
  res.json({ success: true, data: await productService.listNewArrivals(limit) });
}

/**
 * Records that the signed-in customer opened this product page.
 *
 * Deliberately not a general analytics endpoint. The event type is fixed by the
 * route, the product is resolved and validated server-side, and the customer
 * comes from the session cookie — so the three things a browser could lie about
 * are the three things it cannot set. The worst a crafted request can do is
 * claim to have viewed a product it did not, which is also true of actually
 * loading the page.
 *
 * Answers 202 and an empty body: the customer is not waiting on this, and there
 * is nothing to tell them about it.
 */
export async function recordProductView(req: Request, res: Response): Promise<void> {
  const { idOrSlug } = idOrSlugParamSchema.parse(req.params);

  // Resolved rather than trusted, so a slug becomes the id the activity
  // collection stores and an unknown handle records nothing.
  const product = (await productService.getProduct(idOrSlug)) as { id?: string };

  if (req.user && product.id) {
    record({ userId: req.user.id, event: 'product_view', productId: product.id });
  }

  res.status(202).json({ success: true });
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const input = createProductSchema.parse(req.body);
  res.status(201).json({ success: true, data: await productService.createProduct(input) });
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  const input = updateProductSchema.parse(req.body);

  res.json({ success: true, data: await productService.updateProduct(id, input) });
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse(req.params);
  await productService.deleteProduct(id);

  res.json({ success: true, message: 'Product deleted' });
}
