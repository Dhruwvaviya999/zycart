import { Router } from 'express';
import * as controller from '../controllers/admin.controller';
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
adminRouter.get('/admin/orders/:orderRef', asyncHandler(controller.getOrder));

/**
 * Fulfilment state only.
 *
 * There is deliberately no `/mark-paid` beside this. Payment state is grounded
 * in what Razorpay actually reports, and an administrative shortcut that
 * asserted it would make every "Paid" badge in ZyCart mean less.
 */
adminRouter.patch('/admin/orders/:orderRef/status', asyncHandler(controller.updateOrderStatus));

/* Customers ------------------------------------------------------- */

adminRouter.get('/admin/customers', asyncHandler(controller.listCustomers));
adminRouter.get('/admin/customers/:id', asyncHandler(controller.getCustomer));
adminRouter.patch('/admin/customers/:id/status', asyncHandler(controller.setCustomerActive));

/* Reviews --------------------------------------------------------- */

adminRouter.get('/admin/reviews', asyncHandler(controller.listReviews));
adminRouter.get('/admin/reviews/:reviewId', asyncHandler(controller.getReview));
adminRouter.patch('/admin/reviews/:reviewId/status', asyncHandler(controller.moderateReview));
