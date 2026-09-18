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

export interface CheckoutSummary {
  items: CartItem[];
  pricing: OrderPricing;
  addresses: CheckoutAddress[];
  selectedAddressId: string | null;
  issues: CheckoutIssue[];
  notices: string[];
  canPlaceOrder: boolean;
}
