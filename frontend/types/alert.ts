/**
 * Back-in-stock and price-drop alerts (Phase 20), as the API returns them.
 *
 * An alert is one question a signed-in customer asked about one product, and
 * it is answered once: by email, when the answer becomes yes. After that it is
 * `NOTIFIED` and stays on the account page as a record; watching again is a
 * new alert, never the old one re-armed.
 */
export type AlertType = 'BACK_IN_STOCK' | 'PRICE_DROP';

export type AlertStatus = 'ACTIVE' | 'NOTIFIED';

/**
 * The product an alert is about, as it stands now — not as it stood when the
 * alert was set.
 *
 * `exists` is false once the product has been deleted or deactivated; the
 * name and slug are then the ones recorded on the alert, kept so the account
 * page can still say what the customer was waiting for. `price` and
 * `available` are null in that case, because there is no current answer.
 */
export interface AlertProduct {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  price: number | null;
  available: boolean | null;
  exists: boolean;
}

export interface AlertView {
  id: string;
  type: AlertType;
  status: AlertStatus;
  /** Back-in-stock only, and only when the customer named a combination. */
  selectedColor: string | null;
  selectedSize: string | null;
  /** `Black · Size 9`, `Size M`, `Black`, or empty when the whole product will do. */
  variant: string;
  /** Whole rupees, read by the server from the catalogue. Price-drop only. */
  priceAtCreation: number | null;
  notifiedAt: string | null;
  /** The price the email quoted. Price-drop only. */
  notifiedPrice: number | null;
  createdAt: string;
  product: AlertProduct;
}

/**
 * What the storefront may ask for.
 *
 * Note what is missing: a price and a recipient. The price a drop is measured
 * against is the server's own figure, and the address is the account's. A
 * price alert names no colour or size — it is about the product — and the API
 * refuses one that does.
 */
export type CreateAlertInput =
  | {
      productId: string;
      type: 'BACK_IN_STOCK';
      selectedColor?: string | null;
      selectedSize?: string | null;
    }
  | { productId: string; type: 'PRICE_DROP' };

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  BACK_IN_STOCK: 'Back in stock',
  PRICE_DROP: 'Price drop',
};
