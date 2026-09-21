import { Types } from 'mongoose';
import { Order } from '../../models/order.model';
import { Product } from '../../models/product.model';
import { Review } from '../../models/review.model';
import { User } from '../../models/user.model';
import { AppError } from '../../utils/AppError';
import { escapeRegex } from '../../validators/common';
import type { AdminReviewQuery } from '../../validators/admin.validator';

/**
 * The moderation queue.
 *
 * Reading is admin-specific: a moderator needs to see pending and rejected
 * reviews, which the public list exists to hide, and needs the author's real
 * name rather than the "Ananya R." the storefront shows.
 *
 * Deciding is **not** here. Approving and rejecting call
 * `reviewService.moderateReview`, which owns the transaction that moves a
 * product's rating aggregates — so an administrator cannot change what a review
 * counts for without the rating following, and no controller in this codebase
 * writes `rating`, `reviewCount` or `ratingBreakdown` by hand.
 */

const SORTS: Record<AdminReviewQuery['sort'], Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: 1 },
  oldest: { createdAt: 1, _id: 1 },
  rating_desc: { rating: -1, createdAt: -1, _id: 1 },
  rating_asc: { rating: 1, createdAt: -1, _id: 1 },
};

export interface AdminReviewRow {
  id: string;
  rating: number;
  title: string;
  comment: string;
  images: string[];
  status: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  author: { id: string | null; name: string; email: string };
  product: { id: string | null; name: string; slug: string; image: string };
}

const AUTHOR_FIELDS = 'firstName lastName email';
const PRODUCT_FIELDS = 'name slug images';

interface PopulatedAuthor {
  _id?: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface PopulatedProduct {
  _id?: Types.ObjectId;
  name?: string;
  slug?: string;
  images?: string[];
}

function toRow(review: InstanceType<typeof Review>): AdminReviewRow {
  const author = review.user as unknown as PopulatedAuthor | null;
  const product = review.product as unknown as PopulatedProduct | null;

  return {
    id: String(review._id),
    rating: review.rating,
    title: review.title ?? '',
    comment: review.comment,
    images: review.images ?? [],
    status: review.status,
    isVerifiedPurchase: review.isVerifiedPurchase,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    edited: review.updatedAt.getTime() !== review.createdAt.getTime(),
    author: {
      id: author?._id ? String(author._id) : null,
      // The full name here, not the storefront's initial: a moderator deciding
      // whether a review is genuine needs to know who wrote it.
      name: [author?.firstName, author?.lastName].filter(Boolean).join(' ') || 'Deleted customer',
      email: author?.email ?? '',
    },
    product: {
      id: product?._id ? String(product._id) : null,
      name: product?.name ?? 'Deleted product',
      slug: product?.slug ?? '',
      image: product?.images?.[0] ?? '',
    },
  };
}

/**
 * Searching by author or product needs those collections resolved first,
 * because a review stores references rather than names. Both lookups are
 * capped, so a one-letter search cannot build an unbounded `$in`.
 */
async function searchClauses(term: string) {
  const pattern = new RegExp(escapeRegex(term), 'i');

  const [users, products] = await Promise.all([
    User.find({ $or: [{ firstName: pattern }, { lastName: pattern }, { email: pattern }] })
      .select('_id')
      .limit(200),
    Product.find({ $or: [{ name: pattern }, { sku: pattern }] })
      .select('_id')
      .limit(200),
  ]);

  return [
    { title: pattern },
    { comment: pattern },
    { user: { $in: users.map((user) => user._id) } },
    { product: { $in: products.map((product) => product._id) } },
  ];
}

export async function listReviews(query: AdminReviewQuery) {
  const filter: Record<string, unknown> = {};

  if (query.status) filter.status = query.status;
  if (query.rating) filter.rating = query.rating;
  if (query.verified !== undefined) filter.isVerifiedPurchase = query.verified;
  if (query.search) filter.$or = await searchClauses(query.search);

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('user', AUTHOR_FIELDS)
      .populate('product', PRODUCT_FIELDS)
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Review.countDocuments(filter),
  ]);

  return {
    items: reviews.map(toRow),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export interface AdminReviewDetail extends AdminReviewRow {
  /** The purchase this review is evidence of, which is what makes it verified. */
  order: { id: string; orderNumber: string; status: string; deliveredAt: string | null } | null;
}

/**
 * One review, with the order behind it.
 *
 * The order reference is the whole point of moderating with confidence: it is
 * how a moderator confirms that a review they are unsure about really does come
 * from somebody who received the product.
 */
export async function getReview(reviewId: string): Promise<AdminReviewDetail> {
  const review = await Review.findById(reviewId)
    .populate('user', AUTHOR_FIELDS)
    .populate('product', PRODUCT_FIELDS);

  if (!review) throw new AppError('Review not found', 404);

  const order = await Order.findById(review.order).select('orderNumber status updatedAt');

  return {
    ...toRow(review),
    order: order
      ? {
          id: String(order._id),
          orderNumber: order.orderNumber,
          status: order.status,
          deliveredAt: order.status === 'DELIVERED' ? order.updatedAt.toISOString() : null,
        }
      : null,
  };
}
