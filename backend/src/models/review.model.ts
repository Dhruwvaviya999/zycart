import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * Moderation state.
 *
 * ZyCart approves on creation today — every review has already been proven to
 * come from a delivered purchase, which is a far stronger filter than a
 * moderation queue would be. The other two states exist because the admin
 * endpoints use them, and because a future queue should be a policy change
 * rather than a migration.
 *
 * Only APPROVED reviews are public, and only APPROVED reviews count towards a
 * product's rating.
 */
export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** The only ratings ZyCart accepts. Whole stars, one through five. */
export const RATING_VALUES = [1, 2, 3, 4, 5] as const;
export type RatingValue = (typeof RATING_VALUES)[number];

export const MAX_REVIEW_IMAGES = 5;

const reviewSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },

    /**
     * The purchase this review is evidence of.
     *
     * Kept as a reference rather than a boolean, so "was this really bought?"
     * stays an answerable question months later. An order is a snapshot that
     * nothing can rewrite, which makes it the right thing to point at — the
     * product can be renamed, repriced or withdrawn without weakening the
     * claim the review makes.
     */
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    /** The specific line within that order. Not a reference — order items are embedded. */
    orderItem: { type: Schema.Types.ObjectId, required: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120, default: '' },
    comment: { type: String, required: true, trim: true, maxlength: 2000 },
    images: { type: [String], default: [] },

    status: { type: String, enum: REVIEW_STATUSES, required: true, default: 'APPROVED' },

    /**
     * Always true for a review that exists.
     *
     * There is no route through which an unverified review can be created — the
     * service proves a delivered order before it writes anything — so this is a
     * recorded fact rather than a flag anyone sets. It is stored explicitly
     * because a later phase may allow unverified reviews, and because the badge
     * the storefront renders must read a value rather than assume one.
     */
    isVerifiedPurchase: { type: Boolean, required: true, default: true },
  },
  baseSchemaOptions,
);

/**
 * One review per customer per product, enforced by the database rather than by
 * remembering to check.
 *
 * Status is deliberately **not** part of the key. A rejected review still
 * occupies the slot, so a customer whose review was removed edits that one
 * instead of posting around the rejection — which is the whole point of
 * rejecting it. Deleting is a hard delete, so it frees the slot and the
 * customer may review the product again.
 */
reviewSchema.index({ user: 1, product: 1 }, { unique: true });

// The public list: this product's approved reviews, newest first.
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });

// The same list sorted by rating, which backs both rating sorts.
reviewSchema.index({ product: 1, status: 1, rating: -1, createdAt: -1 });

// "My reviews", newest first.
reviewSchema.index({ user: 1, createdAt: -1 });

// The moderation queue: everything awaiting a decision, oldest first.
reviewSchema.index({ status: 1, createdAt: -1 });

export type ReviewDocument = InferSchemaType<typeof reviewSchema>;

export const Review = model('Review', reviewSchema);
