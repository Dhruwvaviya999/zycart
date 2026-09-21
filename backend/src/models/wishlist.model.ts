import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

const wishlistItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    addedAt: { type: Date, default: Date.now },
  },
  baseSchemaOptions,
);

const wishlistSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [wishlistItemSchema], default: [] },
  },
  baseSchemaOptions,
);

export type WishlistDocument = InferSchemaType<typeof wishlistSchema>;

export const Wishlist = model('Wishlist', wishlistSchema);
