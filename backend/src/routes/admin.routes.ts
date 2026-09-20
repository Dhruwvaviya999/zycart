import { Router } from 'express';
import * as controller from '../controllers/admin.controller';
import * as fulfillment from '../controllers/fulfillment.controller';
import * as operations from '../controllers/inventory.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const adminRouter = Router();

/**
 * One guard, applied to the whole namespace.
 *
 * Every path below `/api/admin` passes through `requireAuth` and then
 * `requireRole('ADMIN')` before any handler runs. Mounting it once on the
 * router — rather than remembering it per route — is what makes "is this
 * endpoint protected?" answerable by looking at a single line, and what stops a
 * route added later from being unprotected by omission.
 *
 * The two guards are separate because they answer different questions: no
 * session is a 401 and retrying with credentials might help, while a signed-in
 * customer is a 403 and it would not.
 */
adminRouter.use('/admin', asyncHandler(requireAuth), requireRole('ADMIN'));

/* Dashboard ------------------------------------------------------- */

adminRouter.get('/admin/dashboard', asyncHandler(controller.getDashboard));

/* Catalogue ------------------------------------------------------- */

adminRouter.get('/admin/products', asyncHandler(controller.listProducts));
adminRouter.post('/admin/products', asyncHandler(controller.createProduct));
adminRouter.get('/admin/products/:id', asyncHandler(controller.getProduct));
adminRouter.patch('/admin/products/:id', asyncHandler(controller.updateProduct));
adminRouter.delete('/admin/products/:id', asyncHandler(controller.deleteProduct));

adminRouter.get('/admin/categories', asyncHandler(controller.listCategories));
adminRouter.post('/admin/categories', asyncHandler(controller.createCategory));
adminRouter.patch('/admin/categories/:id', asyncHandler(controller.updateCategory));
adminRouter.delete('/admin/categories/:id', asyncHandler(controller.deleteCategory));

adminRouter.get('/admin/brands', asyncHandler(controller.listBrands));
adminRouter.post('/admin/brands', asyncHandler(controller.createBrand));
adminRouter.patch('/admin/brands/:id', asyncHandler(controller.updateBrand));
adminRouter.delete('/admin/brands/:id', asyncHandler(controller.deleteBrand));

/* Commerce -------------------------------------------------------- */

adminRouter.get('/admin/orders', asyncHandler(controller.listOrders));

/**
 * Fulfilment, in bulk.
 *
 * Declared **above** the `:orderRef` routes, because `/admin/orders/bulk-status`
 * would otherwise be matched as an order whose number is "bulk-status". A
 * literal path has to be registered before the parameter that could swallow it.
 *
 * Runs the same `setOrderStatus` the single-order endpoint does, once per
 * order, and answers with a per-order outcome. There is deliberately no bulk
 * cancellation: cancelling restores stock and may owe a refund, which is a
 * decision per order rather than a checkbox column.
 */
adminRouter.patch('/admin/orders/bulk-status', asyncHandler(operations.bulkUpdateOrderStatus));

adminRouter.get('/admin/orders/:orderRef', asyncHandler(controller.getOrder));

/**
 * Fulfilment state only.
 *
 * There is deliberately no `/mark-paid` beside this. Payment state is grounded
 * in what Razorpay actually reports, and an administrative shortcut that
 * asserted it would make every "Paid" badge in ZyCart mean less.
 */
adminRouter.patch('/admin/orders/:orderRef/status', asyncHandler(controller.updateOrderStatus));

/* Fulfilment ------------------------------------------------------ */

/**
 * The parcel for one order.
 *
 * Three endpoints rather than one, because they are governed by three different
 * rules. Creation checks that the order is in a state where packing makes
 * sense; the details update accepts a correction at any point in the parcel's
 * life; the status move is checked against the shipment's transition graph and
 * carries the order along with it.
 *
 * Nested under the order because a shipment has no life of its own — it belongs
 * to exactly one order, and there is no request shape here in which that order
 * can be absent, wrong or supplied by the client as a body field.
 */
adminRouter.post('/admin/orders/:orderRef/shipment', asyncHandler(fulfillment.createShipment));
adminRouter.patch('/admin/orders/:orderRef/shipment', asyncHandler(fulfillment.updateShipment));
adminRouter.post(
  '/admin/orders/:orderRef/shipment/status',
  asyncHandler(fulfillment.updateShipmentStatus),
);

/* Returns --------------------------------------------------------- */

adminRouter.get('/admin/returns', asyncHandler(fulfillment.listReturns));

// Declared before `:returnRef`, which would otherwise match "summary" as a
// return reference — the same trap `/admin/inventory/summary` had to avoid.
adminRouter.get('/admin/returns/summary', asyncHandler(fulfillment.getReturnsSummary));

adminRouter.get('/admin/returns/:returnRef', asyncHandler(fulfillment.getReturn));

/**
 * The four decisions, each its own endpoint.
 *
 * Deliberately not one `PATCH /admin/returns/:returnRef` taking a status. Each
 * of these means something different — approving records quantities, rejecting
 * requires an explanation the customer will read, receiving decides the fate of
 * the goods, refunding moves money — and a single status endpoint would have to
 * accept the union of their bodies and work out which rules applied. Separate
 * paths mean separate schemas, and a request that does not fit one is refused
 * by the validator rather than by a branch inside a handler.
 */
adminRouter.post('/admin/returns/:returnRef/approve', asyncHandler(fulfillment.approveReturn));
adminRouter.post('/admin/returns/:returnRef/reject', asyncHandler(fulfillment.rejectReturn));
adminRouter.post('/admin/returns/:returnRef/receive', asyncHandler(fulfillment.receiveReturn));
adminRouter.post('/admin/returns/:returnRef/refund', asyncHandler(fulfillment.refundReturn));

/**
 * Asks the gateway whether a pending refund has settled.
 *
 * There is deliberately no endpoint beside this that simply marks one refunded.
 * Whether money moved is a fact at Razorpay, exactly as whether a payment was
 * captured is, and this is how ZyCart finds it out rather than asserts it.
 */
adminRouter.post(
  '/admin/returns/:returnRef/refund/check',
  asyncHandler(fulfillment.reconcileReturnRefund),
);

/* Inventory ------------------------------------------------------- */

/**
 * Stock, with its ledger.
 *
 * The adjustment endpoint is the *only* way stock changes on an administrator's
 * instruction — `PATCH /admin/products/:id` no longer accepts a `stock` field —
 * so every manual change arrives with a reason and an actor attached, and shows
 * up in both the movement history and the audit trail.
 */
adminRouter.get('/admin/inventory', asyncHandler(operations.listInventory));

// The two literal paths are declared before `:id`, which would otherwise match
// "summary" and "movements" as product ids.
adminRouter.get('/admin/inventory/summary', asyncHandler(operations.getSummary));
adminRouter.get('/admin/inventory/movements', asyncHandler(operations.listMovements));

adminRouter.get('/admin/inventory/:id', asyncHandler(operations.getInventoryItem));
adminRouter.get('/admin/inventory/:id/movements', asyncHandler(operations.listProductMovements));
adminRouter.post('/admin/inventory/:id/adjust', asyncHandler(operations.adjustStock));
adminRouter.patch('/admin/inventory/:id/threshold', asyncHandler(operations.setThreshold));

/* Operations ------------------------------------------------------ */

adminRouter.get('/admin/operations', asyncHandler(operations.getOperations));

adminRouter.get('/admin/audit-logs', asyncHandler(operations.listAuditLogs));
adminRouter.get('/admin/audit-logs/actors', asyncHandler(operations.listAuditActors));

/* Customers ------------------------------------------------------- */

adminRouter.get('/admin/customers', asyncHandler(controller.listCustomers));
adminRouter.get('/admin/customers/:id', asyncHandler(controller.getCustomer));
adminRouter.patch('/admin/customers/:id/status', asyncHandler(controller.setCustomerActive));

/* Reviews --------------------------------------------------------- */

adminRouter.get('/admin/reviews', asyncHandler(controller.listReviews));
adminRouter.get('/admin/reviews/:reviewId', asyncHandler(controller.getReview));
adminRouter.patch('/admin/reviews/:reviewId/status', asyncHandler(controller.moderateReview));
