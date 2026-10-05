import mongoose, { Types } from 'mongoose';
import type { Env } from '../../config/env';
import { Product } from '../../models/product.model';
import {
  MAX_ACTIVE_ALERTS,
  ProductAlert,
  type AlertStatus,
  type AlertType,
} from '../../models/product-alert.model';
import { User } from '../../models/user.model';
import { AppError } from '../../utils/AppError';
import { logger, serializeError } from '../../utils/logger';
import type { AlertQuery, CreateAlertInput } from '../../validators/alert.validator';
import {
  findVariant,
  sameOption,
  tracksVariants,
  variantLabel,
  type VariantChoice,
  type VariantLike,
} from '../inventory/variant-stock';
import { NotificationOutbox, queueNotification } from '../notifications/notification.service';
import type { BackInStockEmailData, PriceDropEmailData } from '../notifications/templates';

/**
 * Back-in-stock and price-drop alerts (Phase 20).
 *
 * ## How an alert reaches an inbox
 *
 * A customer asks, and an ACTIVE row is written. Nothing else happens at that
 * moment. Later a sweep — `processAlerts` — reads each product that somebody is
 * waiting on, decides which of its alerts are now answered, and for each one,
 * in one transaction, marks the alert NOTIFIED and records the message through
 * the Phase 14 outbox. The send happens after the commit, exactly as every
 * other ZyCart message does.
 *
 * The sweep runs from two places:
 *
 * - **Straight after an operator acts** — a restock, a price change, a
 *   resellable return — for the one product they touched. This is what makes a
 *   restock email arrive within seconds of the restock in the common case.
 * - **From cron**, as `pnpm alerts:send`, for everything else: units returned by
 *   a cancelled order, a run interrupted by a crash, a product that was
 *   deactivated when it was restocked. It is the guarantee; the first is the
 *   courtesy.
 *
 * ## Why not raise the message inside the stock write
 *
 * Phase 14 raises every message in the transaction of the change that caused
 * it, and that is right for "your order shipped": one change, one message. A
 * restock answers every alert waiting on that product — possibly hundreds — and
 * that fan-out does not belong inside the transaction that moved the units.
 * Checkout must not get slower because a lot of people wanted the same shoe.
 *
 * ## What makes running it twice harmless
 *
 * The claim. An alert is moved from ACTIVE to NOTIFIED by a conditional update
 * that only one caller can win, in the same transaction as the message intent,
 * and the message's key is the alert's id. Two sweeps racing over the same
 * product send one email per alert.
 */

/* ---------------------------------------------------------------- */
/* When an alert is answered                                         */
/* ---------------------------------------------------------------- */

/** The product fields the rules below read. Structural, so documents and lean rows both fit. */
export interface AlertProduct {
  price: number;
  stock: number;
  isActive?: boolean | null;
  sizes?: readonly { label: string; inStock?: boolean | null }[] | null;
  variants?: readonly VariantLike[] | null;
}

export interface AlertRule {
  type: AlertType;
  selectedColor?: string | null;
  selectedSize?: string | null;
  priceAtCreation?: number | null;
}

/**
 * Whether the thing a customer asked about can be bought right now.
 *
 * - On a product that tracks stock per variant, a chosen combination needs
 *   units of its own; no combination means anything in the product will do.
 * - On a product that holds one count, there must be units, and a chosen size
 *   must not be marked sold out — the only per-size fact such a product has.
 *   Colours carry no availability there, so a colour cannot be waited on.
 */
export function isAvailable(product: AlertProduct, choice: VariantChoice): boolean {
  if (product.isActive === false || product.stock <= 0) return false;

  const wantsOption = Boolean(choice.color?.trim() || choice.size?.trim());

  if (tracksVariants(product)) {
    if (!wantsOption) return true;
    return (findVariant(product.variants, choice)?.stock ?? 0) > 0;
  }

  if (!choice.size?.trim()) return true;

  const size = product.sizes?.find((entry) => sameOption(entry.label, choice.size));
  return size !== undefined && size.inStock !== false;
}

/**
 * Whether this alert's question has been answered.
 *
 * A price drop needs the price below the one the customer saw *and* the
 * product to be buyable: telling somebody a thing is cheaper while it cannot
 * be bought sends them to a page that disappoints them. The alert waits, and
 * fires when both are true.
 */
export function alertSatisfied(alert: AlertRule, product: AlertProduct): boolean {
  if (alert.type === 'BACK_IN_STOCK') {
    return isAvailable(product, { color: alert.selectedColor, size: alert.selectedSize });
  }

  return (
    typeof alert.priceAtCreation === 'number' &&
    product.price < alert.priceAtCreation &&
    isAvailable(product, {})
  );
}

/* ---------------------------------------------------------------- */
/* The customer's side                                               */
/* ---------------------------------------------------------------- */

export interface AlertView {
  id: string;
  type: AlertType;
  status: AlertStatus;
  selectedColor: string | null;
  selectedSize: string | null;
  /** `Black · Size 9`, or empty for the product as a whole. */
  variant: string;
  priceAtCreation: number | null;
  notifiedAt: string | null;
  notifiedPrice: number | null;
  createdAt: string;
  /**
   * The product as it is now, or a snapshot when it has been removed. `price`
   * and `available` are null for a removed product: there is nothing to quote.
   */
  product: {
    id: string;
    name: string;
    slug: string;
    image: string | null;
    price: number | null;
    available: boolean | null;
    exists: boolean;
  };
}

type AlertDoc = InstanceType<typeof ProductAlert>;

const PRODUCT_FIELDS = 'name slug images price stock isActive sizes variants';

async function toViews(alerts: AlertDoc[]): Promise<AlertView[]> {
  const products = await Product.find({
    _id: { $in: [...new Set(alerts.map((alert) => String(alert.product)))] },
  }).select(PRODUCT_FIELDS);

  const byId = new Map(products.map((product) => [String(product._id), product]));

  return alerts.map((alert) => {
    const product = byId.get(String(alert.product));
    const choice = { color: alert.selectedColor, size: alert.selectedSize };

    return {
      id: String(alert._id),
      type: alert.type,
      status: alert.status,
      selectedColor: alert.selectedColor ?? null,
      selectedSize: alert.selectedSize ?? null,
      variant: variantLabel(choice),
      priceAtCreation: alert.priceAtCreation ?? null,
      notifiedAt: alert.notifiedAt ? alert.notifiedAt.toISOString() : null,
      notifiedPrice: alert.notifiedPrice ?? null,
      createdAt: alert.createdAt.toISOString(),
      product: product
        ? {
            id: String(product._id),
            name: product.name,
            slug: product.slug,
            image: product.images[0] ?? null,
            price: product.isActive ? product.price : null,
            available: isAvailable(product, alert.type === 'BACK_IN_STOCK' ? choice : {}),
            exists: product.isActive,
          }
        : {
            id: String(alert.product),
            name: alert.productName,
            slug: alert.productSlug,
            image: null,
            price: null,
            available: null,
            exists: false,
          },
    };
  });
}

/** How many alerts the account page lists. Active ones always fit under `MAX_ACTIVE_ALERTS`. */
const LIST_LIMIT = 100;

export async function listAlerts(userId: string, query: AlertQuery = {}): Promise<AlertView[]> {
  const alerts = await ProductAlert.find({
    user: userId,
    ...(query.productId ? { product: new Types.ObjectId(query.productId) } : {}),
  })
    // Waiting ones first — that is what the page is for — then what has fired.
    .sort({ status: 1, createdAt: -1 })
    .limit(LIST_LIMIT);

  return toViews(alerts);
}

/**
 * Sets an alert, or returns the one already set.
 *
 * ## What is refused, and why
 *
 * - A product that is gone or switched off: there is nothing to wait for.
 * - A colour or size the product does not sell: the alert could never fire.
 * - A restock alert for something buyable *right now*: the customer should be
 *   told to buy it, not promised an email about it.
 * - More than `MAX_ACTIVE_ALERTS` waiting at once.
 *
 * Asking twice is not refused. The partial unique index means the second
 * request cannot create a second row, and it answers with the first.
 */
export async function createAlert(
  userId: string,
  input: CreateAlertInput,
): Promise<{ alert: AlertView; created: boolean }> {
  const product = await Product.findById(input.productId).select(`${PRODUCT_FIELDS} colors`);

  if (!product || !product.isActive) throw new AppError('Product not found', 404);

  const choice =
    input.type === 'BACK_IN_STOCK'
      ? { color: input.selectedColor?.trim() || null, size: input.selectedSize?.trim() || null }
      : { color: null, size: null };

  if (choice.color && !product.colors.some((color) => sameOption(color.name, choice.color))) {
    throw new AppError('That colour is not one this product comes in', 400);
  }
  if (choice.size && !product.sizes.some((size) => sameOption(size.label, choice.size))) {
    throw new AppError('That size is not one this product comes in', 400);
  }

  if (input.type === 'BACK_IN_STOCK') {
    if (tracksVariants(product) && (choice.color || choice.size)) {
      if (!findVariant(product.variants, choice)) {
        throw new AppError(`${product.name} is not sold in ${variantLabel(choice)}`, 400);
      }
    }

    if (isAvailable(product, choice)) {
      const what = variantLabel(choice);
      throw new AppError(
        `${product.name}${what ? ` in ${what}` : ''} is in stock now — you can add it to your cart.`,
        409,
      );
    }
  }

  const existing = await ProductAlert.findOne({
    user: userId,
    product: product._id,
    type: input.type,
    selectedColor: choice.color,
    selectedSize: choice.size,
    status: 'ACTIVE',
  });

  if (existing) return { alert: (await toViews([existing]))[0]!, created: false };

  const active = await ProductAlert.countDocuments({ user: userId, status: 'ACTIVE' });

  if (active >= MAX_ACTIVE_ALERTS) {
    throw new AppError(
      `You already have ${MAX_ACTIVE_ALERTS} alerts waiting. Remove one from your account to add another.`,
      409,
    );
  }

  let alert: AlertDoc;

  try {
    alert = await ProductAlert.create({
      user: new Types.ObjectId(userId),
      product: product._id,
      type: input.type,
      selectedColor: choice.color,
      selectedSize: choice.size,
      // The server's own figure, never the request's.
      priceAtCreation: input.type === 'PRICE_DROP' ? product.price : null,
      productName: product.name,
      productSlug: product.slug,
    });
  } catch (error) {
    // Two requests at once: the index let one through, and that one is the answer.
    const duplicate =
      typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
    if (!duplicate) throw error;

    const winner = await ProductAlert.findOne({
      user: userId,
      product: product._id,
      type: input.type,
      selectedColor: choice.color,
      selectedSize: choice.size,
      status: 'ACTIVE',
    });

    if (!winner) throw error;
    return { alert: (await toViews([winner]))[0]!, created: false };
  }

  logger.info('alert_created', {
    alertId: String(alert._id),
    productId: String(product._id),
    type: input.type,
  });

  return { alert: (await toViews([alert]))[0]!, created: true };
}

/** Removes one of the customer's own alerts, waiting or fired. */
export async function deleteAlert(userId: string, alertId: string): Promise<void> {
  const result = await ProductAlert.deleteOne({ _id: alertId, user: userId });
  if (result.deletedCount === 0) throw new AppError('Alert not found', 404);
}

/* ---------------------------------------------------------------- */
/* The sweep                                                         */
/* ---------------------------------------------------------------- */

export const ALERTS_DEFAULT_LIMIT = 200;
export const ALERTS_MAX_LIMIT = 1000;

export interface AlertSummary {
  dryRun: boolean;
  /** Products with somebody waiting on them that the run looked at. */
  products: number;
  /** Alerts whose question was answered, and a message recorded (or, in a dry run, would be). */
  queued: number;
  /** Answered, and deliberately not sent: the account is switched off, or another run got there first. */
  skipped: number;
}

export interface AlertOptions {
  limit: number;
  dryRun: boolean;
  /** Only these products — the operator-triggered run. Absent: every product with an active alert. */
  productIds?: readonly string[];
}

function buildPayload(
  alert: AlertDoc,
  product: { name: string; slug: string; price: number },
  customerName: string,
): BackInStockEmailData | PriceDropEmailData {
  if (alert.type === 'BACK_IN_STOCK') {
    return {
      customerName,
      productName: product.name,
      productSlug: product.slug,
      variant: variantLabel({ color: alert.selectedColor, size: alert.selectedSize }),
    };
  }

  return {
    customerName,
    productName: product.name,
    productSlug: product.slug,
    previousPrice: alert.priceAtCreation ?? product.price,
    currentPrice: product.price,
  };
}

/**
 * Answers one alert, if it is still unanswered and still answerable.
 *
 * Everything is re-read inside the transaction. The product was read once by
 * the sweep to decide this alert was worth a transaction; it is read again
 * here because a restock that sold out again in the meantime must not produce
 * an email saying it is back.
 *
 * Returns whether a message was recorded.
 */
async function answerAlert(
  alertId: Types.ObjectId,
  session: mongoose.ClientSession,
  outbox: NotificationOutbox,
): Promise<boolean> {
  const alert = await ProductAlert.findOne({ _id: alertId, status: 'ACTIVE' }).session(session);
  if (!alert) return false;

  const product = await Product.findById(alert.product).select(PRODUCT_FIELDS).session(session);
  if (!product || !alertSatisfied(alert, product)) return false;

  // Alerts are something a customer asked for; an account that has been
  // switched off is not sent them. The alert waits rather than being spent.
  const user = await User.findById(alert.user).select('isActive').session(session);
  if (!user?.isActive) return false;

  // The claim. Conditional on ACTIVE, so of two sweeps only one gets here.
  const claimed = await ProductAlert.updateOne(
    { _id: alert._id, status: 'ACTIVE' },
    {
      $set: {
        status: 'NOTIFIED',
        notifiedAt: new Date(),
        notifiedPrice: alert.type === 'PRICE_DROP' ? product.price : null,
      },
    },
    { session },
  );

  if (claimed.modifiedCount === 0) return false;

  const created = await queueNotification(
    {
      event: alert.type,
      entityType: 'PRODUCT',
      entityId: product._id,
      entityLabel: product.name,
      // The alert, not the product: one product answers many alerts, and each
      // is its own message with its own key.
      keyReference: String(alert._id),
      orderNumber: '',
      userId: alert.user,
      buildPayload: (recipient) => buildPayload(alert, product, recipient.firstName),
    },
    session,
    outbox,
  );

  return created !== null;
}

/**
 * One pass over the products somebody is waiting on.
 *
 * Driven by products rather than by alerts, so that thousands of alerts on a
 * product that is still sold out cost one read of that product and nothing
 * more — and an answered alert can never be starved behind unanswered ones
 * that happened to sort first. Within a product, alerts are read through a
 * cursor and only answered ones open a transaction.
 *
 * Bounded by `limit` answered alerts per run; the next run continues.
 */
export async function processAlerts(env: Env, options: AlertOptions): Promise<AlertSummary> {
  const summary: AlertSummary = { dryRun: options.dryRun, products: 0, queued: 0, skipped: 0 };
  const outbox = new NotificationOutbox();

  const productIds = options.productIds
    ? options.productIds.map((id) => new Types.ObjectId(id))
    : ((await ProductAlert.distinct('product', { status: 'ACTIVE' })) as Types.ObjectId[]);

  for (const productId of productIds) {
    if (summary.queued + summary.skipped >= options.limit) break;

    const product = await Product.findById(productId).select(PRODUCT_FIELDS);

    // Gone or switched off: nobody can buy it, so nobody is told it is back.
    if (!product?.isActive) continue;

    summary.products += 1;

    const cursor = ProductAlert.find({ product: productId, status: 'ACTIVE' })
      .sort({ createdAt: 1, _id: 1 })
      .cursor();

    for await (const alert of cursor) {
      if (summary.queued + summary.skipped >= options.limit) break;
      if (!alertSatisfied(alert, product)) continue;

      if (options.dryRun) {
        summary.queued += 1;
        continue;
      }

      const session = await mongoose.startSession();

      try {
        let queued = false;

        await session.withTransaction(async () => {
          queued = await answerAlert(alert._id, session, outbox);
        });

        if (queued) {
          summary.queued += 1;
          logger.info('alert_queued', {
            alertId: String(alert._id),
            productId: String(productId),
            type: alert.type,
          });
        } else {
          summary.skipped += 1;
        }
      } finally {
        await session.endSession();
      }
    }

    await cursor.close();
  }

  // After every transaction has committed, and unable to throw.
  await outbox.flush(env);

  return summary;
}

/**
 * Runs the sweep for one product, without making anybody wait for it.
 *
 * Called by the console's controllers after a restock, a price change or a
 * resellable return has committed. Never awaited and never able to fail the
 * request: the operator's change has already succeeded, and if this does not
 * finish — the process restarts, the database blips — `pnpm alerts:send` will
 * find the same alerts on its next run.
 */
/** The product ids an order's or a return's lines refer to, for `dispatchProductAlerts`. */
export function productIdsOf(lines: readonly { product?: unknown }[]): string[] {
  return lines.flatMap((line) => (line.product ? [String(line.product)] : []));
}

export function dispatchProductAlerts(env: Env, productIds: string | readonly string[]): void {
  const ids = (typeof productIds === 'string' ? [productIds] : [...productIds]).filter((id) =>
    Types.ObjectId.isValid(id),
  );

  if (ids.length === 0) return;

  processAlerts(env, { limit: ALERTS_MAX_LIMIT, dryRun: false, productIds: ids }).catch(
    (error: unknown) => {
      logger.error('alert_dispatch_failed', {
        productIds: ids,
        error: serializeError(error, { stack: true }),
      });
    },
  );
}
