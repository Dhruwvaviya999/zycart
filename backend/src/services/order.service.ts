import mongoose, { Types } from 'mongoose';
import { gstRateOf } from '../config/commerce';
import type { Env } from '../config/env';
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
import { Shipment } from '../models/shipment.model';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { generateOrderNumber } from '../utils/orderNumber';
import { isObjectId } from '../validators/common';
import type { CancelOrderInput, OrderQuery } from '../validators/order.validator';
import { resolveAddress } from './checkout.service';
import { record } from './activity/activity.service';
import { recordAudit, type AuditActor } from './admin/audit.service';
import { dispatchProductAlerts, productIdsOf } from './alerts/alert.service';
import { lookupCoupon, redeemCoupon, releaseCoupon } from './coupons/coupon.service';
import { syncShipmentToOrderStatus } from './fulfillment/shipment-sync';
import { findOrderShipment, type ShipmentView } from './fulfillment/shipment-view';
import { recordMovement } from './inventory/inventory.service';
import {
  findVariant,
  logUnrestorable,
  movementVariantOf,
  sellableQuantity,
  tracksVariants,
  variantLabel,
  writeStock,
} from './inventory/variant-stock';
import { nextInvoiceNumber } from './invoices/invoice-number';
import {
  lastNotifiedAt,
  NotificationOutbox,
  queueNotification,
} from './notifications/notification.service';
import {
  buildOrderDeliveredPayload,
  buildOrderPlacedPayload,
  buildOrderShippedPayload,
} from './notifications/payloads';
import { priceOrder } from './pricing/pricing';
import { returnability, type Returnability } from './returns/return-policy';
import { listOrderReturns, type ReturnSummary } from './returns/return-view';

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
    .populate('category', 'gstRate hsnCode')
    .session(session);

  const byId = new Map(products.map((product) => [String(product._id), product]));

  return lines.map((line) => {
    const product = byId.get(String(line.productId));

    if (!product || !product.isActive) {
      throw new AvailabilityError(
        'One or more items are no longer available. Please review your cart before placing the order.',
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

    const choice = { color: line.selectedColor, size: line.selectedSize };

    // A product that tracks stock per variant sells only the combinations it
    // lists, and only as many as that combination holds (Phase 20).
    if (tracksVariants(product) && !findVariant(product.variants, choice)) {
      throw new AvailabilityError(
        `${product.name} is no longer available in ${variantLabel(choice) || 'that option'}.`,
      );
    }

    const available = sellableQuantity(product, choice);

    if (available < line.quantity) {
      const which = tracksVariants(product) ? ` in ${variantLabel(choice)}` : '';
      throw new AvailabilityError(
        `Only ${available} left of ${product.name}${which}. Please review your cart before placing the order.`,
      );
    }

    const brand = product.brand as unknown as { name?: string } | null;
    const category = product.category as unknown as
      | { gstRate?: number | null; hsnCode?: string }
      | null;

    // The snapshot. Everything the order page will ever show is copied now —
    // from Phase 18 that includes the GST rate the goods are sold at, so a rate
    // changed next month cannot rewrite this order's invoice.
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
      gstRate: gstRateOf(category),
      hsnCode: category?.hsnCode ?? '',
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
 *
 * From Phase 12 it also writes the SALE movement that explains the decrement,
 * in the same transaction — so a unit that left the catalogue and a ledger
 * entry saying where it went either both exist or neither does. The quantity
 * before is derived from the quantity after rather than read again.
 *
 * From Phase 20 the write goes through `writeStock`, which takes the units from
 * the colour and size the line names when the product tracks stock per
 * variant. Two customers racing for the last pair of size 9 are separated by
 * the same atomic filter that separates two racing for the last unit of
 * anything — it now sits on the variant's count.
 */
export async function commitStock(
  items: readonly {
    product?: Types.ObjectId | null;
    quantity: number;
    productName: string;
    sku?: string;
    selectedColor?: string | null;
    selectedSize?: string | null;
  }[],
  session: mongoose.ClientSession,
  order: { id: Types.ObjectId; orderNumber: string },
): Promise<void> {
  for (const item of items) {
    // A deleted product leaves a snapshot with no reference; there is no row to
    // decrement, and the order still records exactly what was bought.
    if (!item.product) continue;

    const choice = { color: item.selectedColor ?? null, size: item.selectedSize ?? null };

    const outcome = await writeStock(
      {
        product: item.product,
        choice,
        quantityChange: -item.quantity,
        requireActive: true,
      },
      session,
    );

    if (outcome.status !== 'applied') {
      const label = variantLabel(choice);

      throw new AvailabilityError(
        outcome.status === 'missing_variant'
          ? `${item.productName} is no longer available in ${label || 'that option'}. Please review your cart.`
          : `${item.productName}${label ? ` (${label})` : ''} sold out while you were checking out. Please review your cart.`,
      );
    }

    await recordMovement(
      {
        product: outcome.product._id,
        productName: outcome.product.name,
        sku: outcome.product.sku,
        // The variant's own counts when the product tracks them; otherwise the
        // line's colour and size, as context for reading the timeline.
        variant: movementVariantOf(outcome, choice),
        type: 'SALE',
        quantityBefore: outcome.quantityBefore,
        quantityChange: -item.quantity,
        referenceType: 'ORDER',
        referenceId: order.id,
        referenceLabel: order.orderNumber,
      },
      session,
    );
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

/** What a customer's checkout asks for. The server decides everything else. */
export interface PlaceOrderInput {
  addressId: string;
  paymentMethod: PaymentMethod;
  couponCode?: string;
}

/**
 * Places the order.
 *
 * What runs inside the transaction depends on how the order will be paid.
 *
 * Cash on delivery is unchanged from Phase 6: validate, snapshot, take stock,
 * write the order, clear the bought cart lines — all or nothing. From Phase 18
 * the same transaction also redeems the coupon, with its limits enforced, and
 * records the confirmation email.
 *
 * Online payment stops after writing the order. Stock is **not** taken, the
 * cart is **not** cleared and the coupon is **not** redeemed, because at this
 * moment nothing has been paid and most Razorpay Checkout windows that open are
 * never completed. Holding inventory — or a limited promotion — for every
 * abandoned attempt would make it unavailable to anyone who actually intends to
 * pay. All three happen instead at payment finalisation, in one transaction of
 * their own.
 *
 * ## The price is computed here, again
 *
 * The checkout page showed the customer a total. Nothing it showed is trusted:
 * the lines are re-read from the catalogue, the coupon is re-evaluated against
 * the basket as it is now, and `priceOrder` — the function that produced the
 * figure on the page — produces the figure that is charged. If anything moved
 * in between, the order is refused or the coupon is, and the customer sees the
 * checkout again rather than a total they did not agree to.
 */
export async function createOrder(
  env: Env,
  userId: string,
  input: PlaceOrderInput,
): Promise<string> {
  const { addressId, paymentMethod, couponCode } = input;
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
  const outbox = new NotificationOutbox();

  try {
    let orderNumber = '';

    /**
     * What this order redeemed, carried out of the transaction for the log.
     *
     * A box rather than a plain `let`, for the reason the payment service
     * gives: it is written inside a callback, and TypeScript cannot see that
     * the callback has run by the time it is read.
     */
    const redeemed: { current: { code: string; discount: number } | null } = { current: null };

    await session.withTransaction(async () => {
      // Reset per attempt: `withTransaction` re-runs this callback on a write
      // conflict, and a verdict from an aborted attempt must not survive it.
      redeemed.current = null;

      // Validated for both methods: an online order is still only offered for
      // items that are available right now, even though the stock is taken later.
      const items = await buildOrderItems(lines, session);

      const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

      /**
       * The coupon, evaluated against this basket as it is at this moment.
       *
       * Refused outright rather than silently dropped: a customer who pressed
       * "Place order" beside a discount must not be charged the full price
       * because the code expired a minute ago. They are sent back to a checkout
       * that says why, and choose again.
       */
      const lookup = couponCode ? await lookupCoupon(couponCode, userId, subtotal) : null;

      if (lookup && !lookup.applicable) {
        throw new AppError(`${lookup.message} Remove the coupon to continue.`, 409);
      }

      const applied = lookup?.applicable ? lookup.applied : null;

      const priced = priceOrder(
        items.map((item) => ({ lineTotal: item.lineTotal, gstRate: item.gstRate })),
        applied?.discount ?? 0,
      );

      // Each line carries its share of the discount and its own tax split, from
      // the same computation that produced the total.
      const pricedItems = items.map((item, index) => ({ ...item, ...priced.lines[index] }));

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
                items: pricedItems,
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
                pricing: priced.pricing,
                payment: {
                  method: paymentMethod,
                  status: 'PENDING',
                  provider: paymentMethod === 'RAZORPAY' ? 'razorpay' : null,
                },
                coupon: applied
                  ? {
                      coupon: applied.coupon._id,
                      code: applied.code,
                      description: applied.description,
                      type: applied.coupon.type,
                      value: applied.coupon.value,
                      discount: priced.pricing.discount,
                    }
                  : null,
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

      /**
       * Stock is taken after the order exists, not before.
       *
       * Both happen in one transaction, so the ordering cannot affect what
       * survives a failure — it exists so the SALE movement can name the order
       * it belongs to. A ledger entry reading "−2 units" with nothing beside it
       * is the thing this phase was written to stop producing.
       */
      if (takesStockNow) {
        await commitStock(items, session, {
          id: created._id,
          orderNumber: created.orderNumber,
        });
      }

      // Only the lines that were actually bought: anything added in another tab
      // mid-checkout survives. Deferred to payment for the online path, so an
      // abandoned payment leaves the cart untouched.
      if (takesStockNow) {
        await clearPurchasedCartLines(userId, orderedItemIds, session);
      }

      if (takesStockNow && applied) {
        await redeemCoupon(
          {
            couponId: applied.coupon._id,
            code: applied.code,
            userId,
            orderId: created._id,
            orderNumber: created.orderNumber,
            discount: priced.pricing.discount,
          },
          session,
          { enforce: true },
        );

        redeemed.current = { code: applied.code, discount: priced.pricing.discount };
      }

      /**
       * A cash-on-delivery order is committed now, so the customer is told now.
       * An online order's confirmation waits for its payment — see
       * `finalizeSuccessfulPayment`.
       */
      if (takesStockNow) {
        const order = created;

        await queueNotification(
          {
            event: 'ORDER_PLACED',
            entityType: 'ORDER',
            entityId: order._id,
            entityLabel: order.orderNumber,
            orderNumber: order.orderNumber,
            userId: order.user as Types.ObjectId,
            buildPayload: (recipient) => buildOrderPlacedPayload(recipient.firstName, order),
          },
          session,
          outbox,
        );
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

    if (redeemed.current) {
      logger.info('coupon_redeemed', {
        code: redeemed.current.code,
        orderNumber,
        discount: redeemed.current.discount,
      });
    }

    // After the commit, and unable to throw: the order is placed whatever a
    // mail server does next.
    await outbox.flush(env);

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
  /**
   * How much of this order has been refunded in total, across every refund.
   *
   * Exposed because from Phase 13 a customer can get part of an order back, and
   * a payment panel that only ever said "Paid" would be hiding money that has
   * already moved. It is the same figure the server caps further refunds
   * against, so the number on the page and the rule behind it cannot disagree.
   */
  refundedAmount: number;
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
    refundedAmount: payment.refundedAmount ?? 0,
  };
}

export interface OrderDetail extends Omit<OrderListItem, 'preview'> {
  items: OrderDoc['items'];
  shippingAddress: OrderDoc['shippingAddress'];
  pricing: OrderDoc['pricing'];
  payment: OrderPaymentView;
  cancellationReason: string | null;
  cancelledAt: string | null;
  /** When delivery was recorded. Null on every order delivered before Phase 13. */
  deliveredAt: string | null;
  updatedAt: string;
  canCancel: boolean;
  /** The coupon the order used, as it was then. Null when none was. */
  coupon: { code: string; description: string; discount: number } | null;
  /**
   * The tax invoice, once the order has shipped.
   *
   * `available` is the server's answer to "can an invoice be shown?", so the
   * page offers the link only when following it would succeed.
   */
  invoice: { number: string | null; issuedAt: string | null; available: boolean };
}

/**
 * Whether this order's invoice can be shown now.
 *
 * Shipped or delivered, and carrying a tax breakdown. An order shipped before
 * Phase 18 has neither a breakdown nor a number, and says so rather than
 * producing a document with guessed figures on it.
 */
export function invoiceAvailable(order: OrderDoc): boolean {
  return (order.status === 'SHIPPED' || order.status === 'DELIVERED') && hasTaxBreakdown(order);
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
    deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : null,
    canCancel: canCancel(order),
    coupon: order.coupon
      ? {
          code: order.coupon.code,
          description: order.coupon.description ?? '',
          discount: order.coupon.discount,
        }
      : null,
    invoice: {
      number: order.invoice?.number ?? null,
      issuedAt: order.invoice?.issuedAt ? order.invoice.issuedAt.toISOString() : null,
      available: invoiceAvailable(order),
    },
  };
}

/**
 * The order page's payload: the order, plus what happened after it.
 *
 * `toDetail` stays synchronous and pure — the payment service calls it on a
 * document it already holds, and making it async would have put two database
 * round trips on the payment verification path for data that page does not
 * render. The post-purchase blocks are composed on top instead, by the two
 * endpoints that actually show them.
 */
export interface OrderDetailWithFulfillment extends OrderDetail {
  shipment: ShipmentView | null;
  returns: ReturnSummary[];
  returnability: Returnability;
  /**
   * When ZyCart last successfully emailed this customer about this order, or
   * null.
   *
   * Null covers three different situations on purpose — nothing has happened
   * worth emailing about, a message is still waiting to go out, and a message
   * failed — because the page says the same thing in all three: nothing. The
   * alternative would be telling a customer an email is on its way when a mail
   * server has already refused it.
   *
   * Deliberately one timestamp and not a list. A customer has no use for
   * delivery history, and loading one would put an operational subsystem on the
   * critical path of an ordinary page view.
   */
  lastUpdateEmailedAt: string | null;
}

export async function getOrder(
  userId: string,
  orderRef: string,
): Promise<OrderDetailWithFulfillment> {
  const order = await findOwnedOrder(userId, orderRef);
  return withFulfillment(order, toDetail(order));
}

/**
 * Attaches the shipment, the returns and the return eligibility to a detail.
 *
 * Two indexed queries, run together. Shared by the customer's order page and
 * the admin's, so the two cannot disagree about whether an order is returnable
 * — the customer is never offered something the operator's screen would deny,
 * and vice versa.
 */
export async function withFulfillment(
  order: OrderDoc,
  detail: OrderDetail,
): Promise<OrderDetailWithFulfillment> {
  const [shipment, returns, lastUpdateEmailedAt] = await Promise.all([
    findOrderShipment(order._id),
    listOrderReturns(order._id),
    // One indexed lookup returning one field. See the field's own note for why
    // this is a single timestamp rather than a delivery history.
    lastNotifiedAt(order._id),
  ]);

  return {
    ...detail,
    shipment,
    returns,
    returnability: returnability(order),
    lastUpdateEmailedAt,
  };
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
  actor: AuditActor | null = null,
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

      const choice = { color: item.selectedColor ?? null, size: item.selectedSize ?? null };

      const outcome = await writeStock(
        { product: item.product, choice, quantityChange: item.quantity },
        session,
      );

      // The product has been deleted since the order was placed, or the
      // variant it was bought in is no longer sold. There is no row to credit
      // and nothing to record against it; the order keeps its own snapshot of
      // what was bought, and the log says units were not put back.
      if (outcome.status !== 'applied') {
        logUnrestorable({
          reason: outcome.status === 'missing_variant' ? 'variant_removed' : 'product_removed',
          productId: String(item.product),
          reference: order.orderNumber,
          choice,
          quantity: item.quantity,
        });
        continue;
      }

      await recordMovement(
        {
          product: outcome.product._id,
          productName: outcome.product.name,
          sku: outcome.product.sku,
          variant: movementVariantOf(outcome, choice),
          type: 'CANCELLATION',
          quantityBefore: outcome.quantityBefore,
          quantityChange: item.quantity,
          referenceType: 'ORDER',
          referenceId: order._id,
          referenceLabel: order.orderNumber,
          // Null for a customer cancelling their own order: attributing it to
          // an administrator would be false, and naming the shopper would put
          // their identity in an operational ledger that has no use for it.
          actor,
        },
        session,
      );
    }

    order.stockCommitted = false;
  }

  /**
   * The coupon's use comes back too (Phase 18), in the same transaction, so a
   * cancelled order cannot go on counting against a limited promotion or
   * against the customer's own allowance. Idempotent, and a no-op for an order
   * that never redeemed — an online order cancelled before it was paid.
   */
  if (order.coupon) await releaseCoupon(order._id, session);

  order.status = 'CANCELLED';
  order.cancellationReason = reason;
  order.cancelledAt = new Date();

  await order.save({ session });
}

/**
 * Whether an order carries the tax facts a GST invoice is made of.
 *
 * True for every order placed from Phase 18. Orders from before it recorded no
 * rate on their lines, and an invoice reconstructed from today's rates would be
 * a document asserting something nobody decided at the time.
 */
export function hasTaxBreakdown(order: Pick<OrderDoc, 'items'>): boolean {
  return (
    order.items.length > 0 &&
    order.items.every((item) => typeof item.gstRate === 'number' && item.taxAmount !== null)
  );
}

/**
 * Moves one order along its lifecycle, inside a caller's transaction.
 *
 * ## Why this is separate from `setOrderStatus`
 *
 * Phase 13 gave the order lifecycle two more callers. Advancing a shipment to
 * SHIPPED has to move the order to SHIPPED, and it has to do so in the *same*
 * transaction as the shipment write, or a crash between them would leave a
 * parcel that says it is in transit against an order that says it is being
 * packed. `setOrderStatus` opens its own session, which cannot be joined.
 *
 * So the policy — the transition graph, the cancellation, the audit row —
 * lives here and takes a session, and `setOrderStatus` became the thin wrapper
 * that opens one. There is still exactly one implementation of "may this order
 * move there?", which was the point of `ORDER_STATUS_FLOW` in the first place.
 *
 * Deliberately narrow, unchanged from Phase 9: it changes fulfilment state and
 * nothing else. The snapshot, the pricing, the address and — above all — the
 * payment are not reachable from here, so marking an order DELIVERED can never
 * be used as a back door to assert that it was paid for.
 */
export async function transitionOrderStatus(
  order: OrderDoc,
  next: OrderStatus,
  session: mongoose.ClientSession,
  options: {
    note?: string;
    actor?: AuditActor | null;
    /**
     * Where to put any customer notification this transition raises.
     *
     * Optional, and its absence is not a silent loss: the delivery record is
     * created either way, inside this transaction, and shows up on the
     * notifications screen as PENDING. What the outbox adds is an attempt
     * immediately after the caller commits. Callers that hold an `Env` pass
     * one; the handful that do not leave the message for a deliberate retry
     * rather than pretending they can send it.
     */
    outbox?: NotificationOutbox;
  } = {},
): Promise<void> {
  const { note, actor } = options;

  if (order.status === next) {
    throw new AppError(`This order is already ${next.toLowerCase()}.`, 409);
  }

  if (!ORDER_STATUS_FLOW[order.status].includes(next)) {
    throw new AppError(
      `An order that is ${order.status.toLowerCase()} cannot be moved to ${next.toLowerCase()}.`,
      409,
    );
  }

  const previous = order.status;

  if (next === 'CANCELLED') {
    await applyCancellation(order, note?.trim() || 'Cancelled by ZyCart', session, actor ?? null);
  } else {
    order.status = next;

    /**
     * The moment delivery was recorded, written once and only here.
     *
     * The return window is counted from it, so it matters that it is the
     * timestamp of an actual transition rather than anything reconstructed. The
     * guard makes it idempotent: DELIVERED is terminal in `ORDER_STATUS_FLOW`,
     * so this cannot be reached twice, and the guard says so anyway.
     */
    if (next === 'DELIVERED' && !order.deliveredAt) order.deliveredAt = new Date();

    /**
     * The tax invoice is numbered as the goods leave (Phase 18).
     *
     * Inside this transaction, so the number and the dispatch commit together:
     * a shipment that rolls back gives its number back, and the series stays
     * free of gaps. See `invoice-number.ts` for why dispatch is the moment.
     */
    if (next === 'SHIPPED' && !order.invoice?.number && hasTaxBreakdown(order)) {
      order.set('invoice', { number: await nextInvoiceNumber(session), issuedAt: new Date() });
    }

    await order.save({ session });
  }

  /**
   * The parcel follows the order.
   *
   * See `shipment-sync` for why this is not in the shipment service and why it
   * cannot recurse. Inside the transaction, so the two records commit together
   * or not at all.
   */
  await syncShipmentToOrderStatus(order._id, next, session, actor ?? null);

  /**
   * Written inside the transaction, so the log cannot claim a transition that
   * was rolled back — and so a failure to record the change fails the change
   * rather than leaving it unattributed.
   */
  if (actor) {
    await recordAudit(
      {
        actor,
        action: 'ORDER_STATUS_CHANGED',
        entityType: 'ORDER',
        entityId: order._id,
        entityLabel: order.orderNumber,
        summary: `Order ${order.orderNumber} moved from ${previous.toLowerCase()} to ${next.toLowerCase()}`,
        changes: [{ field: 'status', from: previous, to: next }],
        note,
      },
      session,
    );
  }

  /**
   * The customer is told, in the same transaction.
   *
   * See `notifyCustomerOfTransition` for why this one place covers both routes
   * into "this order has shipped", and why an EXCEPTION on a parcel cannot
   * produce a shipping notice.
   */
  await notifyCustomerOfTransition(order, next, session, options.outbox);
}

/**
 * Raises the customer notification a status change implies, if any.
 *
 * ## Why it hangs off the transition and not off the shipment
 *
 * There are two doors into "this order has shipped": advancing the parcel, and
 * using the order's own fulfilment control. Both end up in
 * `transitionOrderStatus`, and only there — `syncShipmentToOrderStatus` moves
 * the parcel when the order leads, and `advanceShipment` calls this function's
 * caller when the parcel leads. Hooking the transition therefore covers both
 * doors with one piece of code, including the bulk action, and cannot be
 * bypassed by a route somebody adds later without also bypassing the order
 * lifecycle itself.
 *
 * ## Why an exception does not send "your order has shipped"
 *
 * Every in-transit shipment status implies the order is SHIPPED, so by the time
 * a parcel can reach EXCEPTION the order already is — and a transition to a
 * status the order already holds never happens. The notification follows the
 * business transition, not the parcel's mood.
 *
 * ## Why historical orders are silent
 *
 * Only a transition happening *now* reaches this code. Nothing scans for orders
 * that reached SHIPPED last March, and Phase 14 ships no backfill, so no
 * customer receives mail about a sale they had long since forgotten.
 */
async function notifyCustomerOfTransition(
  order: OrderDoc,
  next: OrderStatus,
  session: mongoose.ClientSession,
  outbox: NotificationOutbox | undefined,
): Promise<void> {
  if (next !== 'SHIPPED' && next !== 'DELIVERED') return;

  /**
   * Read after the parcel has been brought into line, so a carrier and
   * tracking number attached in this very transaction are in the message.
   * Null is ordinary — an order can be marked shipped with no parcel record —
   * and the template then says less rather than inventing a carrier.
   */
  const shipment =
    next === 'SHIPPED'
      ? await Shipment.findOne({ order: order._id })
          .select('carrier trackingNumber trackingUrl estimatedDeliveryAt')
          .session(session)
      : null;

  await queueNotification(
    {
      event: next === 'SHIPPED' ? 'ORDER_SHIPPED' : 'ORDER_DELIVERED',
      entityType: 'ORDER',
      entityId: order._id,
      entityLabel: order.orderNumber,
      orderNumber: order.orderNumber,
      userId: order.user as Types.ObjectId,
      buildPayload: (recipient) =>
        next === 'SHIPPED'
          ? buildOrderShippedPayload(recipient.firstName, order, shipment)
          : buildOrderDeliveredPayload(recipient.firstName, order),
    },
    session,
    outbox,
  );
}

/**
 * Moves an order along its lifecycle, on an administrator's instruction.
 *
 * The transaction and the lookup; the policy is `transitionOrderStatus`.
 * Cancelling routes through the same `applyCancellation` the customer's own
 * cancellation uses, so the stock comes back exactly once and by exactly the
 * same rules.
 */
export async function setOrderStatus(
  env: Env,
  orderRef: string,
  next: OrderStatus,
  note?: string,
  actor?: AuditActor,
): Promise<OrderDetail> {
  const session = await mongoose.startSession();
  const outbox = new NotificationOutbox();

  try {
    let updated: OrderDoc | undefined;

    await session.withTransaction(async () => {
      const order = await findOrderByRef(orderRef, session);
      await transitionOrderStatus(order, next, session, { note, actor, outbox });
      updated = order;
    });

    if (!updated) throw new AppError('Could not update the order', 500);

    /**
     * After the commit, never before, and never inside the transaction.
     *
     * The order is SHIPPED whatever a mail server does next, and `flush` cannot
     * throw — an administrator does not get an error for an operation that
     * succeeded because a message did not.
     */
    await outbox.flush(env);

    // A cancellation gives units back, which may answer a back-in-stock alert
    // (Phase 20). Covers the console's single and bulk moves alike.
    if (next === 'CANCELLED') dispatchProductAlerts(env, productIdsOf(updated.items));

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
