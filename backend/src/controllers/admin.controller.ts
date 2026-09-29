import type { Request, Response } from 'express';
import * as catalogueService from '../services/admin/catalogue.service';
import * as customerService from '../services/admin/customer.service';
import * as dashboardService from '../services/admin/dashboard.service';
import * as adminOrderService from '../services/admin/order.service';
import * as adminReviewService from '../services/admin/review.service';
import { getAdminInvoice } from '../services/invoices/invoice.service';
import * as brandService from '../services/brand.service';
import * as categoryService from '../services/category.service';
import * as productService from '../services/product.service';
import * as reviewService from '../services/review.service';
import { requireActor } from '../utils/actor';
import { idParamSchema, objectIdSchema } from '../validators/common';
import {
  adminCatalogueQuerySchema,
  adminCustomerQuerySchema,
  adminOrderQuerySchema,
  adminProductQuerySchema,
  adminReviewQuerySchema,
  customerStatusSchema,
  dashboardQuerySchema,
  orderStatusSchema,
} from '../validators/admin.validator';
import { createBrandSchema, updateBrandSchema } from '../validators/brand.validator';
import { createCategorySchema, updateCategorySchema } from '../validators/category.validator';
import { createProductSchema, updateProductSchema } from '../validators/product.validator';
import { moderateReviewSchema } from '../validators/review.validator';
import { orderRefSchema } from '../validators/order.validator';

/**
 * Every admin handler.
 *
 * These are thin on purpose. Each one validates, delegates and answers — and
 * the thing it delegates to is, wherever a customer-facing equivalent exists,
 * *the same function the storefront calls*. Creating a product runs Phase 3's
 * `productService.createProduct`, moderating a review runs Phase 8's
 * `reviewService.moderateReview`, and changing an order's status runs the
 * shared transition policy in the order service.
 *
 * That is the rule this file exists to enforce: an administrator gets more
 * *access*, never a different set of business rules. Nothing here writes to a
 * model directly.
 *
 * From Phase 12 every mutating handler also names its actor. It comes from
 * `requireActor`, which reads the verified session — never the body — so the
 * audit trail records who the server authenticated rather than who the request
 * claimed to be.
 */

const id = (req: Request): string => idParamSchema.parse({ id: req.params.id }).id;

const orderRef = (req: Request): string =>
  orderRefSchema.parse({ orderRef: req.params.orderRef }).orderRef;

/* ---------------------------------------------------------------- */
/* Dashboard                                                         */
/* ---------------------------------------------------------------- */

export async function getDashboard(req: Request, res: Response): Promise<void> {
  const query = dashboardQuerySchema.parse(req.query);

  res.json({ success: true, data: await dashboardService.getDashboard(query) });
}

/* ---------------------------------------------------------------- */
/* Products                                                          */
/* ---------------------------------------------------------------- */

export async function listProducts(req: Request, res: Response): Promise<void> {
  const query = adminProductQuerySchema.parse(req.query);
  const { items, pagination } = await catalogueService.listProducts(query);

  res.json({ success: true, data: items, pagination });
}

/** Reuses the storefront's detail projection, so admin sees the stored truth. */
export async function getProduct(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await productService.getProduct(id(req)) });
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  const input = createProductSchema.parse(req.body);

  res.status(201).json({
    success: true,
    data: await productService.createProduct(input, requireActor(req)),
  });
}

/**
 * Updates a product — everything except its stock.
 *
 * `stock` is not in `updateProductSchema` from Phase 12: setting a total
 * discards concurrent changes and carries no reason, so stock moves through
 * `POST /api/admin/inventory/:id/adjust` instead. A client still sending the
 * field is not rejected; it is simply not honoured.
 */
export async function updateProduct(req: Request, res: Response): Promise<void> {
  const input = updateProductSchema.parse(req.body);

  res.json({
    success: true,
    data: await productService.updateProduct(id(req), input, requireActor(req)),
  });
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  await productService.deleteProduct(id(req), requireActor(req));

  res.json({ success: true, message: 'Product deleted' });
}

/* ---------------------------------------------------------------- */
/* Categories and brands                                             */
/* ---------------------------------------------------------------- */

export async function listCategories(req: Request, res: Response): Promise<void> {
  const query = adminCatalogueQuerySchema.parse(req.query);
  const { items, pagination } = await catalogueService.listCategories(query);

  res.json({ success: true, data: items, pagination });
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const input = createCategorySchema.parse(req.body);

  res.status(201).json({ success: true, data: await categoryService.createCategory(input) });
}

export async function updateCategory(req: Request, res: Response): Promise<void> {
  const input = updateCategorySchema.parse(req.body);

  res.json({ success: true, data: await categoryService.updateCategory(id(req), input) });
}

/** The service refuses a category products still point at, and says why. */
export async function deleteCategory(req: Request, res: Response): Promise<void> {
  await categoryService.deleteCategory(id(req));

  res.json({ success: true, message: 'Category deleted' });
}

export async function listBrands(req: Request, res: Response): Promise<void> {
  const query = adminCatalogueQuerySchema.parse(req.query);
  const { items, pagination } = await catalogueService.listBrands(query);

  res.json({ success: true, data: items, pagination });
}

export async function createBrand(req: Request, res: Response): Promise<void> {
  const input = createBrandSchema.parse(req.body);

  res.status(201).json({ success: true, data: await brandService.createBrand(input) });
}

export async function updateBrand(req: Request, res: Response): Promise<void> {
  const input = updateBrandSchema.parse(req.body);

  res.json({ success: true, data: await brandService.updateBrand(id(req), input) });
}

export async function deleteBrand(req: Request, res: Response): Promise<void> {
  await brandService.deleteBrand(id(req));

  res.json({ success: true, message: 'Brand deleted' });
}

/* ---------------------------------------------------------------- */
/* Orders                                                            */
/* ---------------------------------------------------------------- */

export async function listOrders(req: Request, res: Response): Promise<void> {
  const query = adminOrderQuerySchema.parse(req.query);
  const { items, pagination } = await adminOrderService.listOrders(query);

  res.json({ success: true, data: items, pagination });
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await adminOrderService.getOrder(orderRef(req)) });
}

/** The same invoice the customer sees, built by the same function. */
export async function getOrderInvoice(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getAdminInvoice(req.env, orderRef(req)) });
}

/**
 * Moves an order along its lifecycle.
 *
 * The body carries a status and an optional note, and the validator rejects
 * anything else — there is no field here through which payment state, pricing
 * or the order snapshot could be reached.
 */
export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
  const { status, note } = orderStatusSchema.parse(req.body);

  res.json({
    success: true,
    data: await adminOrderService.updateStatus(
      req.env,
      orderRef(req),
      status,
      requireActor(req),
      note,
    ),
  });
}

/* ---------------------------------------------------------------- */
/* Customers                                                         */
/* ---------------------------------------------------------------- */

export async function listCustomers(req: Request, res: Response): Promise<void> {
  const query = adminCustomerQuerySchema.parse(req.query);
  const { items, pagination } = await customerService.listCustomers(query);

  res.json({ success: true, data: items, pagination });
}

export async function getCustomer(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await customerService.getCustomer(id(req)) });
}

/**
 * Activates or deactivates a customer.
 *
 * `isActive` only. Role is not in the schema, so this endpoint cannot make
 * anybody an administrator — deliberately out of scope, and a validation error
 * rather than an omission somebody might later "fix".
 */
export async function setCustomerActive(req: Request, res: Response): Promise<void> {
  const { isActive } = customerStatusSchema.parse(req.body);

  res.json({
    success: true,
    data: await customerService.setActive(id(req), isActive, requireActor(req)),
  });
}

/* ---------------------------------------------------------------- */
/* Reviews                                                           */
/* ---------------------------------------------------------------- */

export async function listReviews(req: Request, res: Response): Promise<void> {
  const query = adminReviewQuerySchema.parse(req.query);
  const { items, pagination } = await adminReviewService.listReviews(query);

  res.json({ success: true, data: items, pagination });
}

export async function getReview(req: Request, res: Response): Promise<void> {
  const reviewId = objectIdSchema.parse(req.params.reviewId);

  res.json({ success: true, data: await adminReviewService.getReview(reviewId) });
}

/**
 * Approves or rejects a review.
 *
 * Delegates to Phase 8's `moderateReview`, which moves the product's rating
 * aggregates in the same transaction. No admin code path writes `rating`,
 * `reviewCount` or `ratingBreakdown`.
 */
export async function moderateReview(req: Request, res: Response): Promise<void> {
  const reviewId = objectIdSchema.parse(req.params.reviewId);
  const input = moderateReviewSchema.parse(req.body);

  await reviewService.moderateReview(reviewId, input, requireActor(req));

  res.json({ success: true, data: await adminReviewService.getReview(reviewId) });
}
