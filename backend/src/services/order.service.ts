import mongoose, { Types } from 'mongoose';
import { Cart } from '../models/cart.model';
import { CANCELLABLE_STATUSES, Order, type OrderStatus } from '../models/order.model';
import { Product } from '../models/product.model';
import { AppError } from '../utils/AppError';
import { generateOrderNumber } from '../utils/orderNumber';
import { isObjectId } from '../validators/common';
import type { CancelOrderInput, OrderQuery } from '../validators/order.validator';
import { priceCart, resolveAddress } from './checkout.service';

/** Raised when the catalogue has moved on since the cart was filled. */
class AvailabilityError extends AppError {
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
 * because the second update matches nothing. Inside the transaction a failure
 * here aborts everything, so stock is never taken for an order that was not
 * created.
 */
async function reserveStock(
  items: { product: Types.ObjectId; quantity: number; productName: string }[],
  session: mongoose.ClientSession,
): Promise<void> {
  for (const item of items) {
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

export interface CreateOrderResult {
  orderNumber: string;
}

/**
 * Places the order.
 *
 * The whole thing runs in one transaction: validate, snapshot, take stock,
 * write the order, drop the purchased lines from the cart. Anything that throws
 * rolls all of it back, which is what guarantees the two states nobody ever
 * wants — an order with no stock taken, or stock taken with no order — cannot
 * occur. The cart is emptied last and only inside the successful path, so a
 * failure always leaves the customer's cart exactly as it was.
 */
export async function createOrder(userId: string, addressId: string): Promise<string> {
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

  const orderedItemIds = cart.items.map((item) => String(item._id));

  const session = await mongoose.startSession();

  try {
    let orderNumber = '';

    await session.withTransaction(async () => {
      const items = await buildOrderItems(lines, session);

      await reserveStock(items, session);

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
                payment: { method: 'COD', status: 'PENDING', provider: null },
                status: 'PENDING',
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
      // mid-checkout survives.
      await Cart.updateOne(
        { user: userId },
        { $pull: { items: { _id: { $in: orderedItemIds.map((id) => new Types.ObjectId(id)) } } } },
        { session },
      );
    });

    return orderNumber;
  } finally {
    await session.endSession();
  }
}

type OrderDoc = InstanceType<typeof Order>;

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
async function findOwnedOrder(
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

export interface OrderDetail extends Omit<OrderListItem, 'preview'> {
  items: OrderDoc['items'];
  shippingAddress: OrderDoc['shippingAddress'];
  pricing: OrderDoc['pricing'];
  payment: OrderDoc['payment'];
  cancellationReason: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  canCancel: boolean;
}

function toDetail(order: OrderDoc): OrderDetail {
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
    items: order.items,
    shippingAddress: order.shippingAddress,
    pricing: order.pricing,
    payment: order.payment,
    cancellationReason: order.cancellationReason ?? null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    canCancel: CANCELLABLE_STATUSES.includes(order.status),
  };
}

export async function getOrder(userId: string, orderRef: string): Promise<OrderDetail> {
  return toDetail(await findOwnedOrder(userId, orderRef));
}

/**
 * Cancels an order and puts the stock back.
 *
 * Both halves run in one transaction, so an order can never end up cancelled
 * with the stock still held, or the stock returned against an order that is
 * still live. Restoring is unconditional `$inc` — unlike taking stock, giving
 * it back can never fail for lack of it.
 *
 * Nothing is refunded because nothing was charged: this phase is cash on
 * delivery, and payment status stays PENDING.
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

      if (order.status === 'CANCELLED') {
        throw new AppError('This order has already been cancelled', 409);
      }

      if (!CANCELLABLE_STATUSES.includes(order.status)) {
        throw new AppError(
          `An order that is already ${order.status.toLowerCase()} can no longer be cancelled`,
          409,
        );
      }

      for (const item of order.items) {
        if (!item.product) continue;

        await Product.updateOne(
          { _id: item.product },
          { $inc: { stock: item.quantity } },
          { session },
        );
      }

      order.status = 'CANCELLED';
      order.cancellationReason = input.note?.trim()
        ? `${input.reason} — ${input.note.trim()}`
        : input.reason;
      order.cancelledAt = new Date();

      await order.save({ session });
      cancelled = order;
    });

    if (!cancelled) throw new AppError('Could not cancel the order', 500);
    return toDetail(cancelled);
  } finally {
    await session.endSession();
  }
}
