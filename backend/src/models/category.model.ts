import { model, Schema, type InferSchemaType } from 'mongoose';
import { GST_RATES, isGstRate } from '../config/commerce';
import { baseSchemaOptions } from './shared';

const categorySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    image: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true, index: true },

    /**
     * The GST rate every product in this category is sold at (Phase 18).
     *
     * On the category rather than the product, because GST follows the kind of
     * goods and a catalogue's categories are how this store already says what
     * kind of goods a product is. Nullable rather than defaulted, so "nobody
     * has set one" and "somebody chose 18%" stay distinguishable — the first
     * follows `DEFAULT_GST_RATE` through `gstRateOf`, the second does not.
     *
     * Changing it affects orders placed afterwards only. Every order line
     * copies the rate it was sold at.
     */
    gstRate: {
      type: Number,
      default: null,
      validate: {
        validator: (value: number | null) => value === null || isGstRate(value),
        message: `must be one of ${GST_RATES.join(', ')}`,
      },
    },

    /**
     * The HSN code printed against these goods on a tax invoice.
     *
     * Optional: a store below the turnover threshold is not required to quote
     * one, and an invoice with an empty column is better than one with an
     * invented code.
     */
    hsnCode: { type: String, trim: true, maxlength: 8, default: '' },
  },
  baseSchemaOptions,
);

export type CategoryDocument = InferSchemaType<typeof categorySchema>;

export const Category = model('Category', categorySchema);
