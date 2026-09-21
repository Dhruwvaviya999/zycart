import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * A line stores what was chosen, never what it cost. Price, name and stock are
 * read from the product on every request, so a cart can never quote a stale
 * price back to the customer.
 */
const cartItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1 },
    selectedColor: { type: String, trim: true, default: null },
    selectedSize: { type: String, trim: true, default: null },
    addedAt: { type: Date, default: Date.now },
  },
  baseSchemaOptions,
);

const cartSchema = new Schema(
  {
    // Unique: one cart per customer, enforced by the database rather than by
    // remembering to check first.
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
  },
  baseSchemaOptions,
);

export type CartDocument = InferSchemaType<typeof cartSchema>;

export const Cart = model('Cart', cartSchema);
