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
  | 'newest'
  | 'oldest'
  | 'name_asc'
  | 'price_asc'
  | 'price_desc'
  | 'stock_asc'
  | 'stock_desc';

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

/** What the product form submits. The server owns every rule about it. */
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
}

/**
 * The customer's own order detail, plus the account behind it and the lifecycle
 * moves available from here. `allowedStatuses` comes from the server so the
 * interface never offers a transition that would be refused.
 */
export interface AdminOrderDetail extends Order {
  customer: { id: string | null; name: string; email: string; isActive: boolean } | null;
  allowedStatuses: OrderStatus[];
}

export interface AdminOrderQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  period?: '7d' | '30d' | '90d' | 'all';
  sort?: 'newest' | 'oldest' | 'total_desc' | 'total_asc';
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
  order: { id: string; orderNumber: string; status: OrderStatus; deliveredAt: string | null } | null;
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
