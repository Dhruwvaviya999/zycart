import mongoose, { Types } from 'mongoose';
import { Order } from '../models/order.model';
import { Product } from '../models/product.model';
import { Review, type ReviewStatus } from '../models/review.model';
import { AppError } from '../utils/AppError';
import type {
  AdminReviewQuery,
  CreateReviewInput,
  ModerateReviewInput,
  MyReviewQuery,
  ReviewQuery,
  UpdateReviewInput,
} from '../validators/review.validator';

type ReviewDoc = InstanceType<typeof Review>;

/** The order state that makes a customer eligible. Nothing else counts. */
const REVIEWABLE_ORDER_STATUS = 'DELIVERED';

/* ------------------------------------------------------------------ */
/* Rating aggregates                                                   */
/* ------------------------------------------------------------------ */

/** The change one review makes to a product's aggregates. */
interface RatingDelta {
  sum: number;
  count: number;
  /** Star value to increment or decrement, keyed by star. */
  stars: Partial<Record<1 | 2 | 3 | 4 | 5, number>>;
}

const addition = (rating: number): RatingDelta => ({
  sum: rating,
  count: 1,
  stars: { [rating as 1]: 1 },
});

const removal = (rating: number): RatingDelta => ({
  sum: -rating,
  count: -1,
  stars: { [rating as 1]: -1 },
});

/** A rating changed but the review still counts: the total moves, the count does not. */
function change(from: number, to: number): RatingDelta {
  if (from === to) return { sum: 0, count: 0, stars: {} };

  const stars: RatingDelta['stars'] = {};
  stars[from as 1] = -1;
  stars[to as 1] = 1;

  return { sum: to - from, count: 0, stars };
}

/**
 * Applies a rating change to a product, atomically, in one operation.
 *
 * This is an aggregation-pipeline update rather than a read, a calculation and
 * a write. That distinction is the entire concurrency story: the sums are
 * incremented and the average is recomputed *from the incremented sums* inside
 * a single atomic document update, so two customers reviewing the same product
 * at the same moment cannot read the same "before" value and each write an
 * average that ignores the other.
 *
 * `rating` is never stored as an independent fact. It is always
 * `ratingSum / reviewCount`, rounded to one decimal at the moment it is
 * written, so it cannot drift away from the numbers it claims to summarise.
 *
 * The `$max: [0, …]` guards are belt and braces: a correct caller can never
 * drive a count negative, and if a bug ever did, a product showing zero is a
 * great deal better than one showing minus three.
 */
async function applyRatingDelta(
  productId: Types.ObjectId,
  delta: RatingDelta,
  session?: mongoose.ClientSession,
): Promise<void> {
  if (delta.sum === 0 && delta.count === 0 && Object.keys(delta.stars).length === 0) return;

  const counters: Record<string, unknown> = {
    ratingSum: { $max: [0, { $add: [{ $ifNull: ['$ratingSum', 0] }, delta.sum] }] },
    reviewCount: { $max: [0, { $add: [{ $ifNull: ['$reviewCount', 0] }, delta.count] }] },
  };

  for (const [star, move] of Object.entries(delta.stars)) {
    counters[`ratingBreakdown.${star}`] = {
      $max: [0, { $add: [{ $ifNull: [`$ratingBreakdown.${star}`, 0] }, move] }],
    };
  }

  await Product.updateOne(
    { _id: productId },
    [
      { $set: counters },
      {
        // Reads the values the stage above just wrote, so the average always
        // matches the sum and count stored beside it.
        $set: {
          rating: {
            $cond: [
              { $gt: ['$reviewCount', 0] },
              { $round: [{ $divide: ['$ratingSum', '$reviewCount'] }, 1] },
              0,
            ],
          },
        },
      },
    ],
    // Mongoose 9 requires an update pipeline to be declared as one rather than
    // inferred from the argument being an array, so that a stray array in an
    // ordinary `$set` cannot silently become a pipeline.
    { session, updatePipeline: true },
  );
}

/**
 * Rebuilds a product's aggregates from the reviews that actually exist.
 *
 * The incremental path above is the one used in normal operation; this is the
 * authority it is checked against. The migration uses it to replace the
 * catalogue's seeded placeholder ratings with the truth, and it is the repair
 * tool if an aggregate is ever suspected of having drifted.
 *
 * Counts only APPROVED reviews, which is what makes pending and rejected
 * reviews invisible to the public rating.
 */
export async function recomputeProductAggregates(productId: Types.ObjectId): Promise<{
  rating: number;
  reviewCount: number;
  ratingSum: number;
}> {
  const [totals] = await Review.aggregate<{
    _id: null;
    ratingSum: number;
    reviewCount: number;
    ratings: number[];
  }>([
    { $match: { product: productId, status: 'APPROVED' } },
    {
      $group: {
        _id: null,
        ratingSum: { $sum: '$rating' },
        reviewCount: { $sum: 1 },
        ratings: { $push: '$rating' },
      },
    },
  ]);

  const ratingSum = totals?.ratingSum ?? 0;
  const reviewCount = totals?.reviewCount ?? 0;

  const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const value of totals?.ratings ?? []) {
    const star = value as 1 | 2 | 3 | 4 | 5;
    ratingBreakdown[star] += 1;
  }

  const rating = reviewCount > 0 ? Math.round((ratingSum / reviewCount) * 10) / 10 : 0;

  await Product.updateOne(
    { _id: productId },
    { $set: { rating, reviewCount, ratingSum, ratingBreakdown } },
  );

  return { rating, reviewCount, ratingSum };
}

/** Whether a review in this state contributes to the public rating. */
const counts = (status: ReviewStatus): boolean => status === 'APPROVED';

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */
/* ------------------------------------------------------------------ */

export type IneligibilityReason =
  | 'NOT_AUTHENTICATED'
  | 'NOT_PURCHASED'
  | 'ORDER_NOT_DELIVERED'
  | 'ALREADY_REVIEWED'
  | 'PRODUCT_UNAVAILABLE';

interface PurchaseEvidence {
  order: InstanceType<typeof Order>;
  orderItemId: Types.ObjectId;
}

/**
 * Finds a delivered order of this customer's that contains this product.
 *
 * This is the whole of the verified-purchase guarantee, and it is a database
 * query rather than a flag: the filter carries ownership, delivery and contents
 * together, so an order belonging to somebody else, an order that never
 * shipped, and an order for a different product are all simply not found.
 *
 * It reads the **order**, not the product. An order item is a snapshot taken at
 * purchase, so renaming, repricing, deactivating or deleting the product
 * afterwards cannot erase the evidence that it was bought.
 *
 * The most recent delivery wins when there are several, which is the one a
 * customer is most likely to be writing about.
 */
async function findPurchaseEvidence(
  userId: string,
  productId: string,
  requestedOrderId?: string,
): Promise<PurchaseEvidence | null> {
  const order = await Order.findOne({
    user: new Types.ObjectId(userId),
    status: REVIEWABLE_ORDER_STATUS,
    'items.product': new Types.ObjectId(productId),
    ...(requestedOrderId ? { _id: new Types.ObjectId(requestedOrderId) } : {}),
  }).sort({ createdAt: -1 });

  if (!order) return null;

  const item = order.items.find((line) => String(line.product) === productId);
  if (!item) return null;

  return { order, orderItemId: new Types.ObjectId(String(item._id)) };
}

/** Whether this customer has ever ordered the product at all, in any state. */
async function hasAnyOrderFor(userId: string, productId: string): Promise<boolean> {
  const count = await Order.countDocuments({
    user: new Types.ObjectId(userId),
    'items.product': new Types.ObjectId(productId),
    status: { $ne: 'CANCELLED' },
  });

  return count > 0;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: IneligibilityReason | null;
  existingReview: OwnReview | null;
}

/**
 * Answers "may this customer review this product, and have they already?".
 *
 * Deliberately returns a reason rather than a bare boolean, because the
 * interface has a genuinely different thing to say in each case — buy it first,
 * wait for delivery, or edit the review you already wrote — and none of those
 * should be rendered as a permission error.
 */
export async function getEligibility(
  userId: string,
  productId: string,
): Promise<EligibilityResult> {
  const product = await Product.findById(productId).select('_id');

  if (!product) {
    return { eligible: false, reason: 'PRODUCT_UNAVAILABLE', existingReview: null };
  }

  const existing = await Review.findOne({
    user: new Types.ObjectId(userId),
    product: new Types.ObjectId(productId),
  });

  if (existing) {
    return { eligible: false, reason: 'ALREADY_REVIEWED', existingReview: toOwnReview(existing) };
  }

  const evidence = await findPurchaseEvidence(userId, productId);
  if (evidence) return { eligible: true, reason: null, existingReview: null };

  // Told apart so the interface can say "wait for it to arrive" rather than
  // "buy it first" to somebody who has already bought it.
  const ordered = await hasAnyOrderFor(userId, productId);

  return {
    eligible: false,
    reason: ordered ? 'ORDER_NOT_DELIVERED' : 'NOT_PURCHASED',
    existingReview: null,
  };
}

/* ------------------------------------------------------------------ */
/* Response shapes                                                     */
/* ------------------------------------------------------------------ */

interface PopulatedAuthor {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

/**
 * How a reviewer is named in public.
 *
 * "Dhruw V." — enough to read as a person, not enough to identify one. Full
 * surnames and email addresses are never rendered, and the only other field
 * that leaves the server is the avatar the customer chose themselves.
 */
function displayName(author: PopulatedAuthor | null): string {
  const first = author?.firstName?.trim() ?? '';
  const initial = author?.lastName?.trim()?.charAt(0) ?? '';

  if (!first) return 'ZyCart customer';
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

export interface PublicReview {
  id: string;
  rating: number;
  title: string;
  comment: string;
  images: string[];
  isVerifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
  /** True when the review is edited, so the card can say so. */
  edited: boolean;
  author: { name: string; avatar: string };
  /** Set only on the signed-in customer's own review, for the edit affordance. */
  isMine?: boolean;
}

function toPublicReview(review: ReviewDoc, viewerId?: string): PublicReview {
  const author = (review.user ?? null) as unknown as PopulatedAuthor | null;
  const authorId = author?._id ? String(author._id) : String(review.user);

  return {
    id: String(review._id),
    rating: review.rating,
    title: review.title ?? '',
    comment: review.comment,
    images: review.images ?? [],
    isVerifiedPurchase: review.isVerifiedPurchase,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    /**
     * Mongoose stamps `createdAt` and `updatedAt` from a single value on
     * insert, so they are exactly equal on a review that has never been saved
     * again. Any difference therefore means a genuine edit — no tolerance
     * needed, and none that could wrongly label a brand new review.
     */
    edited: review.updatedAt.getTime() !== review.createdAt.getTime(),
    author: { name: displayName(author), avatar: author?.avatar ?? '' },
    ...(viewerId && viewerId === authorId ? { isMine: true } : {}),
  };
}

/** The customer's own review, which may carry its moderation state. */
export interface OwnReview extends PublicReview {
  status: ReviewStatus;
  productId: string;
}

function toOwnReview(review: ReviewDoc): OwnReview {
  return {
    ...toPublicReview(review),
    isMine: true,
    status: review.status,
    productId: String(
      (review.product as unknown as { _id?: Types.ObjectId })?._id ?? review.product,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

const AUTHOR_FIELDS = 'firstName lastName avatar';

const SORTS: Record<ReviewQuery['sort'], Record<string, 1 | -1>> = {
  // `_id` breaks ties so paging never repeats or skips a row.
  newest: { createdAt: -1, _id: 1 },
  oldest: { createdAt: 1, _id: 1 },
  highest_rating: { rating: -1, createdAt: -1, _id: 1 },
  lowest_rating: { rating: 1, createdAt: -1, _id: 1 },
};

/**
 * The public review list for one product.
 *
 * `status: APPROVED` is part of the filter rather than something applied
 * afterwards, so a pending or rejected review cannot reach the storefront
 * through any combination of filters.
 */
export async function listProductReviews(productId: string, query: ReviewQuery, viewerId?: string) {
  const filter = {
    product: new Types.ObjectId(productId),
    status: 'APPROVED' as const,
    ...(query.rating ? { rating: query.rating } : {}),
    ...(query.verified === true ? { isVerifiedPurchase: true } : {}),
  };

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      // Only the three author fields the card renders; never the whole user.
      .populate('user', AUTHOR_FIELDS)
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Review.countDocuments(filter),
  ]);

  return {
    items: reviews.map((review) => toPublicReview(review, viewerId)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export interface ReviewSummary {
  averageRating: number;
  reviewCount: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/**
 * The rating summary, served from the product's stored aggregates.
 *
 * Reading the counters rather than aggregating over the reviews is what keeps
 * the product page cheap: it is one indexed document read regardless of whether
 * the product has three reviews or thirty thousand.
 */
export async function getProductReviewSummary(productId: string): Promise<ReviewSummary> {
  const product = await Product.findById(productId).select('rating reviewCount ratingBreakdown');

  if (!product) throw new AppError('Product not found', 404);

  const breakdown = (product.ratingBreakdown ?? {}) as unknown as Record<string, number>;

  return {
    averageRating: product.rating ?? 0,
    reviewCount: product.reviewCount ?? 0,
    distribution: {
      '1': breakdown['1'] ?? 0,
      '2': breakdown['2'] ?? 0,
      '3': breakdown['3'] ?? 0,
      '4': breakdown['4'] ?? 0,
      '5': breakdown['5'] ?? 0,
    },
  };
}

/** A customer's own reviews, with the product each belongs to. */
export async function listMyReviews(userId: string, query: MyReviewQuery) {
  const filter = { user: new Types.ObjectId(userId) };

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('product', 'name slug images')
      .populate('user', AUTHOR_FIELDS)
      .sort({ createdAt: -1, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Review.countDocuments(filter),
  ]);

  const items = reviews.map((review) => {
    const product = review.product as unknown as {
      _id?: Types.ObjectId;
      name?: string;
      slug?: string;
      images?: string[];
    } | null;

    return {
      ...toOwnReview(review),
      product: {
        id: String(product?._id ?? review.product),
        // A product deleted since the review was written still renders.
        name: product?.name ?? 'This product is no longer available',
        slug: product?.slug ?? '',
        image: product?.images?.[0] ?? '',
      },
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

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Creates a review, having first proved the customer bought the product.
 *
 * The proof is obtained before anything is written, and it is obtained from
 * ZyCart's own order records — not from the request. A customer who knows a
 * product id, or who guesses an order id, gets the same answer as one who has
 * never shopped here.
 *
 * Review and aggregate are written in one transaction, so the two states that
 * would be wrong — a review that no rating reflects, or a rating with no review
 * behind it — cannot occur.
 */
export async function createReview(userId: string, input: CreateReviewInput): Promise<OwnReview> {
  const product = await Product.findById(input.productId).select('_id');
  if (!product) throw new AppError('Product not found', 404);

  const evidence = await findPurchaseEvidence(userId, input.productId, input.orderId);

  if (!evidence) {
    throw new AppError(
      'You must have a delivered order containing this product to leave a review.',
      403,
    );
  }

  /**
   * A named order item is checked against the order it claims to be in, and
   * against the product being reviewed. Without this, `orderItemId` would be a
   * field the client could fill with anything at all.
   */
  if (input.orderItemId) {
    const line = evidence.order.items.find((item) => String(item._id) === input.orderItemId);

    if (!line || String(line.product) !== input.productId) {
      throw new AppError('That order item does not match this product.', 400);
    }

    evidence.orderItemId = new Types.ObjectId(input.orderItemId);
  }

  const session = await mongoose.startSession();

  try {
    let created: ReviewDoc | undefined;

    await session.withTransaction(async () => {
      const [review] = await Review.create(
        [
          {
            user: new Types.ObjectId(userId),
            product: product._id,
            order: evidence.order._id,
            orderItem: evidence.orderItemId,
            rating: input.rating,
            title: input.title,
            comment: input.comment,
            images: input.images,
            // Both decided here, never read from the request.
            status: 'APPROVED',
            isVerifiedPurchase: true,
          },
        ],
        { session },
      );

      if (!review) throw new AppError('Could not save the review. Please try again.', 500);

      await applyRatingDelta(product._id, addition(review.rating), session);
      created = review;
    });

    if (!created) throw new AppError('Could not save the review. Please try again.', 500);

    return toOwnReview(await created.populate('user', AUTHOR_FIELDS));
  } catch (error) {
    // The unique index on { user, product } is the authority on "already
    // reviewed", so the race between two simultaneous submissions is settled by
    // the database rather than by a check that could be overtaken.
    const duplicate =
      typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;

    if (duplicate) throw new AppError('You have already reviewed this product.', 409);
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Loads a review the signed-in customer owns.
 *
 * Ownership is part of the query rather than a check afterwards, so another
 * customer's review is simply not found — the response cannot tell "someone
 * else's" from "does not exist", which is the point.
 */
async function findOwnedReview(
  userId: string,
  reviewId: string,
  session?: mongoose.ClientSession,
): Promise<ReviewDoc> {
  const query = Review.findOne({
    _id: new Types.ObjectId(reviewId),
    user: new Types.ObjectId(userId),
  });

  if (session) query.session(session);

  const review = await query;
  if (!review) throw new AppError('Review not found', 404);

  return review;
}

/**
 * Edits a review's content.
 *
 * Only the four fields a customer wrote can change. Which product it is about,
 * which order proves it, who wrote it and whether it is approved are not
 * reachable from here — the validator rejects them, and this function never
 * reads them from the input.
 *
 * **Policy:** an approved review stays approved when edited. Since ZyCart
 * approves on creation, sending edits to a queue would be moderation theatre;
 * what actually guards quality is that the author owns a delivered order, and
 * editing does not change that. A rejected review that is edited also keeps its
 * status, so editing cannot be used to undo a moderator.
 */
export async function updateReview(
  userId: string,
  reviewId: string,
  input: UpdateReviewInput,
): Promise<OwnReview> {
  const session = await mongoose.startSession();

  try {
    let updated: ReviewDoc | undefined;

    await session.withTransaction(async () => {
      const review = await findOwnedReview(userId, reviewId, session);

      const previousRating = review.rating;

      if (input.rating !== undefined) review.rating = input.rating;
      if (input.title !== undefined) review.title = input.title;
      if (input.comment !== undefined) review.comment = input.comment;
      if (input.images !== undefined) review.images = input.images;

      await review.save({ session });

      // Only a rating change on a counting review moves the aggregate, and the
      // count stays put — this is the same review, not another one.
      if (counts(review.status) && input.rating !== undefined) {
        await applyRatingDelta(
          review.product as Types.ObjectId,
          change(previousRating, review.rating),
          session,
        );
      }

      updated = review;
    });

    if (!updated) throw new AppError('Could not update the review. Please try again.', 500);

    return toOwnReview(await updated.populate('user', AUTHOR_FIELDS));
  } finally {
    await session.endSession();
  }
}

/**
 * Deletes a review and takes its rating back out of the product.
 *
 * A hard delete, which is what frees the `{ user, product }` slot and lets the
 * customer review the product again later. Both halves run in one transaction,
 * so a product can never be left counting a review that no longer exists.
 */
export async function deleteReview(userId: string, reviewId: string): Promise<void> {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const review = await findOwnedReview(userId, reviewId, session);

      // Conditional on the id, so two simultaneous deletes cannot both proceed
      // to subtract the rating.
      const removed = await Review.deleteOne({ _id: review._id }, { session });
      if (removed.deletedCount === 0) return;

      if (counts(review.status)) {
        await applyRatingDelta(review.product as Types.ObjectId, removal(review.rating), session);
      }
    });
  } finally {
    await session.endSession();
  }
}

/* ------------------------------------------------------------------ */
/* Moderation                                                          */
/* ------------------------------------------------------------------ */

/** The moderation queue. Admin only — enforced on the route, not here. */
export async function listAllReviews(query: AdminReviewQuery) {
  const filter = query.status ? { status: query.status } : {};

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('user', AUTHOR_FIELDS)
      .populate('product', 'name slug')
      .sort({ createdAt: -1, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Review.countDocuments(filter),
  ]);

  return {
    items: reviews.map((review) => {
      const product = review.product as unknown as { _id?: Types.ObjectId; name?: string } | null;

      return {
        ...toOwnReview(review),
        isMine: undefined,
        product: { id: String(product?._id ?? review.product), name: product?.name ?? '' },
      };
    }),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

/**
 * Approves or rejects a review.
 *
 * The status is all this touches. Identity, purchase evidence, product and
 * content are not parameters, so moderation can take a review out of public
 * view but can never rewrite what it says or who said it.
 *
 * The aggregate follows the decision: rejecting an approved review removes its
 * rating from the product, approving a rejected one puts it back. A repeated
 * decision is a no-op rather than a second subtraction.
 */
export async function moderateReview(
  reviewId: string,
  input: ModerateReviewInput,
): Promise<OwnReview> {
  const session = await mongoose.startSession();

  try {
    let updated: ReviewDoc | undefined;

    await session.withTransaction(async () => {
      const review = await Review.findById(reviewId).session(session);
      if (!review) throw new AppError('Review not found', 404);

      const wasCounting = counts(review.status);
      const willCount = counts(input.status);

      review.status = input.status;
      await review.save({ session });

      if (!wasCounting && willCount) {
        await applyRatingDelta(review.product as Types.ObjectId, addition(review.rating), session);
      } else if (wasCounting && !willCount) {
        await applyRatingDelta(review.product as Types.ObjectId, removal(review.rating), session);
      }

      updated = review;
    });

    if (!updated) throw new AppError('Could not update the review. Please try again.', 500);

    return toOwnReview(await updated.populate('user', AUTHOR_FIELDS));
  } finally {
    await session.endSession();
  }
}
