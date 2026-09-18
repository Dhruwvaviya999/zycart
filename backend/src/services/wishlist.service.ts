import { Types } from 'mongoose';
import { Product } from '../models/product.model';
import { Wishlist } from '../models/wishlist.model';
import { AppError } from '../utils/AppError';
import type { MoveToCartInput } from '../validators/wishlist.validator';
import { addItem, type ResolvedCart } from './cart.service';

export interface ResolvedWishlistItem {
  id: string;
  addedAt: string;
  /** False once the product is deleted or deactivated. */
  available: boolean;
  /**
   * The same shape the catalogue list endpoints return, so the storefront can
   * render a saved product with the very same card it uses everywhere else
   * rather than growing a second one.
   */
  product: Record<string, unknown> | null;
}

export interface ResolvedWishlist {
  items: ResolvedWishlistItem[];
  itemCount: number;
}

type WishlistDoc = InstanceType<typeof Wishlist>;

/** Matches the catalogue list projection, minus the long-form fields. */
const PRODUCT_FIELDS =
  'name slug shortDescription images price compareAtPrice category brand sku stock ' +
  'colors sizes tags rating reviewCount isFeatured isBestSeller isNewArrival isActive createdAt';

async function loadWishlist(userId: string): Promise<WishlistDoc> {
  const existing = await Wishlist.findOne({ user: userId });
  if (existing) return existing;

  return Wishlist.create({ user: userId, items: [] });
}

/**
 * Saved products are resolved against the catalogue on every read, so a price
 * drop shows immediately and a discontinued product is reported rather than
 * silently removed — deleting someone's saved item without asking is not ours
 * to do.
 */
async function resolve(wishlist: WishlistDoc): Promise<ResolvedWishlist> {
  if (wishlist.items.length === 0) return { items: [], itemCount: 0 };

  const products = await Product.find({
    _id: { $in: wishlist.items.map((item) => item.product) },
  })
    .select(PRODUCT_FIELDS)
    .populate('brand', 'name slug')
    .populate('category', 'name slug');

  const byId = new Map(products.map((product) => [String(product._id), product]));

  const items = wishlist.items.map<ResolvedWishlistItem>((item) => {
    const product = byId.get(String(item.product));
    const addedAt = (item.addedAt ?? new Date()).toISOString();

    if (!product || !product.isActive) {
      return { id: String(item._id), addedAt, available: false, product: null };
    }

    return {
      id: String(item._id),
      addedAt,
      available: true,
      product: product.toJSON() as Record<string, unknown>,
    };
  });

  return { items, itemCount: items.length };
}

export async function getWishlist(userId: string): Promise<ResolvedWishlist> {
  return resolve(await loadWishlist(userId));
}

/** Saving the same product twice is a no-op, not a duplicate. */
export async function addWishlistItem(
  userId: string,
  productId: string,
): Promise<ResolvedWishlist> {
  const product = await Product.findById(productId).select('isActive');
  if (!product || !product.isActive) throw new AppError('Product not found', 404);

  const wishlist = await loadWishlist(userId);

  if (!wishlist.items.some((item) => String(item.product) === productId)) {
    wishlist.items.push({ product: new Types.ObjectId(productId), addedAt: new Date() });
    await wishlist.save();
  }

  return resolve(wishlist);
}

export async function removeWishlistItem(
  userId: string,
  itemId: string,
): Promise<ResolvedWishlist> {
  const wishlist = await loadWishlist(userId);

  if (!wishlist.items.some((item) => String(item._id) === itemId)) {
    throw new AppError('Saved item not found', 404);
  }

  wishlist.items = wishlist.items.filter(
    (item) => String(item._id) !== itemId,
  ) as WishlistDoc['items'];

  await wishlist.save();
  return resolve(wishlist);
}

export async function clearWishlist(userId: string): Promise<ResolvedWishlist> {
  const wishlist = await loadWishlist(userId);
  wishlist.items = [] as unknown as WishlistDoc['items'];

  await wishlist.save();
  return resolve(wishlist);
}

/**
 * Moves one saved product into the cart.
 *
 * The cart write happens first on purpose: if it fails — out of stock, a
 * variant that is no longer offered — the item stays saved and the customer
 * loses nothing. Removing first would risk dropping it for nothing.
 */
export async function moveToCart(
  userId: string,
  itemId: string,
  input: MoveToCartInput,
): Promise<{ cart: ResolvedCart; wishlist: ResolvedWishlist }> {
  const wishlist = await loadWishlist(userId);
  const item = wishlist.items.find((entry) => String(entry._id) === itemId);

  if (!item) throw new AppError('Saved item not found', 404);

  const cart = await addItem(userId, {
    productId: String(item.product),
    quantity: input.quantity,
    selectedColor: input.selectedColor,
    selectedSize: input.selectedSize,
  });

  wishlist.items = wishlist.items.filter(
    (entry) => String(entry._id) !== itemId,
  ) as WishlistDoc['items'];
  await wishlist.save();

  return { cart, wishlist: await resolve(wishlist) };
}
