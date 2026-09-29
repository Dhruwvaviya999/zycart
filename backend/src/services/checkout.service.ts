import { FREE_SHIPPING_THRESHOLD, gstRateOf, STANDARD_SHIPPING_FEE } from '../config/commerce';
import { isRazorpayConfigured, type Env } from '../config/env';
import { Product } from '../models/product.model';
import { User } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { getCart, type ResolvedCart, type ResolvedCartItem } from './cart.service';
import { lookupCoupon } from './coupons/coupon.service';
import { priceOrder, type Pricing } from './pricing/pricing';

/**
 * The money on an order, and on the checkout that precedes it.
 *
 * Phase 6 carried shipping, discount and tax as zeros so that the phase which
 * introduced them would change values rather than shapes. Phase 18 is that
 * phase: the numbers now come from `priceOrder`, which both this preview and
 * order placement call with the same lines.
 */
export type { Pricing } from './pricing/pricing';

/** The GST facts of a product: its category's rate, and the HSN code to print. */
export interface TaxFacts {
  gstRate: number;
  hsnCode: string;
}

/**
 * Looks up the GST rate and HSN code for each product, by id.
 *
 * One query, populated through the category — the rate belongs to the kind of
 * goods, and the category is where this catalogue says what kind of goods a
 * product is. A product whose category has no rate set gets the default rate,
 * through the same `gstRateOf` order placement uses, so the preview and the
 * order cannot disagree about a category nobody has configured.
 */
export async function taxFactsFor(productIds: readonly string[]): Promise<Map<string, TaxFacts>> {
  if (productIds.length === 0) return new Map();

  const products = await Product.find({ _id: { $in: productIds } })
    .select('category')
    .populate('category', 'gstRate hsnCode');

  return new Map(
    products.map((product) => {
      const category = product.category as unknown as {
        gstRate?: number | null;
        hsnCode?: string;
      } | null;

      return [
        String(product._id),
        { gstRate: gstRateOf(category), hsnCode: category?.hsnCode ?? '' },
      ] as const;
    }),
  );
}

/** A coupon that applies, as the checkout shows it. */
export interface CheckoutCoupon {
  code: string;
  description: string;
  discount: number;
}

/**
 * The delivery rule, stated alongside the prices it produced.
 *
 * Sent so the page can say "add ₹120 more for free delivery" from the server's
 * own threshold, rather than from a copy of the number that could drift.
 */
export interface ShippingPolicy {
  freeAbove: number;
  fee: number;
}

export const SHIPPING_POLICY: ShippingPolicy = {
  freeAbove: FREE_SHIPPING_THRESHOLD,
  fee: STANDARD_SHIPPING_FEE,
};

/** Something that must be resolved before an order can be placed. */
export interface CheckoutIssue {
  itemId: string;
  productName: string;
  message: string;
}

export interface CheckoutAddress {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface CheckoutSummary {
  items: ResolvedCartItem[];
  pricing: Pricing;
  /** The coupon that was asked for and applies. Null when none was asked for, or it does not. */
  coupon: CheckoutCoupon | null;
  /**
   * Why the coupon that was asked for does not apply, in words for the customer.
   *
   * A refused coupon is not an error response: the rest of the summary is still
   * exactly what the customer needs to see, priced without the discount, with
   * the reason beside the field they typed into.
   */
  couponError: string | null;
  shippingPolicy: ShippingPolicy;
  addresses: CheckoutAddress[];
  selectedAddressId: string | null;
  /** Empty means the order can be placed. */
  issues: CheckoutIssue[];
  notices: string[];
  canPlaceOrder: boolean;
  /**
   * Whether this deployment can take online payment at all.
   *
   * Driven by whether Razorpay credentials are configured, so a cash-only
   * deployment simply does not offer the option rather than offering one that
   * fails when pressed. The checkout page reads this instead of guessing from a
   * public key it can see.
   */
  onlinePaymentAvailable: boolean;
}

/**
 * Turns the live cart into what blocks checkout.
 *
 * Checkout is stricter than the cart on purpose: the cart clamps a quantity to
 * stock and carries on, whereas an order must be exactly what was asked for, so
 * anything short is raised here rather than quietly adjusted.
 */
export function findBlockingIssues(cart: ResolvedCart): CheckoutIssue[] {
  return cart.items.reduce<CheckoutIssue[]>((issues, item) => {
    const name = item.product?.name ?? 'This product';

    if (!item.product) {
      issues.push({ itemId: item.id, productName: name, message: 'is no longer available' });
    } else if (item.availability === 'out_of_stock') {
      issues.push({ itemId: item.id, productName: name, message: 'is out of stock' });
    } else if (item.quantity > item.maxQuantity) {
      issues.push({
        itemId: item.id,
        productName: name,
        message: `has only ${item.product.stock} left`,
      });
    }

    return issues;
  }, []);
}

type UserDoc = InstanceType<typeof User>;

function toCheckoutAddress(address: UserDoc['addresses'][number]): CheckoutAddress {
  return {
    id: String(address._id),
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    landmark: address.landmark,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    isDefault: address.isDefault,
  };
}

/**
 * Resolves the address the order will ship to.
 *
 * Only the authenticated customer's own addresses are reachable — the id is
 * looked up inside their own document, so another customer's address cannot be
 * found, let alone used.
 */
export async function resolveAddress(userId: string, addressId: string): Promise<CheckoutAddress> {
  const user = await User.findById(userId).select('addresses');
  if (!user) throw new AppError('Account not found', 404);

  const address = user.addresses.find((entry) => String(entry._id) === addressId);
  if (!address) throw new AppError('Delivery address not found', 404);

  return toCheckoutAddress(address);
}

/**
 * The authoritative checkout view: the live cart, this customer's addresses and
 * anything standing in the way of placing the order.
 *
 * Every number comes from the same resolver the cart uses, so checkout can never
 * quote a different subtotal than the page before it.
 */
export async function getCheckoutSummary(
  env: Env,
  userId: string,
  requestedAddressId?: string,
  couponCode?: string,
): Promise<CheckoutSummary> {
  const [cart, user] = await Promise.all([
    getCart(userId),
    User.findById(userId).select('addresses'),
  ]);

  if (!user) throw new AppError('Account not found', 404);

  const addresses = user.addresses.map(toCheckoutAddress);

  // Fall back to the default address, then to the only one there is: a customer
  // with a single saved address should not have to select it.
  const requested = requestedAddressId
    ? addresses.find((entry) => entry.id === requestedAddressId)
    : undefined;
  const selected = requested ?? addresses.find((entry) => entry.isDefault) ?? addresses[0];

  const issues = findBlockingIssues(cart);

  // The lines the cart already counts in its subtotal — anything unavailable
  // or out of stock contributes nothing there, and so nothing here either.
  const payable = cart.items.filter(
    (item): item is ResolvedCartItem & { product: NonNullable<ResolvedCartItem['product']> } =>
      item.product !== null && item.availability !== 'out_of_stock',
  );

  const facts = await taxFactsFor(payable.map((item) => item.product.id));

  let coupon: CheckoutCoupon | null = null;
  let couponError: string | null = null;

  if (couponCode) {
    const lookup = await lookupCoupon(couponCode, userId, cart.subtotal);

    if (lookup.applicable) {
      coupon = {
        code: lookup.applied.code,
        description: lookup.applied.description,
        discount: lookup.applied.discount,
      };
    } else {
      couponError = lookup.message;
    }
  }

  const { pricing } = priceOrder(
    payable.map((item) => ({
      lineTotal: item.lineTotal,
      gstRate: facts.get(item.product.id)?.gstRate ?? gstRateOf(null),
    })),
    coupon?.discount ?? 0,
  );

  return {
    items: cart.items,
    pricing,
    coupon,
    couponError,
    shippingPolicy: SHIPPING_POLICY,
    addresses,
    selectedAddressId: selected?.id ?? null,
    issues,
    notices: cart.notices,
    canPlaceOrder: cart.items.length > 0 && issues.length === 0 && addresses.length > 0,
    onlinePaymentAvailable: isRazorpayConfigured(env),
  };
}
