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

    /**
     * When the reminder job last dealt with this cart (Phase 18).
     *
     * "Dealt with" rather than "reminded": the job also records a cart it
     * decided *not* to remind — the customer switched reminders off, or nothing
     * left in it can be bought — so that it does not reconsider the same basket
     * on every run. Either way the cart is eligible again only once it has
     * changed since this moment *and* a cooldown has passed, so a customer who
     * leaves one basket alone hears about it once.
     *
     * Written with `timestamps: false`, so the job's own write does not look
     * like the customer touching the cart.
     */
    reminderHandledAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

/** The reminder job's sweep: carts by how long ago they last changed. */
cartSchema.index({ updatedAt: 1 });

export type CartDocument = InferSchemaType<typeof cartSchema>;

export const Cart = model('Cart', cartSchema);
