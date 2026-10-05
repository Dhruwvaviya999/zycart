import { Types } from 'mongoose';
import { Cart } from '../models/cart.model';
import { Product } from '../models/product.model';
import { AppError } from '../utils/AppError';
import {
  MAX_CART_QUANTITY,
  type AddCartItemInput,
  type MergeCartInput,
} from '../validators/cart.validator';
import { record } from './activity/activity.service';
import {
  findVariant,
  sellableQuantity,
  tracksVariants,
  variantLabel,
} from './inventory/variant-stock';

/** Below this the storefront says how few are left rather than implying plenty. */
const LOW_STOCK_THRESHOLD = 10;

export type Availability = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unavailable';

/** What a cart line looks like once resolved against the live catalogue. */
export interface ResolvedCartItem {
  id: string;
  quantity: number;
  selectedColor: string | null;
  selectedSize: string | null;
  addedAt: string;
  availability: Availability;
  /** The most that can be ordered right now: stock, capped by the line limit. */
  maxQuantity: number;
  lineTotal: number;
  product: {
    id: string;
    name: string;
    slug: string;
    image: string | null;
    brand: string;
    category: string;
    price: number;
    compareAtPrice: number | null;
    /**
     * How many of *this line* can be bought: the chosen variant's count on a
     * product that tracks stock per variant (Phase 20), the product's
     * otherwise. Named `stock` because that is what the cart renders it as.
     */
    stock: number;
  } | null;
}

export interface ResolvedCart {
  items: ResolvedCartItem[];
  itemCount: number;
  subtotal: number;
  savings: number;
  /** Anything the customer should be told about, e.g. a clamped quantity. */
  notices: string[];
}

interface RawLine {
  id: string;
  productId: string;
  quantity: number;
  selectedColor: string | null;
  selectedSize: string | null;
  addedAt: Date;
}

/**
 * Identifies a line by what makes it distinct: the product plus the chosen
 * variant. Two different colourways of the same shoe are two lines; the same
 * colourway added twice is one.
 */
export function lineKey(productId: string, color?: string | null, size?: string | null): string {
  return `${productId}::${color ?? ''}::${size ?? ''}`;
}

const PRODUCT_FIELDS =
  'name slug images price compareAtPrice stock variants isActive brand category';

function availabilityFor(stock: number, quantity: number): Availability {
  if (stock <= 0) return 'out_of_stock';
  if (stock < quantity || stock <= LOW_STOCK_THRESHOLD) return 'low_stock';
  return 'in_stock';
}

/**
 * Turns stored lines into the cart the client renders.
 *
 * This is the only place cart pricing exists, and both the signed-in cart and
 * the guest preview go through it — so a guest and a customer looking at the
 * same products always see the same numbers.
 *
 * A product that has been deleted or deactivated resolves to a null product
 * rather than being dropped: the customer should be told the item is gone and
 * given the chance to remove it, not have it vanish between visits.
 */
export async function resolveCart(lines: RawLine[]): Promise<ResolvedCart> {
  if (lines.length === 0) {
    return { items: [], itemCount: 0, subtotal: 0, savings: 0, notices: [] };
  }

  const products = await Product.find({
    _id: { $in: lines.map((line) => new Types.ObjectId(line.productId)) },
  })
    .select(PRODUCT_FIELDS)
    .populate('brand', 'name')
    .populate('category', 'name');

  const byId = new Map(products.map((product) => [String(product._id), product]));
  const notices = new Set<string>();

  const items: ResolvedCartItem[] = lines.map((line) => {
    const product = byId.get(line.productId);

    if (!product || !product.isActive) {
      return {
        id: line.id,
        quantity: line.quantity,
        selectedColor: line.selectedColor,
        selectedSize: line.selectedSize,
        addedAt: line.addedAt.toISOString(),
        availability: 'unavailable',
        maxQuantity: 0,
        lineTotal: 0,
        product: null,
      };
    }

    // Stock can fall after an item is added, so the orderable quantity is
    // recomputed here rather than trusted from what was stored. On a product
    // that tracks stock per variant it is this colour and size's count, and a
    // combination the product has stopped selling has none (Phase 20).
    const choice = { color: line.selectedColor, size: line.selectedSize };
    const stock = sellableQuantity(product, choice);
    const maxQuantity = Math.min(stock, MAX_CART_QUANTITY);

    // Clamp only while some stock remains. With none left nothing is orderable
    // anyway, so showing a reduced number would misreport what was asked for.
    const quantity = stock > 0 ? Math.min(line.quantity, maxQuantity) : line.quantity;
    const availability = availabilityFor(stock, line.quantity);

    if (stock > 0 && line.quantity > maxQuantity) {
      const label = tracksVariants(product) ? variantLabel(choice) : '';
      notices.add(`Only ${stock} left of ${product.name}${label ? ` in ${label}` : ''}.`);
    }

    const brand = product.brand as unknown as { name?: string } | null;
    const category = product.category as unknown as { name?: string } | null;

    return {
      id: line.id,
      quantity,
      selectedColor: line.selectedColor,
      selectedSize: line.selectedSize,
      addedAt: line.addedAt.toISOString(),
      availability,
      maxQuantity,
      lineTotal: availability === 'out_of_stock' ? 0 : product.price * quantity,
      product: {
        id: String(product._id),
        name: product.name,
        slug: product.slug,
        image: product.images[0] ?? null,
        brand: brand?.name ?? '',
        category: category?.name ?? '',
        price: product.price,
        compareAtPrice: product.compareAtPrice ?? null,
        stock,
      },
    };
  });

  // Unavailable and out-of-stock lines contribute nothing: the customer is not
  // being quoted a total that includes something they cannot buy.
  const payable = items.filter((item) => item.product && item.availability !== 'out_of_stock');

  return {
    items,
    itemCount: payable.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: payable.reduce((sum, item) => sum + item.lineTotal, 0),
    savings: payable.reduce((sum, item) => {
      const compareAt = item.product?.compareAtPrice;
      const price = item.product?.price ?? 0;
      return compareAt && compareAt > price ? sum + (compareAt - price) * item.quantity : sum;
    }, 0),
    notices: [...notices],
  };
}

type CartDoc = InstanceType<typeof Cart>;

function toRawLines(cart: CartDoc): RawLine[] {
  return cart.items.map((item) => ({
    id: String(item._id),
    productId: String(item.product),
    quantity: item.quantity,
    selectedColor: item.selectedColor ?? null,
    selectedSize: item.selectedSize ?? null,
    addedAt: item.addedAt ?? new Date(),
  }));
}

/** One cart per customer, created on first use rather than at registration. */
async function loadCart(userId: string): Promise<CartDoc> {
  const existing = await Cart.findOne({ user: userId });
  if (existing) return existing;

  return Cart.create({ user: userId, items: [] });
}

export async function getCart(userId: string): Promise<ResolvedCart> {
  return resolveCart(toRawLines(await loadCart(userId)));
}

/** Resolves guest lines without storing anything. */
export async function previewCart(input: MergeCartInput): Promise<ResolvedCart> {
  const now = new Date();

  return resolveCart(
    input.items.map((item) => ({
      id: lineKey(item.productId, item.selectedColor, item.selectedSize),
      productId: item.productId,
      quantity: item.quantity,
      selectedColor: item.selectedColor ?? null,
      selectedSize: item.selectedSize ?? null,
      addedAt: now,
    })),
  );
}

/**
 * Checks the product can be bought and that any chosen variant is one it
 * actually offers, so a crafted request cannot invent a colourway.
 */
async function assertPurchasable(input: {
  productId: string;
  selectedColor?: string | null;
  selectedSize?: string | null;
}) {
  const product = await Product.findById(input.productId).select(
    'name stock variants isActive colors sizes',
  );

  if (!product || !product.isActive) throw new AppError('Product not found', 404);
  if (product.stock <= 0) throw new AppError(`${product.name} is out of stock`, 409);

  if (product.colors.length > 0 && !input.selectedColor) {
    throw new AppError('Please choose a colour', 400);
  }
  if (product.sizes.length > 0 && !input.selectedSize) {
    throw new AppError('Please choose a size', 400);
  }

  if (input.selectedColor && !product.colors.some((c) => c.name === input.selectedColor)) {
    throw new AppError('That colour is not available', 400);
  }
  if (input.selectedSize) {
    const size = product.sizes.find((entry) => entry.label === input.selectedSize);
    if (!size) throw new AppError('That size is not available', 400);
    if (!size.inStock) throw new AppError('That size is sold out', 409);
  }

  /**
   * On a product that tracks stock per variant, the combination itself has to
   * be sold and have units (Phase 20). Size 9 can be in stock in black and sold
   * out in white; the size check above cannot tell those apart, and this can.
   */
  if (tracksVariants(product)) {
    const choice = { color: input.selectedColor, size: input.selectedSize };
    const variant = findVariant(product.variants, choice);

    if (!variant) {
      throw new AppError(`${product.name} is not sold in ${variantLabel(choice)}`, 400);
    }
    if (variant.stock <= 0) {
      throw new AppError(`${product.name} is sold out in ${variantLabel(choice)}`, 409);
    }
  }

  return product;
}

/**
 * Adds to the cart, folding into an existing line when the product and variant
 * already match — so adding the same shoe twice is quantity 2, not two lines.
 *
 * Quantity is clamped to what is actually in stock rather than rejected: the
 * customer asked for more than exists, and giving them the most they can have
 * is friendlier than refusing the whole action. `notices` explains it.
 */
export async function addItem(userId: string, input: AddCartItemInput): Promise<ResolvedCart> {
  const product = await assertPurchasable(input);
  const cart = await loadCart(userId);

  const key = lineKey(input.productId, input.selectedColor, input.selectedSize);
  const existing = cart.items.find(
    (item) => lineKey(String(item.product), item.selectedColor, item.selectedSize) === key,
  );

  const ceiling = Math.min(
    sellableQuantity(product, { color: input.selectedColor, size: input.selectedSize }),
    MAX_CART_QUANTITY,
  );

  if (existing) {
    existing.quantity = Math.min(existing.quantity + input.quantity, ceiling);
  } else {
    cart.items.push({
      product: new Types.ObjectId(input.productId),
      quantity: Math.min(input.quantity, ceiling),
      selectedColor: input.selectedColor ?? null,
      selectedSize: input.selectedSize ?? null,
      addedAt: new Date(),
    });
  }

  await cart.save();

  /**
   * Recorded after the save, so only a cart that actually accepted the item
   * becomes a signal. Fire-and-forget: a recommendation write must never be
   * able to fail an add-to-cart.
   */
  record({ userId, event: 'add_to_cart', productId: input.productId });

  return resolveCart(toRawLines(cart));
}

function findItem(cart: CartDoc, itemId: string) {
  const item = cart.items.find((entry) => String(entry._id) === itemId);
  if (!item) throw new AppError('Cart item not found', 404);
  return item;
}

export async function updateItem(
  userId: string,
  itemId: string,
  quantity: number,
): Promise<ResolvedCart> {
  const cart = await loadCart(userId);
  const item = findItem(cart, itemId);

  const product = await Product.findById(item.product).select('stock variants isActive');
  const stock = product
    ? sellableQuantity(product, { color: item.selectedColor, size: item.selectedSize })
    : 0;

  // An unavailable product can still be removed, but its quantity is not
  // something we let the customer raise.
  if (!product || !product.isActive || stock <= 0) {
    throw new AppError('This product is no longer available', 409);
  }

  item.quantity = Math.min(quantity, Math.min(stock, MAX_CART_QUANTITY));

  await cart.save();
  return resolveCart(toRawLines(cart));
}

export async function removeItem(userId: string, itemId: string): Promise<ResolvedCart> {
  const cart = await loadCart(userId);
  findItem(cart, itemId);

  cart.items = cart.items.filter((entry) => String(entry._id) !== itemId) as CartDoc['items'];

  await cart.save();
  return resolveCart(toRawLines(cart));
}

export async function clearCart(userId: string): Promise<ResolvedCart> {
  const cart = await loadCart(userId);
  cart.items = [] as unknown as CartDoc['items'];

  await cart.save();
  return resolveCart(toRawLines(cart));
}

/**
 * Folds a guest cart into the customer's stored one at sign-in.
 *
 * Additive by design: the account cart is never overwritten. A product and
 * variant present on both sides has its quantities summed and then clamped to
 * stock; a variant only one side has becomes its own line. Guest entries whose
 * product has since been deleted or deactivated are skipped and reported rather
 * than failing the whole merge — losing one discontinued item must not cost the
 * customer the rest of their cart.
 */
export async function mergeCart(userId: string, input: MergeCartInput): Promise<ResolvedCart> {
  const cart = await loadCart(userId);

  if (input.items.length === 0) return resolveCart(toRawLines(cart));

  const products = await Product.find({
    _id: { $in: input.items.map((item) => new Types.ObjectId(item.productId)) },
    isActive: true,
  }).select('name stock variants colors sizes');

  const byId = new Map(products.map((product) => [String(product._id), product]));
  const skipped: string[] = [];

  for (const guestItem of input.items) {
    const product = byId.get(guestItem.productId);
    const choice = { color: guestItem.selectedColor, size: guestItem.selectedSize };
    const stock = product ? sellableQuantity(product, choice) : 0;

    if (!product || stock <= 0) {
      skipped.push(guestItem.productId);
      continue;
    }

    // A variant the product no longer offers is dropped rather than carried
    // over as an unbuyable line.
    const colorOk =
      !guestItem.selectedColor || product.colors.some((c) => c.name === guestItem.selectedColor);
    const sizeOk =
      !guestItem.selectedSize || product.sizes.some((s) => s.label === guestItem.selectedSize);

    if (!colorOk || !sizeOk) {
      skipped.push(guestItem.productId);
      continue;
    }

    const key = lineKey(guestItem.productId, guestItem.selectedColor, guestItem.selectedSize);
    const existing = cart.items.find(
      (item) => lineKey(String(item.product), item.selectedColor, item.selectedSize) === key,
    );

    const ceiling = Math.min(stock, MAX_CART_QUANTITY);

    if (existing) {
      existing.quantity = Math.min(existing.quantity + guestItem.quantity, ceiling);
    } else {
      cart.items.push({
        product: new Types.ObjectId(guestItem.productId),
        quantity: Math.min(guestItem.quantity, ceiling),
        selectedColor: guestItem.selectedColor ?? null,
        selectedSize: guestItem.selectedSize ?? null,
        addedAt: new Date(),
      });
    }
  }

  await cart.save();

  const resolved = await resolveCart(toRawLines(cart));

  if (skipped.length > 0) {
    resolved.notices.push(
      `${skipped.length} saved ${skipped.length === 1 ? 'item is' : 'items are'} no longer available and could not be added.`,
    );
  }

  return resolved;
}

/** Used by the wishlist's move-to-cart, which needs to add without re-resolving twice. */
export { loadCart as loadCartDocument, toRawLines as cartLines, assertPurchasable };
