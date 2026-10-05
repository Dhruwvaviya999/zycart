import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * What "low stock" means when a product has not been given its own opinion.
 *
 * The dashboard's low-stock panel, the admin product filter and the inventory
 * console all resolve through the helpers below, so a product cannot be low on
 * one screen and healthy on another. Five is a judgement, not a calculation —
 * ZyCart has no lead-time or velocity data to compute a reorder point from, and
 * inventing one would be worse than a number an operator can reason about.
 *
 * From Phase 12 it is a *default* rather than the rule: a product that sells
 * fifty a day and one that sells two a month should not warn at the same
 * number, so `Product.lowStockThreshold` may override it per product.
 */
export const LOW_STOCK_THRESHOLD = 5;

/** The ceiling on a per-product threshold, so one cannot mark a whole catalogue low. */
export const MAX_LOW_STOCK_THRESHOLD = 1000;

export type StockState = 'in_stock' | 'low_stock' | 'out_of_stock';

/**
 * The threshold in force for a product.
 *
 * `?? LOW_STOCK_THRESHOLD` rather than a bare read, because documents written
 * before Phase 12 have no such field and an operator's catalogue must not need
 * a migration to render. The migration exists and backfills it; this makes the
 * migration optional rather than load-bearing.
 */
export function thresholdOf(product: { lowStockThreshold?: number | null }): number {
  const value = product.lowStockThreshold;
  return typeof value === 'number' && value >= 0 ? value : LOW_STOCK_THRESHOLD;
}

/**
 * Which of the three states a quantity is in, against its own threshold.
 *
 * Out of stock wins over low stock even when the threshold is zero: nothing
 * sellable is a stronger statement than nearly nothing, and an operator reading
 * "Low stock · 0" would rightly distrust the whole column.
 */
export function stockStateOf(stock: number, threshold: number = LOW_STOCK_THRESHOLD): StockState {
  if (stock <= 0) return 'out_of_stock';
  return stock <= threshold ? 'low_stock' : 'in_stock';
}

/**
 * The same three states as Mongo filters, so a list query agrees with the label
 * beside every row.
 *
 * `$expr` is what makes a per-product threshold work at all: the comparison is
 * between two fields of the same document rather than between a field and a
 * constant, which an ordinary query operator cannot express. The cost is that
 * these clauses cannot use an index on `stock` and are evaluated per document.
 * That is acceptable here and nowhere near the storefront — these run only on
 * admin screens, over a catalogue measured in hundreds, and the alternative
 * (a stored `stockState` denormalised onto every product) would need
 * maintaining in every path that touches stock or the threshold, which is
 * exactly the kind of second source of truth this phase exists to remove.
 *
 * `$ifNull` covers documents written before the field existed.
 */
const effectiveThreshold = { $ifNull: ['$lowStockThreshold', LOW_STOCK_THRESHOLD] };

export const STOCK_FILTERS: Record<StockState, Record<string, unknown>> = {
  out_of_stock: { stock: { $lte: 0 } },
  low_stock: {
    $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', effectiveThreshold] }] },
  },
  in_stock: { $expr: { $gt: ['$stock', effectiveThreshold] } },
};

/** A selectable colourway. `hex` drives the swatch the storefront renders. */
const colorSchema = new Schema(
  { name: { type: String, required: true, trim: true }, hex: { type: String, required: true } },
  { _id: false },
);

/**
 * Sizes carry their own availability, so one sold-out size does not hide a product.
 *
 * From Phase 20 `inStock` is typed by an operator only on a product that does
 * not track stock per variant. On one that does, it is *derived*: true exactly
 * when some variant of that size has units, and rewritten by
 * `syncSizeAvailability` in the same transaction as every variant stock write.
 * It is kept stored rather than computed on read because the storefront's size
 * filter, the assistant's tools and the cards all already read it — one helper
 * keeping it true is cheaper and safer than teaching six readers a new rule.
 */
const sizeSchema = new Schema(
  {
    label: { type: String, required: true, trim: true },
    inStock: { type: Boolean, default: true },
  },
  { _id: false },
);

/** The longest variant SKU accepted; long enough for `PRODUCT-SKU-COLOUR-SIZE`. */
export const MAX_VARIANT_SKU_LENGTH = 64;

/** How many variants one product may carry: twenty colours by thirty sizes would be absurd. */
export const MAX_VARIANTS = 120;

/**
 * One sellable combination of colour and size, with its own count (Phase 20).
 *
 * Identified by the pair `(color, size)` rather than by its `_id` wherever a
 * customer is involved, because that pair is what a cart line, an order line
 * and a return line already record. A colour axis the product does not have is
 * `null` on every variant, and likewise for size — so a shirt sold only in
 * sizes has variants `(null, "S")`, `(null, "M")`, and so on.
 *
 * The `_id` is kept for the console, which adjusts one row of a table and
 * should not have to re-send the pair to do it.
 */
const variantSchema = new Schema(
  {
    color: { type: String, trim: true, default: null },
    size: { type: String, trim: true, default: null },
    sku: { type: String, required: true, trim: true, uppercase: true },
    stock: { type: Number, required: true, min: 0, default: 0 },
  },
  // `id` rather than `_id` in the API, like every document — without the
  // timestamps, which would say nothing about a row that is rewritten on edit.
  { toJSON: baseSchemaOptions.toJSON },
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

    /**
     * The authoritative sellable quantity, and the only one.
     *
     * Two functions in the whole codebase move it — `commitStock` takes it for
     * an order and `applyCancellation` gives it back — plus the inventory
     * service's adjustment, which exists so that an operator correcting a count
     * does so through a path that records why. Everything else reads it.
     *
     * From Phase 20 a product may also track stock per variant (see
     * `variants`). It then still holds the *total*, equal to the sum of its
     * variants' counts, and every writer moves the total and the one variant in
     * the same atomic update — so every screen that reads `stock` as "how many
     * can this shop sell" stays right without knowing variants exist. All of
     * those writes go through `writeStock` in `inventory/variant-stock.ts`.
     */
    stock: { type: Number, required: true, min: 0, default: 0 },

    /**
     * Stock per colour-and-size combination (Phase 20). Empty for a product
     * that holds one count for all of its options, which is every product
     * created before this phase and any product an operator chooses to keep
     * simple.
     *
     * When non-empty, a combination that is not listed here is not sold at
     * all, and `stock` is the sum of the counts below.
     */
    variants: { type: [variantSchema], default: [] },

    /**
     * When this product starts warning, overriding the store-wide default.
     *
     * Nullable rather than defaulted to 5, so "nobody has set one" and
     * "somebody chose five" stay distinguishable: the first should follow the
     * store default if that default ever changes, and the second should not.
     */
    lowStockThreshold: {
      type: Number,
      min: 0,
      max: MAX_LOW_STOCK_THRESHOLD,
      default: null,
    },

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

/**
 * The inventory console's default view: scarcest first, active products first.
 *
 * Both of its heaviest queries — "everything, sorted by stock ascending" and
 * "out of stock" — are served by this one index, which is why it is compound
 * rather than a bare `{ stock: 1 }`.
 */
productSchema.index({ isActive: 1, stock: 1 });

export type ProductVariantDocument = InferSchemaType<typeof variantSchema>;

export type ProductDocument = InferSchemaType<typeof productSchema>;

export const Product = model('Product', productSchema);
