import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/** A selectable colourway. `hex` drives the swatch the storefront renders. */
const colorSchema = new Schema(
  { name: { type: String, required: true, trim: true }, hex: { type: String, required: true } },
  { _id: false },
);

/** Sizes carry their own availability, so one sold-out size does not hide a product. */
const sizeSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    inStock: { type: Boolean, default: true },
  },
  { _id: false },
);

const specificationSchema = new Schema(
  { label: { type: String, required: true, trim: true }, value: { type: String, required: true } },
  { _id: false },
);

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    shortDescription: { type: String, trim: true, maxlength: 300, default: '' },

    // Plain URLs today; swapping in Cloudinary later means changing the values,
    // not the schema.
    images: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) => value.length > 0,
        message: 'At least one image is required',
      },
    },

    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0, default: null },

    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    brand: { type: Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },

    sku: { type: String, required: true, unique: true, trim: true, uppercase: true },
    stock: { type: Number, required: true, min: 0, default: 0 },

    colors: { type: [colorSchema], default: [] },
    sizes: { type: [sizeSchema], default: [] },
    tags: { type: [String], default: [], index: true },

    // Backs the storefront's description tab. Optional: not every product has them.
    highlights: { type: [String], default: [] },
    specifications: { type: [specificationSchema], default: [] },

    /**
     * Rating aggregates, derived entirely from approved reviews.
     *
     * `rating` and `reviewCount` are what the storefront renders, and they are
     * kept as stored fields rather than computed per request because sorting
     * and filtering by rating happen in the database. They are never written by
     * hand: every change goes through `applyRatingDelta`, which recomputes
     * `rating` from `ratingSum` and `reviewCount` inside the same atomic update.
     *
     * `ratingSum` is the exact integer total of every approved rating. Keeping
     * it means an average can be maintained by addition rather than by
     * re-reading every review, and it is the sum — not the average — that stays
     * exact: 14/3 is stored as a sum of 14 over 3 reviews, and only the
     * displayed `rating` is rounded.
     */
    rating: { type: Number, min: 0, max: 5, default: 0 },
    reviewCount: { type: Number, min: 0, default: 0 },
    ratingSum: { type: Number, min: 0, default: 0 },

    /** How many approved reviews gave each star, for the distribution bars. */
    ratingBreakdown: {
      type: new Schema(
        {
          1: { type: Number, min: 0, default: 0 },
          2: { type: Number, min: 0, default: 0 },
          3: { type: Number, min: 0, default: 0 },
          4: { type: Number, min: 0, default: 0 },
          5: { type: Number, min: 0, default: 0 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },

    isFeatured: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  baseSchemaOptions,
);

// The default listing is "active, newest first"; price serves both the range
// filter and the two price sorts.
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ price: 1 });

export type ProductDocument = InferSchemaType<typeof productSchema>;

export const Product = model('Product', productSchema);
