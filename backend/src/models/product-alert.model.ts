import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * "Tell me when this is back" and "tell me when this gets cheaper" (Phase 20).
 *
 * ## One request, one message
 *
 * An alert is a customer asking to be told about one thing once. When it fires
 * it becomes NOTIFIED and stays that way; a customer who wants to hear about
 * the next restock asks again. A standing subscription that mailed on every
 * restock or every price change would be a marketing list wearing an alert's
 * clothes — Phase 14 drew that line for the whole notification system, and
 * this keeps to it.
 *
 * ## What it is about
 *
 * - **BACK_IN_STOCK** names a product and, for a product that tracks stock per
 *   colour and size, optionally the combination the customer wanted. An alert
 *   with no combination fires when *anything* in the product is buyable; one
 *   with a combination waits for that combination.
 * - **PRICE_DROP** names a product and records the price the customer was
 *   looking at. It fires when the price falls below that figure — and only
 *   while the product can be bought, because "it is cheaper and you still
 *   cannot have it" is not news anybody asked for.
 *
 * ## Why the price is stored
 *
 * `priceAtCreation` is the customer's reference point: "cheaper than when I
 * asked". It is copied from the catalogue by the server when the alert is
 * created, never taken from the request, so a crafted call cannot ask to be
 * told the product is cheaper than ₹1,000,000.
 *
 * ## Product snapshots
 *
 * The name and slug are kept as they were, for the same reason an order line
 * keeps them: the account page has to be able to say what an alert was about
 * after the product has been renamed or removed.
 */
export const ALERT_TYPES = ['BACK_IN_STOCK', 'PRICE_DROP'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/**
 * - **ACTIVE** — waiting. The sweep considers it.
 * - **NOTIFIED** — the message has been recorded. Terminal.
 *
 * There is no CANCELLED: a customer who no longer wants an alert deletes it.
 * Nothing outside the customer's own account refers to an alert, so there is no
 * history to preserve by keeping a cancelled row around.
 */
export const ALERT_STATUSES = ['ACTIVE', 'NOTIFIED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/**
 * How many alerts one customer may hold at once.
 *
 * A bound, not a policy: it exists so one account cannot turn the sweep into
 * an unbounded scan. No shopper is waiting on fifty restocks.
 */
export const MAX_ACTIVE_ALERTS = 50;

const productAlertSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    type: { type: String, enum: ALERT_TYPES, required: true },

    /** The combination waited for, on BACK_IN_STOCK only. Null: anything in the product. */
    selectedColor: { type: String, trim: true, default: null },
    selectedSize: { type: String, trim: true, default: null },

    /** The price when the alert was created, on PRICE_DROP only. Whole rupees. */
    priceAtCreation: { type: Number, min: 0, default: null },

    productName: { type: String, required: true },
    productSlug: { type: String, required: true },

    status: { type: String, enum: ALERT_STATUSES, required: true, default: 'ACTIVE' },
    notifiedAt: { type: Date, default: null },
    /** The price the message quoted, on PRICE_DROP. Kept so the account page can repeat it. */
    notifiedPrice: { type: Number, min: 0, default: null },
  },
  baseSchemaOptions,
);

/**
 * One active alert per customer, product, kind and combination.
 *
 * Partial on ACTIVE, so a customer whose alert has fired can ask again for the
 * same thing without the notified one being in the way. This index is what
 * makes asking twice harmless; the service treats a duplicate as "already
 * set" rather than as an error.
 */
productAlertSchema.index(
  { user: 1, product: 1, type: 1, selectedColor: 1, selectedSize: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } },
);

/** The sweep: active alerts for one product. */
productAlertSchema.index({ product: 1, status: 1 });

/** The account page: one customer's alerts, newest first. */
productAlertSchema.index({ user: 1, createdAt: -1 });

export type ProductAlertDocument = InferSchemaType<typeof productAlertSchema>;

export const ProductAlert = model('ProductAlert', productAlertSchema);
