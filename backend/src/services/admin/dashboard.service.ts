import { Order, type OrderStatus, ORDER_STATUSES } from '../../models/order.model';
import { Product, LOW_STOCK_THRESHOLD } from '../../models/product.model';
import { Review } from '../../models/review.model';
import { User } from '../../models/user.model';
import type { DashboardQuery } from '../../validators/admin.validator';

/**
 * The dashboard, computed in MongoDB.
 *
 * Every figure below is an aggregation over the real collections. Nothing is
 * estimated, sampled or seeded, and no metric is invented to fill a card — if
 * the shop has taken no money, revenue is zero and the interface says so in
 * words rather than showing a confident-looking chart of nothing.
 *
 * ## What "revenue" means
 *
 * An order contributes to revenue when **the money is ours**:
 *
 * ```text
 * status ≠ CANCELLED
 *   AND ( payment.status = PAID              // online, captured
 *         OR (method = COD AND status = DELIVERED) )  // cash, handed over
 * ```
 *
 * The two halves exist because ZyCart has two payment methods that become real
 * at different moments. An online order is money in the bank the instant
 * Razorpay captures it. A cash-on-delivery order is a promise until the courier
 * hands it over — its `payment.status` stays PENDING for its whole life, so
 * counting only PAID would report a cash-only shop as earning nothing, and
 * counting every COD order would book revenue for parcels that may never be
 * accepted.
 *
 * Cancelled orders never count, whatever their payment says. A refunded one
 * does not either: its payment is REFUND_PENDING or REFUNDED, not PAID.
 *
 * The figure summed is `pricing.total` — the order's own snapshot — not
 * anything re-derived from today's catalogue prices.
 */
export function revenueMatch(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: { $ne: 'CANCELLED' },
    $or: [{ 'payment.status': 'PAID' }, { 'payment.method': 'COD', status: 'DELIVERED' }],
    ...extra,
  };
}

/** Where a window starts, at midnight, so "7 days" means seven whole days. */
function since(days: number): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

export interface DashboardMetric {
  value: number;
  /** The same metric over the preceding window of equal length, for comparison. */
  previous: number;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface DashboardSummary {
  period: { days: number; from: string; to: string };

  revenue: DashboardMetric;
  orders: DashboardMetric;
  customers: DashboardMetric;

  /** Catalogue counts are a current state, not a windowed one. */
  catalogue: {
    products: number;
    activeProducts: number;
    outOfStock: number;
    lowStock: number;
  };

  attention: {
    pendingOrders: number;
    unpaidOnlineOrders: number;
    pendingReviews: number;
  };

  revenueSeries: RevenuePoint[];
  ordersByStatus: Record<OrderStatus, number>;
  topProducts: {
    id: string | null;
    name: string;
    slug: string;
    image: string;
    unitsSold: number;
    revenue: number;
  }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    customer: string;
    total: number;
    status: OrderStatus;
    paymentMethod: string;
    paymentStatus: string;
    createdAt: string;
  }[];
  lowStockProducts: {
    id: string;
    name: string;
    slug: string;
    sku: string;
    stock: number;
    image: string;
  }[];
}

/**
 * One request, one round of aggregations.
 *
 * The alternative — a card per endpoint — would have the dashboard fire eight
 * requests to render one screen. These run concurrently and each returns a
 * handful of numbers, not a page of documents.
 */
export async function getDashboard(query: DashboardQuery): Promise<DashboardSummary> {
  const days = query.period === '7d' ? 7 : 30;

  const from = since(days);
  const previousFrom = since(days * 2);
  const to = new Date();

  const windowMatch = { createdAt: { $gte: from } };
  const previousMatch = { createdAt: { $gte: previousFrom, $lt: from } };

  const [
    revenueNow,
    revenuePrevious,
    ordersNow,
    ordersPrevious,
    customersNow,
    customersPrevious,
    catalogue,
    attention,
    series,
    byStatus,
    top,
    recent,
    lowStock,
  ] = await Promise.all([
    sumRevenue(revenueMatch(windowMatch)),
    sumRevenue(revenueMatch(previousMatch)),

    Order.countDocuments(windowMatch),
    Order.countDocuments(previousMatch),

    // Administrators are staff, not customers, so they are not counted as such.
    User.countDocuments({ role: 'USER', ...windowMatch }),
    User.countDocuments({ role: 'USER', ...previousMatch }),

    catalogueCounts(),
    attentionCounts(),
    revenueByDay(from),
    ordersByStatus(),
    topProducts(from),
    recentOrders(),
    lowStockProducts(),
  ]);

  return {
    period: { days, from: from.toISOString(), to: to.toISOString() },
    revenue: { value: revenueNow, previous: revenuePrevious },
    orders: { value: ordersNow, previous: ordersPrevious },
    customers: { value: customersNow, previous: customersPrevious },
    catalogue,
    attention,
    revenueSeries: series,
    ordersByStatus: byStatus,
    topProducts: top,
    recentOrders: recent,
    lowStockProducts: lowStock,
  };
}

async function sumRevenue(match: Record<string, unknown>): Promise<number> {
  const [result] = await Order.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$pricing.total' } } },
  ]);

  return result?.total ?? 0;
}

async function catalogueCounts() {
  const [products, activeProducts, outOfStock, lowStock] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({ isActive: true, stock: { $lte: 0 } }),
    Product.countDocuments({ isActive: true, stock: { $gt: 0, $lte: LOW_STOCK_THRESHOLD } }),
  ]);

  return { products, activeProducts, outOfStock, lowStock };
}

/**
 * The things an operator should look at today.
 *
 * Chosen because each one has an action attached: a pending order needs
 * confirming, an unpaid online order may need chasing, a pending review needs a
 * decision. A count with nothing to do about it does not belong here.
 */
async function attentionCounts() {
  const [pendingOrders, unpaidOnlineOrders, pendingReviews] = await Promise.all([
    Order.countDocuments({ status: 'PENDING' }),
    Order.countDocuments({
      'payment.method': 'RAZORPAY',
      'payment.status': { $in: ['PENDING', 'FAILED'] },
      status: { $nin: ['CANCELLED', 'DELIVERED'] },
    }),
    Review.countDocuments({ status: 'PENDING' }),
  ]);

  return { pendingOrders, unpaidOnlineOrders, pendingReviews };
}

/**
 * Revenue per day across the window, with empty days filled in.
 *
 * MongoDB returns only days that have orders; a chart that silently skipped the
 * quiet ones would compress time and misrepresent the trend, so the gaps are
 * filled here with genuine zeroes.
 */
async function revenueByDay(from: Date): Promise<RevenuePoint[]> {
  const rows = await Order.aggregate<{ _id: string; revenue: number; orders: number }>([
    { $match: revenueMatch({ createdAt: { $gte: from } }) },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$pricing.total' },
        orders: { $sum: 1 },
      },
    },
  ]);

  const byDate = new Map(rows.map((row) => [row._id, row]));
  const points: RevenuePoint[] = [];

  const cursor = new Date(from);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  while (cursor <= today) {
    const key = [
      cursor.getFullYear(),
      String(cursor.getMonth() + 1).padStart(2, '0'),
      String(cursor.getDate()).padStart(2, '0'),
    ].join('-');

    const row = byDate.get(key);
    points.push({ date: key, revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 });

    cursor.setDate(cursor.getDate() + 1);
  }

  return points;
}

/** Every status, including the ones at zero — an absent status is information. */
async function ordersByStatus(): Promise<Record<OrderStatus, number>> {
  const rows = await Order.aggregate<{ _id: OrderStatus; count: number }>([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0])) as Record<
    OrderStatus,
    number
  >;

  for (const row of rows) {
    if (row._id in counts) counts[row._id] = row.count;
  }

  return counts;
}

/**
 * What actually sold, from order lines.
 *
 * Deliberately **not** the `isBestSeller` flag, which is a merchandising
 * decision somebody typed in — this is the measurement that would tell them
 * whether they were right. Only revenue-contributing orders count, so a
 * cancelled bulk order cannot crown a product.
 *
 * Grouped by the snapshot's product reference and named from the snapshot, so a
 * product deleted since still reports the units it sold.
 */
async function topProducts(from: Date) {
  const rows = await Order.aggregate<{
    _id: unknown;
    name: string;
    slug: string;
    image: string;
    unitsSold: number;
    revenue: number;
  }>([
    { $match: revenueMatch({ createdAt: { $gte: from } }) },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.productName' },
        slug: { $first: '$items.productSlug' },
        image: { $first: '$items.productImage' },
        unitsSold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
    { $sort: { unitsSold: -1, revenue: -1 } },
    { $limit: 5 },
  ]);

  return rows.map((row) => ({
    id: row._id ? String(row._id) : null,
    name: row.name,
    slug: row.slug ?? '',
    image: row.image ?? '',
    unitsSold: row.unitsSold,
    revenue: row.revenue,
  }));
}

/** A handful of the newest orders — never the whole collection. */
async function recentOrders() {
  const orders = await Order.find()
    .select('orderNumber pricing.total status payment createdAt user')
    .populate('user', 'firstName lastName')
    .sort({ createdAt: -1, _id: -1 })
    .limit(6);

  return orders.map((order) => {
    const user = order.user as unknown as { firstName?: string; lastName?: string } | null;
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

    return {
      id: String(order._id),
      orderNumber: order.orderNumber,
      // A deleted account leaves its orders behind; the row still has to render.
      customer: name || 'Deleted customer',
      total: order.pricing.total,
      status: order.status,
      paymentMethod: order.payment.method,
      paymentStatus: order.payment.status,
      createdAt: order.createdAt.toISOString(),
    };
  });
}

/** Active products that are nearly gone, scarcest first. */
async function lowStockProducts() {
  const products = await Product.find({
    isActive: true,
    stock: { $lte: LOW_STOCK_THRESHOLD },
  })
    .select('name slug sku stock images')
    .sort({ stock: 1, name: 1 })
    .limit(6);

  return products.map((product) => ({
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    stock: product.stock,
    image: product.images[0] ?? '',
  }));
}
