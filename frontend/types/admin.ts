import type {
  ReturnReason,
  ReturnStatus,
  ReturnSummary,
  ShipmentStatus,
} from '@/types/fulfillment';
import type { Order, OrderStatus, PaymentMethod, PaymentStatus } from '@/types/order';
import type { Product } from '@/types/product';
import type { Pagination } from '@/types/product';
import type { ReviewStatus } from '@/types/review';

/**
 * What the admin API returns.
 *
 * Deliberately separate from the storefront's types even where the shapes
 * overlap. An admin row carries things a customer's never does — an account's
 * email beside an order, a product's active flag, a review's moderation state —
 * and conflating them would make it easy to render one where the other was
 * meant.
 */

export type StockState = 'in_stock' | 'low_stock' | 'out_of_stock';

/** A paginated admin listing, as every list endpoint returns it. */
export interface AdminList<TRow> {
  items: TRow[];
  pagination: Pagination;
}

/* ---------------------------------------------------------------- */
/* Dashboard                                                         */
/* ---------------------------------------------------------------- */

export interface DashboardMetric {
  value: number;
  /** The same window, immediately before this one. */
  previous: number;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface AdminDashboard {
  period: { days: number; from: string; to: string };

  revenue: DashboardMetric;
  orders: DashboardMetric;
  customers: DashboardMetric;

  catalogue: {
    products: number;
    activeProducts: number;
    outOfStock: number;
    lowStock: number;
  };

  /** Counts with an action attached — each one links somewhere useful. */
  attention: {
    pendingOrders: number;
    unpaidOnlineOrders: number;
    pendingReviews: number;
    /** Orders tripping an operations rule; the same set `/admin/operations` lists. */
    ordersNeedingAttention: number;
  };

  inventory: {
    outOfStock: number;
    lowStock: number;
    healthy: number;
    sellableUnits: number;
    recentAdjustments: number;
  };

  /** The newest administrative actions, from the audit trail. */
  activity: AuditLogRow[];

  /**
   * Stock that is not moving.
   *
   * `coverDays` is how long the current stock would last at the rate it sold
   * over the window. Null means nothing sold at all, which the interface says
   * in words rather than rendering as a number.
   */
  slowMovers: {
    id: string;
    name: string;
    sku: string;
    stock: number;
    unitsSold: number;
    coverDays: number | null;
  }[];

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
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
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

/* ---------------------------------------------------------------- */
/* Catalogue                                                         */
/* ---------------------------------------------------------------- */

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  image: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  stockState: StockState;
  /** The threshold this product is judged against, its own or the store default. */
  lowStockThreshold: number;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  isActive: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  rating: number;
  reviewCount: number;
  createdAt: string;
}

export type ProductSort =
  'newest' | 'oldest' | 'name_asc' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc';

export interface AdminProductQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  brand?: string;
  stock?: StockState;
  active?: boolean;
  featured?: boolean;
  bestSeller?: boolean;
  newArrival?: boolean;
  sort?: ProductSort;
}

/** Categories and brands share a row shape; only the label differs. */
export interface AdminTaxonomyRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  isActive: boolean;
  /** What makes a category deletable or not. */
  productCount: number;
  createdAt: string;
}

export interface AdminCatalogueQuery {
  page?: number;
  limit?: number;
  search?: string;
  active?: boolean;
}

/**
 * One product, as an administrator sees it.
 *
 * The storefront's `Product` has no `isActive` because the shop is only ever
 * shown products that are — the flag would be a constant `true` and a
 * temptation to filter in the browser. An operator manages the ones that are
 * not, so the admin detail endpoint returns it and this type says so.
 */
export interface AdminProduct extends Product {
  isActive: boolean;
}

/**
 * What the product form submits. The server owns every rule about it.
 *
 * `stock` is **create-only** from Phase 12 — see `ProductUpdateInput`. The
 * update endpoint no longer honours it, because setting a total discards
 * concurrent changes and carries no reason; stock moves through the inventory
 * adjustment instead.
 */
export interface ProductInput {
  name: string;
  description: string;
  shortDescription: string;
  images: string[];
  price: number;
  compareAtPrice: number | null;
  category: string;
  brand: string;
  sku: string;
  stock: number;
  colors: { name: string; hex: string }[];
  sizes: { label: string; inStock: boolean }[];
  tags: string[];
  highlights: string[];
  specifications: { label: string; value: string }[];
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  isActive: boolean;
}

/** Everything the editor may change on an existing product. Stock is not here. */
export type ProductUpdateInput = Omit<ProductInput, 'stock'>;

export interface TaxonomyInput {
  name: string;
  description?: string;
  image?: string;
  logo?: string;
  isActive: boolean;
}

/* ---------------------------------------------------------------- */
/* Orders                                                            */
/* ---------------------------------------------------------------- */

/** Why an order is in the attention queue. Computed on the server, never here. */
export type AttentionKey =
  | 'PAYMENT_FAILED'
  | 'PAYMENT_STALLED'
  | 'REFUND_PENDING'
  | 'PAID_NOT_CONFIRMED'
  | 'STOCK_NOT_HELD'
  | 'FULFILMENT_OVERDUE';

export interface AttentionFlag {
  key: AttentionKey;
  label: string;
  /** What to do about it, in one line, written by the server. */
  action: string;
  severity: 'critical' | 'warning';
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  customer: { id: string | null; name: string; email: string };
  itemCount: number;
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  createdAt: string;
  attention: AttentionFlag[];
}

/**
 * The customer's own order detail, plus the account behind it and the lifecycle
 * moves available from here. `allowedStatuses` comes from the server so the
 * interface never offers a transition that would be refused.
 */
/** One thing that happened to an order, at a time that was genuinely recorded. */
export interface OrderEvent {
  at: string;
  label: string;
  detail: string;
  actor: string | null;
}

export interface AdminOrderDetail extends Order {
  customer: { id: string | null; name: string; email: string; isActive: boolean } | null;
  allowedStatuses: OrderStatus[];
  attention: AttentionFlag[];
  /** Whether this order is currently holding stock. */
  stockCommitted: boolean;
  timeline: OrderEvent[];
  stockMovements: { at: string; productName: string; quantityChange: number; type: string }[];
  /**
   * What the console may do about fulfilment right now.
   *
   * Derived on the server from the order's state and the parcel's together. The
   * action bar renders exactly this and works nothing out for itself, so a
   * button is never offered that the endpoint behind it would refuse.
   */
  fulfillment: FulfillmentCapabilities;
}

export interface FulfillmentCapabilities {
  canCreateShipment: boolean;
  /** Why not, for the operator. Empty when it can. */
  createBlockedReason: string;
  shipmentStatuses: ShipmentStatus[];
}

/* ---------------------------------------------------------------- */
/* Returns                                                           */
/* ---------------------------------------------------------------- */

export interface AdminReturnRow extends ReturnSummary {
  customer: { id: string | null; name: string; email: string };
  /** The distinct reasons across the lines, so a row reads without opening it. */
  reasons: string[];
}

/**
 * One return, in full, for an operator.
 *
 * Carries two things the customer's view never does: the internal note, and the
 * server's verdict on whether a refund can be issued. The latter means the
 * console renders a reason rather than a button that would be refused.
 */
export interface AdminReturnDetail {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  status: ReturnStatus;
  items: {
    id: string;
    orderItemId: string;
    product: string | null;
    productName: string;
    productImage: string;
    sku: string;
    selectedColor: string | null;
    selectedSize: string | null;
    unitPrice: number;
    purchasedQuantity: number;
    requestedQuantity: number;
    approvedQuantity: number | null;
    reason: ReturnReason;
  }[];
  itemCount: number;
  customerNote: string;
  resolutionNote: string;
  /** Internal only. Never rendered on a customer-facing surface. */
  adminNote: string;
  requestedAt: string;
  decidedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  reviewedByName: string;
  resellable: boolean | null;
  restocked: boolean;
  refund: { amount: number; initiatedAt: string | null; completedAt: string | null; pending: boolean };
  refundDetail: {
    razorpayRefundId: string | null;
    failureReason: string | null;
    failedAt: string | null;
    initiatedByName: string;
  };
  allowedStatuses: ReturnStatus[];
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;

  customer: { id: string | null; name: string; email: string } | null;
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    total: number;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    refundedAmount: number;
    placedAt: string;
    deliveredAt: string | null;
  } | null;
  /** Computed by the server from the order snapshot. Never sent by the browser. */
  refundPlan: {
    amount: number;
    refundable: boolean;
    blocker: string | null;
    explanation: string;
    remainingOnOrder: number;
  };
  /** The restock default, so the receive dialog does not suggest shelving a broken item. */
  suggestResellable: boolean;
}

export interface AdminReturnQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ReturnStatus;
  sort?: 'newest' | 'oldest';
}

export interface ReturnsSummary {
  byStatus: Record<ReturnStatus, number>;
  open: number;
  /**
   * Both halves of the fraction, so the percentage is checkable.
   *
   * `percent` is null when nothing was delivered in the window — `0%` would
   * read as "nothing gets returned" rather than "nothing has been delivered".
   */
  rate: { percent: number | null; returnRequests: number; deliveredOrders: number; days: number };
  windowDays: number;
}

export interface AdminOrderQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  period?: '7d' | '30d' | '90d' | 'all';
  /** The attention queue, composable with every other filter here. */
  attention?: boolean;
  sort?: 'newest' | 'oldest' | 'total_desc' | 'total_asc';
}

export interface BulkOutcome {
  orderNumber: string;
  ok: boolean;
  message: string;
}

export interface BulkResult {
  requested: number;
  succeeded: number;
  failed: number;
  outcomes: BulkOutcome[];
}

/* ---------------------------------------------------------------- */
/* Customers                                                         */
/* ---------------------------------------------------------------- */

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

export interface AdminCustomerDetail extends AdminCustomerRow {
  role: string;
  isEmailVerified: boolean;
  /** Counted, not listed — an operator needs to know it exists, not read it. */
  addressCount: number;
  cancelledOrders: number;
  reviewCount: number;
  averageRating: number | null;
  recentOrders: {
    id: string;
    orderNumber: string;
    total: number;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    createdAt: string;
  }[];
}

export interface AdminCustomerQuery {
  page?: number;
  limit?: number;
  search?: string;
  active?: boolean;
  sort?: 'newest' | 'oldest' | 'name_asc';
}

/* ---------------------------------------------------------------- */
/* Reviews                                                           */
/* ---------------------------------------------------------------- */

export interface AdminReviewRow {
  id: string;
  rating: number;
  title: string;
  comment: string;
  images: string[];
  status: ReviewStatus;
  isVerifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  /** The author's real name here, unlike the storefront's "Ananya R." */
  author: { id: string | null; name: string; email: string };
  product: { id: string | null; name: string; slug: string; image: string };
}

export interface AdminReviewDetail extends AdminReviewRow {
  /** The purchase the review is evidence of — what makes it verifiable. */
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    deliveredAt: string | null;
  } | null;
}

export interface AdminReviewQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ReviewStatus;
  rating?: number;
  verified?: boolean;
  sort?: 'newest' | 'oldest' | 'rating_desc' | 'rating_asc';
}

/* ---------------------------------------------------------------- */
/* Inventory                                                         */
/* ---------------------------------------------------------------- */

export type MovementType = 'SALE' | 'CANCELLATION' | 'INITIAL_STOCK' | 'MANUAL_ADJUSTMENT';

export const ADJUSTMENT_REASONS = [
  'RESTOCK',
  'COUNT_CORRECTION',
  'DAMAGED',
  'LOST',
  'FOUND',
  'RETURN',
  'OTHER',
] as const;

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

/**
 * Which reasons make sense in which direction.
 *
 * A copy of the server's `REASON_DIRECTION`, kept so the form can offer only
 * the reasons that fit the sign the operator typed rather than letting them
 * pick "Restock" for a decrease and be refused afterwards. The server enforces
 * it regardless — this exists to save a round trip, never to replace the check.
 */
export const REASON_DIRECTION: Record<AdjustmentReason, 'increase' | 'decrease' | 'either'> = {
  RESTOCK: 'increase',
  FOUND: 'increase',
  RETURN: 'increase',
  DAMAGED: 'decrease',
  LOST: 'decrease',
  COUNT_CORRECTION: 'either',
  OTHER: 'either',
};

export const REASON_LABEL: Record<AdjustmentReason, string> = {
  RESTOCK: 'Restock received',
  COUNT_CORRECTION: 'Count correction',
  DAMAGED: 'Damaged',
  LOST: 'Lost',
  FOUND: 'Found',
  RETURN: 'Customer return',
  OTHER: 'Other',
};

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  SALE: 'Sale',
  CANCELLATION: 'Cancellation',
  INITIAL_STOCK: 'Opening stock',
  MANUAL_ADJUSTMENT: 'Adjustment',
};

export interface InventoryRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  image: string;
  stock: number;
  stockState: StockState;
  lowStockThreshold: number;
  usesDefaultThreshold: boolean;
  isActive: boolean;
  category: string;
  brand: string;
  sizes: { total: number; available: number };
  lastMovement: {
    type: MovementType;
    quantityChange: number;
    createdAt: string;
    summary: string;
  } | null;
}

export interface MovementRow {
  id: string;
  product: { id: string; name: string; sku: string };
  variant: { color: string | null; size: string | null } | null;
  type: MovementType;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  reason: AdjustmentReason | null;
  note: string;
  summary: string;
  reference: { type: 'ORDER' | 'PRODUCT'; id: string | null; label: string } | null;
  actor: { id: string | null; name: string } | null;
  createdAt: string;
}

export interface InventoryDetail extends InventoryRow {
  price: number;
  /** Size availability, read-only: ZyCart holds no per-size quantity. */
  variants: { label: string; inStock: boolean }[];
  colors: string[];
  movements: MovementRow[];
  /** The whole ledger's size, so the panel can offer the rest rather than hide it. */
  movementCount: number;
  totals: { soldUnits: number; restockedUnits: number; adjustments: number };
  /** Where the console asks for a second confirmation. Sent, never hardcoded here. */
  largeAdjustmentThreshold: number;
  updatedAt: string;
}

export interface InventorySummary {
  products: number;
  activeProducts: number;
  sellableUnits: number;
  outOfStock: number;
  lowStock: number;
  healthy: number;
  recentMovements: number;
  recentAdjustments: number;
  defaultThreshold: number;
  largeAdjustmentThreshold: number;
}

export interface InventoryQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: StockState;
  category?: string;
  brand?: string;
  active?: boolean;
  recentlyChanged?: boolean;
  sort?: 'stock_asc' | 'stock_desc' | 'name_asc' | 'updated_desc';
}

/** What the adjustment dialog submits. A signed change, never a total. */
export interface AdjustStockInput {
  quantityChange: number;
  reason: AdjustmentReason;
  note?: string;
  /** What the dialog was showing, so the server can say if it had moved. */
  shownStock?: number;
  /** A hard precondition, sent only by the counted-total path. */
  expectedStock?: number;
}

export interface AdjustmentResult {
  productId: string;
  productName: string;
  sku: string;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  stockState: StockState;
  lowStockThreshold: number;
  stale: boolean;
}

/* ---------------------------------------------------------------- */
/* Operations                                                        */
/* ---------------------------------------------------------------- */

export interface PostPurchaseException {
  key: string;
  label: string;
  action: string;
  severity: 'critical' | 'warning';
  /** Where the console sends an operator who clicks it. Built by the server. */
  href: string;
  count: number;
}

export interface OperationsSummary {
  ordersNeedingAttention: number;
  breakdown: (AttentionFlag & { count: number })[];
  /**
   * Returns and parcels that have stalled.
   *
   * Kept separate from `breakdown` because those count orders and these count
   * returns and shipments — summing them would total unlike things.
   */
  postPurchase: PostPurchaseException[];
  queue: { pending: number; confirmed: number; processing: number; shipped: number };
  checkedAt: string;
}

/* ---------------------------------------------------------------- */
/* Audit                                                             */
/* ---------------------------------------------------------------- */

/**
 * Must match `AUDIT_ACTIONS` in `backend/src/models/audit-log.model.ts`.
 *
 * The console renders `AUDIT_ACTION_LABEL[entry.action]`, so an action the
 * server writes but this list has not heard of shows up as a blank row and is
 * missing from the filter — which is exactly what happened when Phase 13 added
 * eight actions to the backend and not to here. The activity log is the one
 * screen whose whole job is showing what happened; a silently unlabelled entry
 * is the worst thing it can do.
 */
export const AUDIT_ACTIONS = [
  'INVENTORY_ADJUSTED',
  'ORDER_STATUS_CHANGED',
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_DELETED',
  'REVIEW_MODERATED',
  'CUSTOMER_STATUS_CHANGED',
  'SHIPMENT_CREATED',
  'SHIPMENT_UPDATED',
  'SHIPMENT_STATUS_CHANGED',
  'RETURN_APPROVED',
  'RETURN_REJECTED',
  'RETURN_RECEIVED',
  'RETURN_REFUND_INITIATED',
  'RETURN_REFUND_COMPLETED',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  INVENTORY_ADJUSTED: 'Stock adjusted',
  ORDER_STATUS_CHANGED: 'Order moved',
  PRODUCT_CREATED: 'Product created',
  PRODUCT_UPDATED: 'Product updated',
  PRODUCT_DELETED: 'Product deleted',
  REVIEW_MODERATED: 'Review moderated',
  CUSTOMER_STATUS_CHANGED: 'Customer status changed',
  SHIPMENT_CREATED: 'Shipment created',
  SHIPMENT_UPDATED: 'Shipment updated',
  SHIPMENT_STATUS_CHANGED: 'Shipment moved',
  RETURN_APPROVED: 'Return approved',
  RETURN_REJECTED: 'Return rejected',
  RETURN_RECEIVED: 'Return received',
  RETURN_REFUND_INITIATED: 'Refund started',
  RETURN_REFUND_COMPLETED: 'Refund completed',
};

/** Must match `AUDIT_ENTITIES` in the backend's audit-log model. */
export const AUDIT_ENTITIES = [
  'PRODUCT',
  'ORDER',
  'REVIEW',
  'CUSTOMER',
  'SHIPMENT',
  'RETURN',
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

export interface AuditChange {
  field: string;
  from: string;
  to: string;
}

export interface AuditLogRow {
  id: string;
  actor: { id: string | null; name: string; email: string };
  action: AuditAction;
  entityType: AuditEntity;
  entityId: string | null;
  entityLabel: string;
  summary: string;
  changes: AuditChange[];
  note: string;
  createdAt: string;
}

export interface AuditQuery {
  page?: number;
  limit?: number;
  search?: string;
  action?: AuditAction;
  entityType?: AuditEntity;
  actor?: string;
  period?: 'today' | '7d' | '30d' | 'all';
}
