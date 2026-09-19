import mongoose, { Types } from 'mongoose';
import { Cart } from '../models/cart.model';
import {
  CANCELLABLE_STATUSES,
  Order,
  PAYABLE_PAYMENT_STATUSES,
  SETTLED_PAYMENT_STATUSES,
  type OrderStatus,
  type PaymentMethod,
} from '../models/order.model';
import { Product } from '../models/product.model';
import { AppError } from '../utils/AppError';
import { generateOrderNumber } from '../utils/orderNumber';
import { isObjectId } from '../validators/common';
import type { CancelOrderInput, OrderQuery } from '../validators/order.validator';
import { priceCart, resolveAddress } from './checkout.service';
import { record } from './activity/activity.service';

/** Raised when the catalogue has moved on since the cart was filled. */
export class AvailabilityError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

interface PlannedLine {
  productId: Types.ObjectId;
  quantity: number;
  selectedColor: string | null;
  selectedSize: string | null;
}

/**
 * Re-reads every product and refuses anything that has changed.
 *
 * Checkout is deliberately stricter than the cart: the cart clamps a quantity
 * to stock and carries on, but an order must be exactly what the customer
 * agreed to. Short stock, a withdrawn product or a variant that is no longer
 * offered stops the order rather than quietly altering it.
 */
async function buildOrderItems(lines: PlannedLine[], session: mongoose.ClientSession) {
  const products = await Product.find({ _id: { $in: lines.map((line) => line.productId) } })
    .populate('brand', 'name')
    .session(session);

  const byId = new Map(products.map((product) => [String(product._id), product]));

  return lines.map((line) => {
    const product = byId.get(String(line.productId));

    if (!product || !product.isActive) {
      throw new AvailabilityError(
        'One or more items are no longer available. Please review your cart before placing the order.',
      );
    }

    if (product.stock < line.quantity) {
      throw new AvailabilityError(
        `Only ${product.stock} left of ${product.name}. Please review your cart before placing the order.`,
      );
    }

    if (line.selectedColor && !product.colors.some((c) => c.name === line.selectedColor)) {
      throw new AvailabilityError(`${product.name} is no longer available in that colour.`);
    }

    if (line.selectedSize) {
      const size = product.sizes.find((entry) => entry.label === line.selectedSize);
      if (!size || !size.inStock) {
        throw new AvailabilityError(`${product.name} is no longer available in that size.`);
      }
    }

    const brand = product.brand as unknown as { name?: string } | null;

    // The snapshot. Everything the order page will ever show is copied now.
    return {
      product: product._id,
      productName: product.name,
      productSlug: product.slug,
      productImage: product.images[0] ?? '',
      sku: product.sku,
      brand: brand?.name ?? '',
      quantity: line.quantity,
      unitPrice: product.price,
      lineTotal: product.price * line.quantity,
      selectedColor: line.selectedColor,
      selectedSize: line.selectedSize,
    };
  });
}

/**
 * Takes the stock, atomically.
 *
 * The filter carries the sufficiency check, so the read and the write are one
 * operation — two customers racing for the last unit cannot both succeed,
 * because the second update matches nothing. Inside a transaction a failure
 * here aborts everything, so stock is never taken for an order that was not
 * created, and never taken twice for a payment confirmed twice.
 *
 * Shared by both paths on purpose: cash on delivery takes stock when the order
 * is placed, online payment takes it when the money is confirmed, and there is
 * exactly one piece of code that knows how to do it.
 */
export async function commitStock(
  items: readonly {
    product?: Types.ObjectId | null;
    quantity: number;
    productName: string;
  }[],
  session: mongoose.ClientSession,
): Promise<void> {
  for (const item of items) {
    // A deleted product leaves a snapshot with no reference; there is no row to
    // decrement, and the order still records exactly what was bought.
    if (!item.product) continue;

    const updated = await Product.findOneAndUpdate(
      { _id: item.product, isActive: true, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
      { session, new: true },
    );

    if (!updated) {
      throw new AvailabilityError(
        `${item.productName} sold out while you were checking out. Please review your cart.`,
      );
    }
  }
}

/**
 * Removes the bought lines from the cart — only those, and only by id, so
 * anything added in another tab meanwhile survives.
 */
export async function clearPurchasedCartLines(
  userId: Types.ObjectId | string,
  cartItemIds: Types.ObjectId[],
  session: mongoose.ClientSession,
): Promise<void> {
  if (cartItemIds.length === 0) return;

  await Cart.updateOne(
    { user: userId },
    { $pull: { items: { _id: { $in: cartItemIds } } } },
    { session },
  );
}

/**
 * Places the order.
 *
 * What runs inside the transaction now depends on how the order will be paid.
 *
 * Cash on delivery is unchanged from Phase 6: validate, snapshot, take stock,
 * write the order, clear the bought cart lines — all or nothing.
 *
 * Online payment stops after writing the order. Stock is **not** taken and the
 * cart is **not** cleared, because at this moment nothing has been paid and
 * most Razorpay Checkout windows that open are never completed. Holding
 * inventory for every abandoned attempt would make the last unit of a popular
 * product unbuyable by anyone who actually intends to pay. Both happen instead
 * at payment finalisation, in one transaction of their own.
 */
export async function createOrder(
  userId: string,
  addressId: string,
  paymentMethod: PaymentMethod,
): Promise<string> {
  const address = await resolveAddress(userId, addressId);

  const cart = await Cart.findOne({ user: userId });
  if (!cart || cart.items.length === 0) {
    throw new AppError('Your cart is empty', 400);
  }

  const lines: PlannedLine[] = cart.items.map((item) => ({
    productId: item.product,
    quantity: item.quantity,
    selectedColor: item.selectedColor ?? null,
    selectedSize: item.selectedSize ?? null,
  }));

  const orderedItemIds = cart.items.map((item) => new Types.ObjectId(String(item._id)));

  const takesStockNow = paymentMethod === 'COD';

  const session = await mongoose.startSession();

  try {
    let orderNumber = '';

    await session.withTransaction(async () => {
      // Validated for both methods: an online order is still only offered for
      // items that are available right now, even though the stock is taken later.
      const items = await buildOrderItems(lines, session);

      if (takesStockNow) await commitStock(items, session);

      const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

      // Retried rather than pre-checked: the unique index is the authority on
      // whether a number is free, and a collision is a one-in-a-million event.
      let created: Awaited<ReturnType<typeof Order.create>>[number] | undefined;

      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        const candidate = generateOrderNumber();

        try {
          [created] = await Order.create(
            [
              {
                orderNumber: candidate,
                user: new Types.ObjectId(userId),
                items,
                shippingAddress: {
                  fullName: address.fullName,
                  phone: address.phone,
                  addressLine1: address.addressLine1,
                  addressLine2: address.addressLine2,
                  landmark: address.landmark,
                  city: address.city,
                  state: address.state,
                  postalCode: address.postalCode,
                  country: address.country,
                },
                pricing: priceCart(subtotal),
                payment: {
                  method: paymentMethod,
                  status: 'PENDING',
                  provider: paymentMethod === 'RAZORPAY' ? 'razorpay' : null,
                },
                status: 'PENDING',
                stockCommitted: takesStockNow,
                // Remembered for the online path, which clears the cart later.
                sourceCartItemIds: orderedItemIds,
              },
            ],
            { session },
          );
        } catch (error) {
          const duplicate =
            typeof error === 'object' &&
            error !== null &&
            (error as { code?: number }).code === 11000;
          if (!duplicate || attempt === 4) throw error;
        }
      }

      if (!created) throw new AppError('Could not place the order. Please try again.', 500);

      orderNumber = created.orderNumber;

      // Only the lines that were actually bought: anything added in another tab
      // mid-checkout survives. Deferred to payment for the online path, so an
      // abandoned payment leaves the cart untouched.
      if (takesStockNow) {
        await clearPurchasedCartLines(userId, orderedItemIds, session);
      }
    });

    /**
     * Purchase signals come from here — an order that actually committed —
     * rather than from the browser telling us it thinks one did. Recorded after
     * the transaction so a rolled-back order leaves no trace, and outside it so
     * a recommendation write can never hold open or fail a payment path.
     */
    for (const line of lines) {
      record({ userId, event: 'purchase', productId: line.productId });
    }

    return orderNumber;
  } finally {
    await session.endSession();
  }
}

type OrderDoc = InstanceType<typeof Order>;

/**
 * Whether this order can still be paid online.
 *
 * Read by the API so the "Pay now" affordance and the endpoint that backs it
 * agree on one rule, rather than the interface guessing and the server
 * deciding.
 */
export function canRetryPayment(order: OrderDoc): boolean {
  return (
    order.payment.method === 'RAZORPAY' &&
    order.status === 'PENDING' &&
    PAYABLE_PAYMENT_STATUSES.includes(order.payment.status)
  );
}

/**
 * Whether the customer may cancel this order themselves.
 *
 * An order with money already taken is excluded: refunding a captured payment
 * on request is a customer-refund system, which this phase does not build, and
 * offering a button that silently does not refund would be worse than not
 * offering it. Those orders are cancellable by support, and the interface says
 * so instead of pretending.
 */
export function canCancel(order: OrderDoc): boolean {
  return (
    CANCELLABLE_STATUSES.includes(order.status) &&
    !SETTLED_PAYMENT_STATUSES.includes(order.payment.status)
  );
}

/** The order list only needs enough to recognise an order, never the whole thing. */
export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  itemCount: number;
  total: number;
  createdAt: string;
  paymentMethod: string;
  paymentStatus: string;
  canPayNow: boolean;
  /** A couple of thumbnails so the row is recognisable at a glance. */
  preview: { name: string; image: string }[];
}

function toListItem(order: OrderDoc): OrderListItem {
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    total: order.pricing.total,
    createdAt: order.createdAt.toISOString(),
    paymentMethod: order.payment.method,
    paymentStatus: order.payment.status,
    canPayNow: canRetryPayment(order),
    preview: order.items.slice(0, 3).map((item) => ({
      name: item.productName,
      image: item.productImage,
    })),
  };
}

export async function listOrders(userId: string, query: OrderQuery) {
  const filter = {
    user: new Types.ObjectId(userId),
    ...(query.status ? { status: query.status } : {}),
  };

  const [orders, total] = await Promise.all([
    Order.find(filter)
      // The list endpoint deliberately leaves the snapshot behind.
      .select('orderNumber status items pricing payment createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Order.countDocuments(filter),
  ]);

  return {
    items: orders.map(toListItem),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

/**
 * Loads one order, scoped to its owner.
 *
 * The ownership filter is part of the query rather than a check afterwards, so
 * another customer's order is simply not found — the response cannot
 * distinguish "someone else's" from "does not exist", which is the point.
 */
export async function findOwnedOrder(
  userId: string,
  orderRef: string,
  session?: mongoose.ClientSession,
): Promise<OrderDoc> {
  const filter = {
    user: new Types.ObjectId(userId),
    ...(isObjectId(orderRef) ? { _id: orderRef } : { orderNumber: orderRef.toUpperCase() }),
  };

  const query = Order.findOne(filter);
  if (session) query.session(session);

  const order = await query;
  if (!order) throw new AppError('Order not found', 404);

  return order;
}

/**
 * What the customer is told about their payment.
 *
 * The gateway order id is included because it is the reference a customer
 * quotes to support, and it is useless to anyone without the API secret. The
 * superseded ids from earlier attempts are not: they are an audit trail for the
 * server, not information the order page has any use for.
 */
export interface OrderPaymentView {
  method: string;
  status: string;
  provider: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  failureReason: string | null;
  refundId: string | null;
  refundedAt: string | null;
}

function toPaymentView(order: OrderDoc): OrderPaymentView {
  const payment = order.payment;

  return {
    method: payment.method,
    status: payment.status,
    provider: payment.provider ?? null,
    razorpayOrderId: payment.razorpayOrderId ?? null,
    razorpayPaymentId: payment.razorpayPaymentId ?? null,
    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
    failureReason: payment.failureReason ?? null,
    refundId: payment.refundId ?? null,
    refundedAt: payment.refundedAt ? payment.refundedAt.toISOString() : null,
  };
}

export interface OrderDetail extends Omit<OrderListItem, 'preview'> {
  items: OrderDoc['items'];
  shippingAddress: OrderDoc['shippingAddress'];
  pricing: OrderDoc['pricing'];
  payment: OrderPaymentView;
  cancellationReason: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  canCancel: boolean;
}

export function toDetail(order: OrderDoc): OrderDetail {
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    total: order.pricing.total,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    paymentMethod: order.payment.method,
    paymentStatus: order.payment.status,
    canPayNow: canRetryPayment(order),
    items: order.items,
    shippingAddress: order.shippingAddress,
    pricing: order.pricing,
    payment: toPaymentView(order),
    cancellationReason: order.cancellationReason ?? null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    canCancel: canCancel(order),
  };
}

export async function getOrder(userId: string, orderRef: string): Promise<OrderDetail> {
  return toDetail(await findOwnedOrder(userId, orderRef));
}

/**
 * Loads one order by number or id, with **no ownership filter**.
 *
 * Exported for the admin routes, which are guarded by `requireRole('ADMIN')`
 * rather than by ownership. Deliberately a separate function from
 * `findOwnedOrder` rather than an optional flag on it: a scoping rule that can
 * be switched off by passing an argument is a scoping rule waiting to be
 * switched off by accident.
 */
export async function findOrderByRef(
  orderRef: string,
  session?: mongoose.ClientSession,
): Promise<OrderDoc> {
  const filter = isObjectId(orderRef) ? { _id: orderRef } : { orderNumber: orderRef.toUpperCase() };

  const query = Order.findOne(filter);
  if (session) query.session(session);

  const order = await query;
  if (!order) throw new AppError('Order not found', 404);

  return order;
}

/**
 * The order lifecycle, as a graph rather than as scattered `if` statements.
 *
 * One declaration, on the server, consulted by the only function that changes a
 * status — so "may this order move there?" has exactly one answer, and the
 * admin console asks rather than decides. Nothing reaches DELIVERED without
 * having been SHIPPED, and neither DELIVERED nor CANCELLED leads anywhere:
 * those are where an order's fulfilment story ends.
 */
export const ORDER_STATUS_FLOW: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/**
 * Where this order may go next.
 *
 * Sent to the admin console so the interface offers only reachable states
 * rather than every value of the enum. The server still checks — this exists so
 * that a dropdown never contains a choice that would be refused.
 */
export function allowedNextStatuses(order: OrderDoc): OrderStatus[] {
  const next = [...(ORDER_STATUS_FLOW[order.status] ?? [])];

  // A settled payment cannot be cancelled here; see `applyCancellation`.
  return SETTLED_PAYMENT_STATUSES.includes(order.payment.status)
    ? next.filter((status) => status !== 'CANCELLED')
    : next;
}

/**
 * Cancels one order in place, inside a caller's transaction.
 *
 * This is the only code in ZyCart that puts stock back, and the customer's own
 * cancellation and the administrator's operational one both go through it —
 * which is what stops the admin console from growing a second, subtly different
 * copy of inventory restoration.
 *
 * `stockCommitted` is what makes restoring conditional and safe. A
 * cash-on-delivery order took its stock at creation and gives it back here. An
 * online order that was never paid took none, and restoring for it would
 * conjure inventory out of an abandoned checkout. The flag is cleared in the
 * same write, so a second cancellation cannot restore a second time.
 */
async function applyCancellation(
  order: OrderDoc,
  reason: string,
  session: mongoose.ClientSession,
): Promise<void> {
  if (order.status === 'CANCELLED') {
    throw new AppError('This order has already been cancelled', 409);
  }

  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    throw new AppError(
      `An order that is already ${order.status.toLowerCase()} can no longer be cancelled`,
      409,
    );
  }

  /**
   * A settled payment is refused — for the customer *and* for the administrator.
   *
   * Cancelling a paid order means refunding it, and ZyCart has no
   * customer-refund machinery: the only refund Phase 7 performs is the
   * automatic one for a captured payment that cannot be fulfilled. An admin
   * button that cancelled a paid order would quietly keep the money, which is
   * worse than one that declines and says why.
   */
  if (SETTLED_PAYMENT_STATUSES.includes(order.payment.status)) {
    throw new AppError(
      'This order has already been paid. Cancelling it would require a refund, which has to be arranged through support.',
      409,
    );
  }

  if (order.stockCommitted) {
    for (const item of order.items) {
      if (!item.product) continue;

      await Product.updateOne(
        { _id: item.product },
        { $inc: { stock: item.quantity } },
        { session },
      );
    }

    order.stockCommitted = false;
  }

  order.status = 'CANCELLED';
  order.cancellationReason = reason;
  order.cancelledAt = new Date();

  await order.save({ session });
}

/**
 * Moves an order along its lifecycle, on an administrator's instruction.
 *
 * Deliberately narrow. It changes fulfilment state and nothing else: the
 * snapshot, the pricing, the address and — above all — the payment are not
 * reachable from here, so marking an order DELIVERED can never be used as a
 * back door to assert that it was paid for.
 *
 * Cancelling routes through the same `applyCancellation` the customer's own
 * cancellation uses, so the stock comes back exactly once and by exactly the
 * same rules.
 */
export async function setOrderStatus(
  orderRef: string,
  next: OrderStatus,
  note?: string,
): Promise<OrderDetail> {
  const session = await mongoose.startSession();

  try {
    let updated: OrderDoc | undefined;

    await session.withTransaction(async () => {
      const order = await findOrderByRef(orderRef, session);

      if (order.status === next) {
        throw new AppError(`This order is already ${next.toLowerCase()}.`, 409);
      }

      if (!ORDER_STATUS_FLOW[order.status].includes(next)) {
        throw new AppError(
          `An order that is ${order.status.toLowerCase()} cannot be moved to ${next.toLowerCase()}.`,
          409,
        );
      }

      if (next === 'CANCELLED') {
        await applyCancellation(order, note?.trim() || 'Cancelled by ZyCart', session);
      } else {
        order.status = next;
        await order.save({ session });
      }

      updated = order;
    });

    if (!updated) throw new AppError('Could not update the order', 500);
    return toDetail(updated);
  } finally {
    await session.endSession();
  }
}

/**
 * Cancels an order the customer owns.
 *
 * The ownership lookup is the only thing this adds over the shared
 * cancellation; everything that touches stock or state lives in one place.
 */
export async function cancelOrder(
  userId: string,
  orderRef: string,
  input: CancelOrderInput,
): Promise<OrderDetail> {
  const session = await mongoose.startSession();

  try {
    let cancelled: OrderDoc | undefined;

    await session.withTransaction(async () => {
      const order = await findOwnedOrder(userId, orderRef, session);

      const reason = input.note?.trim() ? `${input.reason} — ${input.note.trim()}` : input.reason;

      await applyCancellation(order, reason, session);
      cancelled = order;
    });

    if (!cancelled) throw new AppError('Could not cancel the order', 500);
    return toDetail(cancelled);
  } finally {
    await session.endSession();
  }
}
