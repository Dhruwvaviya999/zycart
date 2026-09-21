import { z } from 'zod';
import { MAX_REVIEW_IMAGES } from '../models/review.model';
import { objectIdSchema } from './common';

/**
 * Whole stars only.
 *
 * `z.number().int()` rather than a coercion, so `"5"`, `3.5`, `0`, `6` and
 * `null` are all rejected rather than quietly becoming something valid.
 */
const ratingSchema = z
  .number({ error: 'is required' })
  .int('must be a whole number of stars')
  .min(1, 'must be at least 1 star')
  .max(5, 'must be at most 5 stars');

/**
 * Optional, because a rating and a sentence are the useful part of a review and
 * demanding a headline on top only produces headlines like "good". An empty
 * string is normalised away so the interface can test one thing.
 */
const titleSchema = z
  .string()
  .trim()
  .max(120, 'must be at most 120 characters')
  .refine((value) => value.length === 0 || value.length >= 3, {
    error: 'must be at least 3 characters',
  });

/**
 * Collapses runs of whitespace before measuring, so ten spaces is not a
 * ten-character review. This is length validation, not content moderation, and
 * it does not pretend to be more.
 */
const commentSchema = z
  .string({ error: 'is required' })
  .trim()
  .transform((value) => value.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n'))
  .pipe(
    z
      .string()
      .min(10, 'must be at least 10 characters')
      .max(2000, 'must be at most 2000 characters'),
  );

/**
 * URLs only, and a small number of them.
 *
 * Phase 8 stores image URLs exactly as the catalogue does; uploading, resizing
 * and moderating images is a later phase. The cap exists because nothing good
 * comes of a review carrying two hundred images.
 */
const imagesSchema = z
  .array(z.url('must be a valid URL').max(600, 'is too long'))
  .max(MAX_REVIEW_IMAGES, `must be at most ${MAX_REVIEW_IMAGES} images`);

/**
 * Creating a review.
 *
 * Notice what is absent, and note that `.strict()` is what makes the absence
 * mean something: `isVerifiedPurchase`, `status` and `userId` are not optional
 * fields that happen to be ignored — sending one is a 400. Every one of them is
 * decided by the server from the authenticated session and the order record.
 */
export const createReviewSchema = z
  .object({
    productId: objectIdSchema,
    /** Optional: the server finds an eligible delivered order when none is named. */
    orderId: objectIdSchema.optional(),
    /** Optional, and validated against the order — never taken on trust. */
    orderItemId: objectIdSchema.optional(),
    rating: ratingSchema,
    title: titleSchema.optional().default(''),
    comment: commentSchema,
    images: imagesSchema.default([]),
  })
  .strict();

/**
 * Editing a review: the content, and nothing else.
 *
 * `user`, `product`, `order`, `isVerifiedPurchase` and `status` are absent by
 * design, so an attempt to move a review onto another product — or to promote
 * one's own review to APPROVED — fails validation rather than needing to be
 * caught later.
 */
export const updateReviewSchema = z
  .object({
    rating: ratingSchema.optional(),
    title: titleSchema.optional(),
    comment: commentSchema.optional(),
    /**
     * Deliberately not `.default([])` here, unlike on create.
     *
     * A default survives `.optional()`, so `PATCH {}` would parse to
     * `{ images: [] }` — passing the "at least one field" check below and
     * silently deleting the customer's photos. An edit that names no field must
     * be a 400, not a quiet erasure.
     */
    images: imagesSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'at least one field must be provided');

export const REVIEW_SORTS = ['newest', 'oldest', 'highest_rating', 'lowest_rating'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export const reviewQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    /** A single star bucket, as the distribution bars link to. */
    rating: z.coerce.number().int().min(1).max(5).optional(),
    sort: z.enum(REVIEW_SORTS).default('newest'),
    verified: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();

export const myReviewQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();

/**
 * All an admin may change.
 *
 * Deliberately only the status: identity, purchase evidence and product cannot
 * be reached through this endpoint, so moderation can remove a review but never
 * rewrite what it claims or who made it.
 */
export const moderateReviewSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
  })
  .strict();

export const reviewIdParamSchema = z.object({ reviewId: objectIdSchema });
export const productIdParamSchema = z.object({ productId: objectIdSchema });

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type ReviewQuery = z.infer<typeof reviewQuerySchema>;
export type MyReviewQuery = z.infer<typeof myReviewQuerySchema>;
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;
