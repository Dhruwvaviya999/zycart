import { Types } from 'mongoose';
import { Order, type OrderStatus } from '../../models/order.model';
import { User } from '../../models/user.model';
import { escapeRegex } from '../../validators/common';
import type { AdminOrderQuery } from '../../validators/admin.validator';
import {
  allowedNextStatuses,
  findOrderByRef,
  setOrderStatus,
  toDetail,
  type OrderDetail,
} from '../order.service';

/**
 * Orders, from the operator's side of the counter.
 *
 * Reading is admin-specific — different filters, no ownership scoping, the
 * customer's name attached. Writing is not: status changes go through
 * `setOrderStatus` in the shared order service, which owns the transition
 * policy and the inventory restoration, so there is no second implementation
 * for an administrator to drift away from.
 */

const SORTS: Record<AdminOrderQuery['sort'], Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: 1 },
  oldest: { createdAt: 1, _id: 1 },
  total_desc: { 'pricing.total': -1, _id: 1 },
  total_asc: { 'pricing.total': 1, _id: 1 },
};

const PERIOD_DAYS: Record<AdminOrderQuery['period'], number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
};

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  customer: { id: string | null; name: string; email: string };
  itemCount: number;
  total: number;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
}

/**
 * Searching by customer needs a lookup first.
 *
 * Orders store the shipping name but not the account's name or email, so
 * "find everything Priya ordered" has to resolve to user ids before the orders
 * can be filtered. The user query is capped: a one-character search that
 * matched every customer would otherwise build an enormous `$in`.
 */
async function customerIdsMatching(term: string): Promise<Types.ObjectId[]> {
  const pattern = new RegExp(escapeRegex(term), 'i');

  const users = await User.find({
    $or: [{ firstName: pattern }, { lastName: pattern }, { email: pattern }],
  })
    .select('_id')
    .limit(200);

  return users.map((user) => user._id);
}

export async function listOrders(query: AdminOrderQuery) {
  const filter: Record<string, unknown> = {};

  if (query.status) filter.status = query.status;
  if (query.paymentStatus) filter['payment.status'] = query.paymentStatus;
  if (query.paymentMethod) filter['payment.method'] = query.paymentMethod;

  const days = PERIOD_DAYS[query.period];
  if (days !== null) {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - (days - 1));
    filter.createdAt = { $gte: from };
  }

  if (query.search) {
    const term = query.search.trim();

    filter.$or = [
      // An order number is the thing an operator most often has in hand.
      { orderNumber: new RegExp(`^${escapeRegex(term)}`, 'i') },
      { user: { $in: await customerIdsMatching(term) } },
      { 'shippingAddress.fullName': new RegExp(escapeRegex(term), 'i') },
    ];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      // The snapshot stays on the server; a list row needs a count, not items.
      .select('orderNumber items pricing.total status payment createdAt user')
      .populate('user', 'firstName lastName email')
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Order.countDocuments(filter),
  ]);

  const items: AdminOrderRow[] = orders.map((order) => {
    const user = order.user as unknown as {
      _id?: Types.ObjectId;
      firstName?: string;
      lastName?: string;
      email?: string;
    } | null;

    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

    return {
      id: String(order._id),
      orderNumber: order.orderNumber,
      customer: {
        id: user?._id ? String(user._id) : null,
        // Orders outlive accounts; the row still has to render.
        name: name || order.shippingAddress?.fullName || 'Deleted customer',
        email: user?.email ?? '',
      },
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      total: order.pricing.total,
      status: order.status,
      paymentMethod: order.payment.method,
      paymentStatus: order.payment.status,
      createdAt: order.createdAt.toISOString(),
    };
  });

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export interface AdminOrderDetail extends OrderDetail {
  customer: { id: string | null; name: string; email: string; isActive: boolean } | null;
  /** Where this order may go next, so the interface offers nothing that would fail. */
  allowedStatuses: string[];
}

/**
 * One order, in full, for an operator.
 *
 * Built on the same `toDetail` the customer's own order page uses — so the
 * items, pricing, address and payment view are literally the same projection,
 * and an administrator cannot see a field the shape was never designed to
 * expose. What is added is the account behind the order and the lifecycle moves
 * available from here.
 */
export async function getOrder(orderRef: string): Promise<AdminOrderDetail> {
  const order = await findOrderByRef(orderRef);

  const user = await User.findById(order.user).select('firstName lastName email isActive');

  return {
    ...toDetail(order),
    customer: user
      ? {
          id: String(user._id),
          name: [user.firstName, user.lastName].filter(Boolean).join(' '),
          email: user.email,
          isActive: user.isActive,
        }
      : null,
    allowedStatuses: allowedNextStatuses(order),
  };
}

/**
 * Moves an order, then re-reads it.
 *
 * The transition itself is `setOrderStatus`'s job — this adds nothing to it but
 * the second read, which matters because the set of moves available changes
 * once the order has moved, and the console should be told the new one rather
 * than working it out.
 */
export async function updateStatus(
  orderRef: string,
  status: OrderStatus,
  note?: string,
): Promise<AdminOrderDetail> {
  await setOrderStatus(orderRef, status, note);
  return getOrder(orderRef);
}
