import type { CartItem } from '@/types/cart';
import type { OrderPricing } from '@/types/order';

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

/** Something that must be resolved in the cart before the order can be placed. */
export interface CheckoutIssue {
  itemId: string;
  productName: string;
  message: string;
}

/** A coupon that applies, as the checkout shows it. */
export interface CheckoutCoupon {
  code: string;
  description: string;
  discount: number;
}

/** The server's delivery rule, so the page never carries its own copy. */
export interface ShippingPolicy {
  freeAbove: number;
  fee: number;
}

export interface CheckoutSummary {
  items: CartItem[];
  pricing: OrderPricing;
  /** The coupon that was asked for and applies; null otherwise. */
  coupon: CheckoutCoupon | null;
  /** Why the coupon that was asked for does not apply, in the customer's words. */
  couponError: string | null;
  shippingPolicy: ShippingPolicy;
  addresses: CheckoutAddress[];
  selectedAddressId: string | null;
  issues: CheckoutIssue[];
  notices: string[];
  canPlaceOrder: boolean;
  /**
   * Whether this deployment can take online payment at all. Driven by the
   * server's Razorpay configuration, so the option is never offered when
   * pressing it would fail.
   */
  onlinePaymentAvailable: boolean;
}
