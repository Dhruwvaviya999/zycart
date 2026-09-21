import { isRazorpayConfigured, type Env } from '../config/env';
import { User } from '../models/user.model';
import { AppError } from '../utils/AppError';
import { getCart, type ResolvedCart, type ResolvedCartItem } from './cart.service';

/**
 * The money on an order, and on the checkout that precedes it.
 *
 * Shipping, discount and tax are zero because ZyCart has no carrier, coupon or
 * tax engine yet — not because they were forgotten. They are carried explicitly
 * so the phases that introduce them change values, not shapes.
 */
export interface Pricing {
  subtotal: number;
  shipping: number;
  discount: number;
  tax: number;
  total: number;
}

export function priceCart(subtotal: number): Pricing {
  const shipping = 0;
  const discount = 0;
  const tax = 0;

  return { subtotal, shipping, discount, tax, total: subtotal + shipping + tax - discount };
}

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

  return {
    items: cart.items,
    pricing: priceCart(cart.subtotal),
    addresses,
    selectedAddressId: selected?.id ?? null,
    issues,
    notices: cart.notices,
    canPlaceOrder: cart.items.length > 0 && issues.length === 0 && addresses.length > 0,
    onlinePaymentAvailable: isRazorpayConfigured(env),
  };
}
