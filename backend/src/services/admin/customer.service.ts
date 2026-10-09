import { Types } from 'mongoose';
import type { Env } from '../../config/env';
import { Order } from '../../models/order.model';
import { Review } from '../../models/review.model';
import { User } from '../../models/user.model';
import { AppError } from '../../utils/AppError';
import { escapeRegex } from '../../validators/common';
import type { AdminCustomerQuery } from '../../validators/admin.validator';
import { setClerkBan } from '../auth/clerk-sync';
import { recordAudit, type AuditActor } from './audit.service';

/**
 * Customers, as an operator needs to see them.
 *
 * Two things are deliberately absent throughout this file. The password hash is
 * never selected — the field is `select: false` on the model, and nothing here
 * asks for it. And there is no path that changes a role: promoting somebody to
 * administrator is a security decision that deserves its own deliberate
 * feature, not a dropdown beside their phone number.
 *
 * ## What "total spent" means
 *
 * The same rule the dashboard uses for revenue, applied per customer:
 *
 * ```text
 * status ≠ CANCELLED
 *   AND ( payment.status = PAID
 *         OR (method = COD AND status = DELIVERED) )
 * ```
 *
 * So a cancelled order is not spending, an abandoned online payment is not
 * spending, and a cash order becomes spending when it is handed over. Carts and
 * wishlists are intentions, not money, and contribute nothing.
 */
function spendMatch(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: { $ne: 'CANCELLED' },
    $or: [{ 'payment.status': 'PAID' }, { 'payment.method': 'COD', status: 'DELIVERED' }],
    ...extra,
  };
}

const SORTS: Record<AdminCustomerQuery['sort'], Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: 1 },
  oldest: { createdAt: 1, _id: 1 },
  name_asc: { firstName: 1, lastName: 1, _id: 1 },
};

export interface AdminCustomerRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  isActive: boolean;
  orderCount: number;
  totalSpent: number;
  createdAt: string;
  lastLoginAt: string | null;
}

/**
 * Order totals for a set of customers, in one aggregation.
 *
 * The alternative — a query per row — would be twenty round trips to render one
 * page, and would get worse as the shop grows. This is one grouped pass over
 * the orders belonging to the twenty customers actually on screen.
 */
async function spendFor(userIds: Types.ObjectId[]) {
  if (userIds.length === 0) return new Map<string, { orderCount: number; totalSpent: number }>();

  const rows = await Order.aggregate<{ _id: Types.ObjectId; orders: number; spent: number }>([
    { $match: spendMatch({ user: { $in: userIds } }) },
    { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$pricing.total' } } },
  ]);

  return new Map(
    rows.map((row) => [String(row._id), { orderCount: row.orders, totalSpent: row.spent }]),
  );
}

export async function listCustomers(query: AdminCustomerQuery) {
  // Administrators are staff; this screen is about the people who shop here.
  const filter: Record<string, unknown> = { role: 'USER' };

  if (query.active !== undefined) filter.isActive = query.active;

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [
      { firstName: pattern },
      { lastName: pattern },
      { email: pattern },
      { phone: pattern },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('firstName lastName email phone avatar isActive createdAt lastLoginAt')
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    User.countDocuments(filter),
  ]);

  const spend = await spendFor(users.map((user) => user._id));

  const items: AdminCustomerRow[] = users.map((user) => {
    const totals = spend.get(String(user._id));

    return {
      id: String(user._id),
      name: [user.firstName, user.lastName].filter(Boolean).join(' '),
      email: user.email,
      phone: user.phone ?? '',
      avatar: user.avatar ?? '',
      isActive: user.isActive,
      orderCount: totals?.orderCount ?? 0,
      totalSpent: totals?.totalSpent ?? 0,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
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

export interface AdminCustomerDetail extends AdminCustomerRow {
  role: string;
  isEmailVerified: boolean;
  addressCount: number;
  cancelledOrders: number;
  reviewCount: number;
  averageRating: number | null;
  recentOrders: {
    id: string;
    orderNumber: string;
    total: number;
    status: string;
    paymentStatus: string;
    createdAt: string;
  }[];
}

/**
 * One customer, with enough context to answer the questions support actually
 * gets asked: who are they, is their account working, what have they bought,
 * and what have they said about it.
 *
 * Addresses are counted rather than listed. An operator needs to know a
 * customer has somewhere to ship to; reading their home address off a list page
 * is not a need, it is an exposure, and the order they are discussing carries
 * the address it shipped to anyway.
 */
export async function getCustomer(userId: string): Promise<AdminCustomerDetail> {
  const user = await User.findOne({ _id: userId, role: 'USER' }).select(
    'firstName lastName email phone avatar isActive isEmailVerified role addresses createdAt lastLoginAt',
  );

  if (!user) throw new AppError('Customer not found', 404);

  const [spend, cancelledOrders, recent, reviewStats] = await Promise.all([
    spendFor([user._id]),
    Order.countDocuments({ user: user._id, status: 'CANCELLED' }),
    Order.find({ user: user._id })
      .select('orderNumber pricing.total status payment.status createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(5),
    Review.aggregate<{ _id: null; count: number; average: number }>([
      { $match: { user: user._id, status: 'APPROVED' } },
      { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$rating' } } },
    ]),
  ]);

  const totals = spend.get(String(user._id));
  const reviews = reviewStats[0];

  return {
    id: String(user._id),
    name: [user.firstName, user.lastName].filter(Boolean).join(' '),
    email: user.email,
    phone: user.phone ?? '',
    avatar: user.avatar ?? '',
    isActive: user.isActive,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    orderCount: totals?.orderCount ?? 0,
    totalSpent: totals?.totalSpent ?? 0,
    cancelledOrders,
    addressCount: user.addresses.length,
    reviewCount: reviews?.count ?? 0,
    averageRating: reviews ? Math.round(reviews.average * 10) / 10 : null,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    recentOrders: recent.map((order) => ({
      id: String(order._id),
      orderNumber: order.orderNumber,
      total: order.pricing.total,
      status: order.status,
      paymentStatus: order.payment.status,
      createdAt: order.createdAt.toISOString(),
    })),
  };
}

/**
 * Activates or deactivates a customer.
 *
 * Deactivation is immediate everywhere, without any session bookkeeping here,
 * because the auth middleware re-reads the account on every authenticated
 * request and refuses an inactive one. That design is what makes this a
 * one-field update rather than a session-revocation problem.
 *
 * The account is also banned in Clerk, or unbanned, so that a deactivated
 * customer is stopped at sign-in rather than signed in to a store that then
 * refuses them. That half is best effort; see `setClerkBan`.
 *
 * The filter carries `role: 'USER'`, so this endpoint cannot be pointed at an
 * administrator — including the one calling it.
 */
export async function setActive(
  env: Env,
  userId: string,
  isActive: boolean,
  actor: AuditActor,
): Promise<AdminCustomerDetail> {
  const updated = await User.findOneAndUpdate(
    { _id: userId, role: 'USER' },
    { $set: { isActive } },
    { new: true },
  ).select('_id firstName lastName email clerkId');

  if (!updated) throw new AppError('Customer not found', 404);

  if (updated.clerkId) await setClerkBan(env, updated.clerkId, !isActive);

  const name = [updated.firstName, updated.lastName].filter(Boolean).join(' ') || updated.email;

  /**
   * Audited after the write, not inside a transaction.
   *
   * This is a single-document update: there is no second write for it to be
   * inconsistent with, and the row is created only once the account has
   * actually changed — so the log still cannot claim something that did not
   * happen. Opening a transaction around one `findOneAndUpdate` purely to write
   * a log entry would be ceremony rather than safety.
   */
  await recordAudit({
    actor,
    action: 'CUSTOMER_STATUS_CHANGED',
    entityType: 'CUSTOMER',
    entityId: updated._id,
    entityLabel: name,
    summary: `Customer ${name} ${isActive ? 'reactivated' : 'deactivated'}`,
    changes: [{ field: 'isActive', from: String(!isActive), to: String(isActive) }],
  });

  return getCustomer(userId);
}
