/**
 * The ZyCart AI contract, mirroring what `POST /api/ai/chat` returns.
 *
 * Note what a product result is *not*: a `ProductSummary`. The assistant is
 * deliberately given a narrower projection — no SKU, no flags, no timestamps —
 * so the shape here is the shape the server actually sends rather than the
 * catalogue type it was derived from.
 */

export type AiAvailability = 'in_stock' | 'low_stock' | 'out_of_stock';

/** A product the assistant put on screen, priced by the server on this request. */
export interface AiProductResult {
  id: string;
  name: string;
  slug: string;
  brand: string;
  brandSlug: string;
  category: string;
  categorySlug: string;
  price: number;
  compareAtPrice: number | null;
  rating: number;
  reviewCount: number;
  stock: number;
  availability: AiAvailability;
  colors: string[];
  sizes: { label: string; inStock: boolean }[];
  images: string[];
  shortDescription: string;
}

export interface AiComparison {
  /** Ids into the same turn's `products`, in table-column order. */
  productIds: string[];
  /** A blank value means the catalogue documents nothing, not that it is absent. */
  rows: { label: string; values: (string | null)[] }[];
}

/** Something the assistant actually did, as opposed to something it said. */
export interface AiCartAction {
  type: 'cart_updated';
  productId: string;
  productName: string;
  quantity: number;
  selectedColor: string | null;
  selectedSize: string | null;
}

export type AiAction = AiCartAction;

export type AiRole = 'user' | 'assistant';

/**
 * One turn as the browser sends it back.
 *
 * `productIds` and nothing else: the server re-reads every product from
 * MongoDB, so no price, name or stock level ever travels through the client
 * and back. It exists only so "the second one" still means something next turn.
 */
export interface AiChatRequestMessage {
  role: AiRole;
  content: string;
  productIds?: string[];
}

export interface AiChatRequest {
  messages: AiChatRequestMessage[];
  /** The product page the assistant was opened from. An id; never the product. */
  productId?: string;
}

export interface AiChatResponse {
  message: string;
  products: AiProductResult[];
  comparison: AiComparison | null;
  actions: AiAction[];
  productIds: string[];
}

/** A turn as the panel renders it. */
export interface AiMessage {
  id: string;
  role: AiRole;
  content: string;
  products: AiProductResult[];
  comparison: AiComparison | null;
  actions: AiAction[];
  productIds: string[];
}

export type AiStatus = 'idle' | 'sending';

/**
 * Whether the store has an assistant at all.
 *
 * `unknown` until asked. A deployment with no provider configured answers
 * `unavailable`, and the launcher is not rendered — better than a control that
 * fails when tapped.
 */
export type AiAvailabilityState = 'unknown' | 'available' | 'unavailable';

export interface AiConversationState {
  open: boolean;
  messages: AiMessage[];
  status: AiStatus;
  error: string | null;
  availability: AiAvailabilityState;
  /** Product context for this conversation, when opened from a product page. */
  productId: string | null;
}
