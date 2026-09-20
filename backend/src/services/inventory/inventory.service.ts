import mongoose, { Types } from 'mongoose';
import {
  InventoryMovement,
  LARGE_ADJUSTMENT,
  MOVEMENT_DIRECTION,
  REASON_DIRECTION,
  type AdjustmentReason,
  type InventoryMovementDocument,
  type MovementReferenceType,
  type MovementType,
} from '../../models/inventory-movement.model';
import {
  LOW_STOCK_THRESHOLD,
  Product,
  STOCK_FILTERS,
  stockStateOf,
  thresholdOf,
  type StockState,
} from '../../models/product.model';
import { AppError } from '../../utils/AppError';
import { escapeRegex } from '../../validators/common';
import type { AdjustStockInput, AdminInventoryQuery } from '../../validators/inventory.validator';
import { recordAudit, startOfDaysAgo, type AuditActor } from '../admin/audit.service';

/**
 * Inventory, as an operation rather than as a column on the product form.
 *
 * ## The one thing this file is for
 *
 * `Product.stock` is the authoritative sellable quantity and there is no
 * second copy of it anywhere in ZyCart. What was missing before Phase 12 was
 * not a number but an *explanation*: stock moved when orders were placed and
 * cancelled, and it moved again whenever somebody typed a different figure into
 * the product editor, and nothing recorded which of those had happened or why.
 *
 * So every path that changes stock now also writes an `InventoryMovement` in
 * the same transaction. There are exactly four:
 *
 * ```text
 * commitStock        (order.service)      SALE
 * applyCancellation  (order.service)      CANCELLATION
 * createProduct      (product.service)    INITIAL_STOCK
 * adjustStock        (here)               MANUAL_ADJUSTMENT
 * restockFromReturn  (here)               RETURN            [Phase 13]
 * ```
 *
 * The first three already existed and were left where they were — moving them
 * here would have put the storefront's checkout behind an admin module. What
 * this file adds is the fourth and, from Phase 13, the fifth — plus the reading
 * side that makes the ledger worth keeping.
 *
 * The fifth is the one worth reading twice: returned goods do **not** go back
 * into sellable stock automatically. See `restockFromReturn`.
 */

/**
 * Refuses a movement whose sign contradicts its own type.
 *
 * The enum documents that a SALE decreases stock and a CANCELLATION increases
 * it; this is what makes that documentation true. Without it a future caller
 * passing a negative quantity to the restore path would write a ledger that
 * reads correctly and means the opposite, and no amount of care in the reading
 * code could recover from that.
 */
export function assertMovementSign(type: MovementType, quantityChange: number): void {
  if (!Number.isInteger(quantityChange) || quantityChange === 0) {
    throw new AppError('An inventory movement must change stock by a whole, non-zero amount', 400);
  }

  const direction = MOVEMENT_DIRECTION[type];

  if (direction === 'increase' && quantityChange < 0) {
    throw new AppError(`A ${type} movement cannot decrease stock`, 500);
  }

  if (direction === 'decrease' && quantityChange > 0) {
    throw new AppError(`A ${type} movement cannot increase stock`, 500);
  }
}

/**
 * Works out what a movement will leave behind, and refuses it if that is
 * impossible.
 *
 * Separated from the write so the ledger's two invariants —
 * `after = before + change`, and `after >= 0` — can be exercised on their own,
 * without a database in the way. `recordMovement` calls nothing else to decide
 * what to store, so a test of this is a test of what gets written.
 */
export function planMovement(
  type: MovementType,
  quantityBefore: number,
  quantityChange: number,
): { quantityAfter: number } {
  assertMovementSign(type, quantityChange);

  const quantityAfter = quantityBefore + quantityChange;

  if (quantityAfter < 0) {
    throw new AppError('An inventory movement cannot leave stock below zero', 409);
  }

  return { quantityAfter };
}

/**
 * The filter that makes an adjustment safe.
 *
 * Extracted because it *is* the concurrency guarantee: everything that stops
 * stock going negative, and everything that stops a stale recount applying,
 * lives in these few lines. As a pure function it can be asserted directly —
 * "a decrease always carries a floor at least as large as the decrease" is a
 * property, and a property is testable without two racing database clients.
 *
 * A pure increase needs no clause at all: `stock >= -20` is true of every
 * quantity, and adding it would only make the filter harder to read.
 */
export function adjustmentFilter(
  productId: string,
  quantityChange: number,
  expectedStock?: number,
): Record<string, unknown> {
  const stock: Record<string, number> = {};

  if (quantityChange < 0) stock.$gte = -quantityChange;
  if (expectedStock !== undefined) stock.$eq = expectedStock;

  return Object.keys(stock).length > 0 ? { _id: productId, stock } : { _id: productId };
}

export interface MovementInput {
  product: Types.ObjectId;
  productName: string;
  sku?: string;
  variant?: { color: string | null; size: string | null } | null;
  type: MovementType;
  quantityBefore: number;
  quantityChange: number;
  reason?: AdjustmentReason | null;
  note?: string;
  referenceType?: MovementReferenceType | null;
  referenceId?: Types.ObjectId | null;
  referenceLabel?: string;
  actor?: AuditActor | null;
}

/**
 * Appends one movement to the ledger.
 *
 * Takes the session rather than opening one, because a movement is never the
 * point on its own — it is the explanation attached to a stock write that has
 * to succeed or fail with it. Every caller already has a transaction open for
 * that write and passes it here.
 *
 * `quantityAfter` is computed rather than accepted, so the stored invariant
 * `after = before + change` holds by construction and cannot be broken by a
 * caller that computed it differently.
 */
export async function recordMovement(
  input: MovementInput,
  session: mongoose.ClientSession,
): Promise<void> {
  const { quantityAfter } = planMovement(input.type, input.quantityBefore, input.quantityChange);

  await InventoryMovement.create(
    [
      {
        product: input.product,
        productName: input.productName,
        sku: input.sku ?? '',
        variant: input.variant ?? null,
        type: input.type,
        quantityBefore: input.quantityBefore,
        quantityChange: input.quantityChange,
        quantityAfter,
        reason: input.reason ?? null,
        note: input.note?.trim().slice(0, 300) ?? '',
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        referenceLabel: input.referenceLabel ?? '',
        actor: input.actor ? new Types.ObjectId(input.actor.id) : null,
        actorName: input.actor?.name ?? '',
      },
    ],
    { session },
  );
}

/** What an adjustment did, phrased the way the interface reports it. */
export interface AdjustmentResult {
  productId: string;
  productName: string;
  sku: string;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  stockState: StockState;
  lowStockThreshold: number;
  /**
   * True when the stock the operator was looking at is not what the server
   * found. The adjustment still applied — a delta against authoritative state is
   * correct regardless of what a stale screen showed — but the interface says
   * so rather than reporting a number the operator did not expect.
   */
  stale: boolean;
}

/**
 * Corrects a product's stock by a signed amount.
 *
 * ## Why a delta and not a new total
 *
 * The console never sends `stock = 150`. It sends `+20` or `-5`, and the server
 * applies that to whatever the authoritative quantity turns out to be. That is
 * what makes two administrators working at once safe by construction: if A
 * opens the dialog at 10, B restocks to 20, and A then submits −5, the result is
 * 15 — five units were removed, which is exactly what A asked for. Under a
 * "set the total" API the same sequence silently discards B's restock.
 *
 * ## How the race is actually closed
 *
 * One `findOneAndUpdate`. The sufficiency check rides in the filter, so the read
 * and the write are a single atomic operation and there is no window between
 * them — the same technique `commitStock` uses for checkout, for the same
 * reason. `new: false` returns the document *as it was*, which is where
 * `quantityBefore` comes from: taking it from a separate read would reintroduce
 * precisely the gap the filter closes.
 *
 * Two decrements racing for the last six units therefore cannot both succeed.
 * The second matches nothing, and stock cannot reach −2 by any interleaving.
 *
 * ## When a stale screen *should* block the write
 *
 * A count correction is different in kind: "I counted 17 on the shelf" is a
 * statement about a total, and if the total moved while the operator was
 * counting, the delta derived from it is wrong. For that case only, the console
 * sends `expectedStock`, which joins the same atomic filter — so the check is
 * not a read-then-write either, and a stale count fails loudly instead of
 * applying a number nobody meant.
 */
export async function adjustStock(
  productId: string,
  input: AdjustStockInput,
  actor: AuditActor,
): Promise<AdjustmentResult> {
  const { quantityChange, reason, note, expectedStock } = input;

  assertAdjustmentDirection(reason, quantityChange);

  const session = await mongoose.startSession();

  try {
    let result: AdjustmentResult | undefined;

    await session.withTransaction(async () => {
      // Every guard is in the filter; see `adjustmentFilter`.
      const before = await Product.findOneAndUpdate(
        adjustmentFilter(productId, quantityChange, expectedStock),
        { $inc: { stock: quantityChange } },
        // The document *as it was*: `quantityBefore` has to come from the same
        // operation that performed the write, not from a read beside it.
        { session, returnDocument: 'before' },
      ).select('name sku stock lowStockThreshold');

      if (!before) {
        throw await adjustmentRefusal(productId, quantityChange, expectedStock, session);
      }

      const quantityBefore = before.stock;
      const quantityAfter = quantityBefore + quantityChange;
      const threshold = thresholdOf(before);

      await recordMovement(
        {
          product: before._id,
          productName: before.name,
          sku: before.sku,
          type: 'MANUAL_ADJUSTMENT',
          quantityBefore,
          quantityChange,
          reason,
          note,
          actor,
        },
        session,
      );

      await recordAudit(
        {
          actor,
          action: 'INVENTORY_ADJUSTED',
          entityType: 'PRODUCT',
          entityId: before._id,
          entityLabel: before.name,
          summary: `Stock ${quantityChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(
            quantityChange,
          )} for ${before.name} (${quantityBefore} → ${quantityAfter}) · ${humanReason(reason)}`,
          changes: [{ field: 'stock', from: String(quantityBefore), to: String(quantityAfter) }],
          note,
        },
        session,
      );

      result = {
        productId: String(before._id),
        productName: before.name,
        sku: before.sku,
        quantityBefore,
        quantityChange,
        quantityAfter,
        stockState: stockStateOf(quantityAfter, threshold),
        lowStockThreshold: threshold,
        /**
         * Only meaningful when the caller said what it was showing.
         *
         * An API client that sends no `shownStock` is not stale, it is silent —
         * reporting `true` there would have the dialog explain a discrepancy
         * that was never claimed. And a counted total cannot be stale at all:
         * the precondition in the filter is what guarantees it.
         */
        stale:
          expectedStock === undefined &&
          input.shownStock !== undefined &&
          input.shownStock !== quantityBefore,
      };
    });

    if (!result) throw new AppError('Could not adjust stock', 500);
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Says why the atomic update matched nothing.
 *
 * Reached only on the failure path, so the extra read costs nothing in the
 * normal case — and it is what turns a silent no-op into one of three specific,
 * actionable messages. The read is inside the caller's transaction, so what it
 * reports is what the update saw.
 *
 * Returns the error rather than throwing it, so the call site reads
 * `throw await adjustmentRefusal(…)` and the compiler can see that the branch
 * ends there.
 */
async function adjustmentRefusal(
  productId: string,
  quantityChange: number,
  expectedStock: number | undefined,
  session: mongoose.ClientSession,
): Promise<AppError> {
  const current = await Product.findById(productId).select('stock name').session(session);

  if (!current) return new AppError('Product not found', 404);

  if (expectedStock !== undefined && current.stock !== expectedStock) {
    return new AppError(
      `Stock for ${current.name} is now ${current.stock}, not the ${expectedStock} shown when you ` +
        'opened this form. Refresh and enter the count again.',
      409,
    );
  }

  return new AppError(
    `Only ${current.stock} in stock for ${current.name}, so it cannot be reduced by ` +
      `${Math.abs(quantityChange)}. Stock can never go below zero.`,
    409,
  );
}

/**
 * Refuses a reason that contradicts the direction.
 *
 * "Restock −5" and "Damaged +10" are almost always a sign error, and a ledger
 * full of them cannot be read later. `COUNT_CORRECTION` and `OTHER` go both
 * ways on purpose — a recount is precisely the case where either direction is
 * legitimate.
 */
export function assertAdjustmentDirection(reason: AdjustmentReason, quantityChange: number): void {
  const direction = REASON_DIRECTION[reason];

  if (direction === 'increase' && quantityChange < 0) {
    throw new AppError(
      `"${humanReason(reason)}" adds stock, so it cannot be used for a decrease. Use a count ` +
        'correction, or damaged or lost.',
      400,
    );
  }

  if (direction === 'decrease' && quantityChange > 0) {
    throw new AppError(
      `"${humanReason(reason)}" removes stock, so it cannot be used for an increase. Use a ` +
        'restock, a return, or a count correction.',
      400,
    );
  }
}

/** `COUNT_CORRECTION` → `Count correction`. */
export function humanReason(reason: AdjustmentReason): string {
  return reason.charAt(0) + reason.slice(1).toLowerCase().replace(/_/g, ' ');
}

/* ---------------------------------------------------------------- */
/* Returns (Phase 13)                                                */
/* ---------------------------------------------------------------- */

export interface RestockLine {
  product: Types.ObjectId | null;
  productName: string;
  sku: string;
  quantity: number;
  selectedColor: string | null;
  selectedSize: string | null;
}

/**
 * Puts returned units back on the shelf.
 *
 * ## Why this is here and not in the return service
 *
 * Phase 12 established that `Product.stock` has exactly four writers, each of
 * which records a movement in the same transaction as its change. This is the
 * fifth, and it lives beside the other one that is in this file for the same
 * reason: a return controller that reached for `Product.findOneAndUpdate`
 * itself would be a second stock authority, which is precisely the thing Phase
 * 12 spent a phase eliminating. The return service calls this, passes its
 * session, and never sees a product document.
 *
 * ## Why this is not automatic
 *
 * Nothing calls this merely because goods came back. An operator marks a return
 * received and states, as a separate and explicit judgement, whether the units
 * are resellable — and only `true` reaches here. A returned item may be worn,
 * broken, missing a part or simply not what was sent back, and ZyCart has no
 * inventory-condition model that could tell those apart. Incrementing sellable
 * stock on receipt would mean the shop offering things it cannot ship, which is
 * a worse failure than a manual step.
 *
 * ## What happens to a deleted product
 *
 * Skipped, exactly as `applyCancellation` skips it. There is no row to credit;
 * the return keeps its own snapshot of what came back, and the count of units
 * actually restocked is returned so the audit line can say what really
 * happened rather than what was asked for.
 */
export async function restockFromReturn(
  params: {
    lines: readonly RestockLine[];
    reference: { id: Types.ObjectId; label: string };
    actor: AuditActor;
  },
  session: mongoose.ClientSession,
): Promise<number> {
  let restocked = 0;

  for (const line of params.lines) {
    if (!line.product || line.quantity <= 0) continue;

    const updated = await Product.findOneAndUpdate(
      { _id: line.product },
      { $inc: { stock: line.quantity } },
      { session, returnDocument: 'after' },
    ).select('name sku stock');

    // The product has been deleted since the order was placed.
    if (!updated) continue;

    await recordMovement(
      {
        product: updated._id,
        productName: updated.name,
        sku: updated.sku,
        variant: { color: line.selectedColor, size: line.selectedSize },
        type: 'RETURN',
        quantityBefore: updated.stock - line.quantity,
        quantityChange: line.quantity,
        referenceType: 'RETURN',
        referenceId: params.reference.id,
        referenceLabel: params.reference.label,
        actor: params.actor,
      },
      session,
    );

    restocked += line.quantity;
  }

  return restocked;
}

/**
 * Sets, or clears, the point at which this product starts warning.
 *
 * Not a stock change, so it writes no movement — the ledger records units
 * moving, and an entry there for a threshold edit would corrupt every total
 * computed from it. It is still an administrative decision that changes what
 * the console reports, so it is audited.
 *
 * `null` clears the override and returns the product to the store default. The
 * update names exactly one field: there is no path here to price, stock or
 * activity however the body is shaped.
 */
export async function setThreshold(
  productId: string,
  lowStockThreshold: number | null,
  actor: AuditActor,
): Promise<{ id: string; lowStockThreshold: number; usesDefaultThreshold: boolean }> {
  const before = await Product.findByIdAndUpdate(
    productId,
    { $set: { lowStockThreshold } },
    // The previous value, so the audit row can report what it changed from.
    { returnDocument: 'before' },
  ).select('name lowStockThreshold');

  if (!before) throw new AppError('Product not found', 404);

  const describe = (value: number | null | undefined): string =>
    value == null ? `store default (${LOW_STOCK_THRESHOLD})` : String(value);

  await recordAudit({
    actor,
    action: 'PRODUCT_UPDATED',
    entityType: 'PRODUCT',
    entityId: before._id,
    entityLabel: before.name,
    summary: `Low-stock threshold for ${before.name} set to ${describe(lowStockThreshold)}`,
    changes: [
      {
        field: 'lowStockThreshold',
        from: describe(before.lowStockThreshold),
        to: describe(lowStockThreshold),
      },
    ],
  });

  return {
    id: String(before._id),
    lowStockThreshold: lowStockThreshold ?? LOW_STOCK_THRESHOLD,
    usesDefaultThreshold: lowStockThreshold == null,
  };
}

/* ---------------------------------------------------------------- */
/* Reading                                                           */
/* ---------------------------------------------------------------- */

export interface InventoryRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  image: string;
  stock: number;
  stockState: StockState;
  lowStockThreshold: number;
  /** Whether the threshold is this product's own or the store default. */
  usesDefaultThreshold: boolean;
  isActive: boolean;
  category: string;
  brand: string;
  /** How many size variants the product offers, and how many are sellable. */
  sizes: { total: number; available: number };
  lastMovement: {
    type: MovementType;
    quantityChange: number;
    createdAt: string;
    summary: string;
  } | null;
}

const SORTS: Record<AdminInventoryQuery['sort'], Record<string, 1 | -1>> = {
  // The default: what is closest to running out, first. `_id` breaks ties so
  // paging never repeats or skips a row.
  stock_asc: { stock: 1, _id: 1 },
  stock_desc: { stock: -1, _id: 1 },
  name_asc: { name: 1, _id: 1 },
  updated_desc: { updatedAt: -1, _id: 1 },
};

const LIST_FIELDS =
  'name slug sku images stock lowStockThreshold isActive category brand sizes updatedAt';

/**
 * How far back "recently changed" looks.
 *
 * Seven days, because the question behind the filter is "what did we do to
 * inventory this week?" — an operator reviewing yesterday's corrections or
 * checking a restock landed. A longer window turns the filter into "everything".
 */
const RECENTLY_CHANGED_DAYS = 7;

/**
 * How many recently-moved products the filter will resolve.
 *
 * The filter works by collecting product ids from the movement ledger and
 * matching on them, which needs a ceiling — an unbounded `distinct` over a
 * busy shop's ledger would build an `$in` of every product it has ever sold.
 * Five hundred is more than any operator pages through, and the filter is a
 * triage tool rather than a report.
 */
const RECENTLY_CHANGED_CAP = 500;

async function recentlyChangedProductIds(): Promise<Types.ObjectId[]> {
  const rows = await InventoryMovement.aggregate<{ _id: Types.ObjectId }>([
    { $match: { createdAt: { $gte: startOfDaysAgo(RECENTLY_CHANGED_DAYS) } } },
    { $group: { _id: '$product' } },
    { $limit: RECENTLY_CHANGED_CAP },
  ]);

  return rows.map((row) => row._id);
}

/**
 * Attaches each product's most recent movement.
 *
 * One aggregation for the whole page rather than a query per row: twenty rows
 * would otherwise be twenty round trips, which is the N+1 this console cannot
 * afford on its busiest screen. `$sort` then `$group`/`$first` is the standard
 * way to take the newest per group, and it is served by the
 * `{ product: 1, createdAt: -1 }` index the movement model declares.
 */
async function lastMovementsFor(
  productIds: Types.ObjectId[],
): Promise<Map<string, InventoryRow['lastMovement']>> {
  if (productIds.length === 0) return new Map();

  const rows = await InventoryMovement.aggregate<{
    _id: Types.ObjectId;
    type: MovementType;
    quantityChange: number;
    createdAt: Date;
    referenceLabel: string;
    reason: AdjustmentReason | null;
  }>([
    { $match: { product: { $in: productIds } } },
    { $sort: { product: 1, createdAt: -1 } },
    {
      $group: {
        _id: '$product',
        type: { $first: '$type' },
        quantityChange: { $first: '$quantityChange' },
        createdAt: { $first: '$createdAt' },
        referenceLabel: { $first: '$referenceLabel' },
        reason: { $first: '$reason' },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        type: row.type,
        quantityChange: row.quantityChange,
        createdAt: row.createdAt.toISOString(),
        summary: movementSummary(row.type, row.referenceLabel, row.reason),
      },
    ]),
  );
}

/** The one-line description of a movement, used by the list and the timeline. */
export function movementSummary(
  type: MovementType,
  referenceLabel: string,
  reason: AdjustmentReason | null,
): string {
  switch (type) {
    case 'SALE':
      return referenceLabel ? `Sold on ${referenceLabel}` : 'Sold';
    case 'CANCELLATION':
      return referenceLabel ? `Returned from ${referenceLabel}` : 'Order cancelled';
    /**
     * Phrased as a restock rather than as "returned", so it cannot be confused
     * with a cancellation on a timeline where both appear as a positive number.
     */
    case 'RETURN':
      return referenceLabel ? `Restocked from return ${referenceLabel}` : 'Restocked from a return';
    case 'INITIAL_STOCK':
      return 'Opening stock';
    case 'MANUAL_ADJUSTMENT':
      return reason ? humanReason(reason) : 'Manual adjustment';
  }
}

export async function listInventory(query: AdminInventoryQuery) {
  const filter: Record<string, unknown> = {};

  if (query.active !== undefined) filter.isActive = query.active;
  if (query.category) filter.category = new Types.ObjectId(query.category);
  if (query.brand) filter.brand = new Types.ObjectId(query.brand);

  if (query.status) Object.assign(filter, STOCK_FILTERS[query.status]);

  if (query.recentlyChanged) {
    filter._id = { $in: await recentlyChangedProductIds() };
  }

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: pattern }, { sku: pattern }, { slug: pattern }];
  }

  const [products, total] = await Promise.all([
    Product.find(filter)
      .select(LIST_FIELDS)
      .populate('category', 'name')
      .populate('brand', 'name')
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Product.countDocuments(filter),
  ]);

  const lastMovements = await lastMovementsFor(products.map((product) => product._id));

  const named = (value: unknown): string => (value as { name?: string } | null)?.name ?? '';

  const items: InventoryRow[] = products.map((product) => {
    const threshold = thresholdOf(product);
    const sizes = product.sizes ?? [];

    return {
      id: String(product._id),
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      image: product.images?.[0] ?? '',
      stock: product.stock,
      stockState: stockStateOf(product.stock, threshold),
      lowStockThreshold: threshold,
      usesDefaultThreshold: product.lowStockThreshold == null,
      isActive: product.isActive,
      category: named(product.category),
      brand: named(product.brand),
      sizes: { total: sizes.length, available: sizes.filter((size) => size.inStock).length },
      lastMovement: lastMovements.get(String(product._id)) ?? null,
    };
  });

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export interface MovementRow {
  id: string;
  product: { id: string; name: string; sku: string };
  variant: { color: string | null; size: string | null } | null;
  type: MovementType;
  quantityBefore: number;
  quantityChange: number;
  quantityAfter: number;
  reason: AdjustmentReason | null;
  note: string;
  summary: string;
  reference: { type: MovementReferenceType; id: string | null; label: string } | null;
  actor: { id: string | null; name: string } | null;
  createdAt: string;
}

type MovementLean = InventoryMovementDocument & { _id: Types.ObjectId };

function toMovementRow(movement: MovementLean): MovementRow {
  return {
    id: String(movement._id),
    product: {
      id: String(movement.product),
      name: movement.productName,
      sku: movement.sku ?? '',
    },
    variant: movement.variant
      ? { color: movement.variant.color ?? null, size: movement.variant.size ?? null }
      : null,
    type: movement.type,
    quantityBefore: movement.quantityBefore,
    quantityChange: movement.quantityChange,
    quantityAfter: movement.quantityAfter,
    reason: movement.reason ?? null,
    note: movement.note ?? '',
    summary: movementSummary(movement.type, movement.referenceLabel ?? '', movement.reason ?? null),
    reference: movement.referenceType
      ? {
          type: movement.referenceType,
          id: movement.referenceId ? String(movement.referenceId) : null,
          label: movement.referenceLabel ?? '',
        }
      : null,
    // Absent for a sale or a customer's own cancellation, which no member of
    // staff caused; the reference is how those are traced instead.
    actor: movement.actor ? { id: String(movement.actor), name: movement.actorName ?? '' } : null,
    createdAt: movement.createdAt.toISOString(),
  };
}

export interface InventoryDetail extends InventoryRow {
  price: number;
  /** Size availability, read-only here: ZyCart holds no per-size quantity. */
  variants: { label: string; inStock: boolean }[];
  colors: string[];
  movements: MovementRow[];
  /**
   * How many movements exist in total.
   *
   * The panel shows the newest few; this is what lets it say "and 40 older"
   * rather than silently truncating a ledger — a history that stops without
   * saying so is worse than no history, because it looks complete.
   */
  movementCount: number;
  /** Lifetime totals from the ledger, so the timeline has a summary above it. */
  totals: { soldUnits: number; restockedUnits: number; adjustments: number };
  /** Where the console asks for a second confirmation. */
  largeAdjustmentThreshold: number;
  updatedAt: string;
}

/** How much of a product's ledger the detail panel shows before paging. */
const DETAIL_MOVEMENTS = 20;

export async function getInventoryItem(productId: string): Promise<InventoryDetail> {
  const product = await Product.findById(productId)
    .select(`${LIST_FIELDS} price colors`)
    .populate('category', 'name')
    .populate('brand', 'name');

  if (!product) throw new AppError('Product not found', 404);

  const [movements, movementCount, totals] = await Promise.all([
    InventoryMovement.find({ product: product._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(DETAIL_MOVEMENTS)
      .lean<MovementLean[]>(),
    InventoryMovement.countDocuments({ product: product._id }),
    movementTotals(product._id),
  ]);

  const threshold = thresholdOf(product);
  const sizes = product.sizes ?? [];
  const named = (value: unknown): string => (value as { name?: string } | null)?.name ?? '';

  return {
    id: String(product._id),
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    image: product.images?.[0] ?? '',
    stock: product.stock,
    stockState: stockStateOf(product.stock, threshold),
    lowStockThreshold: threshold,
    usesDefaultThreshold: product.lowStockThreshold == null,
    isActive: product.isActive,
    category: named(product.category),
    brand: named(product.brand),
    sizes: { total: sizes.length, available: sizes.filter((size) => size.inStock).length },
    lastMovement: movements[0]
      ? {
          type: movements[0].type,
          quantityChange: movements[0].quantityChange,
          createdAt: movements[0].createdAt.toISOString(),
          summary: movementSummary(
            movements[0].type,
            movements[0].referenceLabel ?? '',
            movements[0].reason ?? null,
          ),
        }
      : null,
    price: product.price,
    variants: sizes.map((size) => ({ label: size.label, inStock: size.inStock !== false })),
    colors: (product.colors ?? []).map((color) => color.name),
    movements: movements.map(toMovementRow),
    movementCount,
    totals,
    largeAdjustmentThreshold: LARGE_ADJUSTMENT,
    updatedAt: product.updatedAt.toISOString(),
  };
}

/**
 * Lifetime units in and out for one product, from the ledger.
 *
 * Counted from movements rather than from orders, deliberately: the ledger is
 * the record of what happened to *stock*, and a figure derived from orders
 * would quietly disagree with the timeline printed underneath it.
 */
async function movementTotals(product: Types.ObjectId) {
  const rows = await InventoryMovement.aggregate<{
    _id: MovementType;
    units: number;
    count: number;
  }>([
    { $match: { product } },
    { $group: { _id: '$type', units: { $sum: '$quantityChange' }, count: { $sum: 1 } } },
  ]);

  const by = new Map(rows.map((row) => [row._id, row]));

  return {
    soldUnits: Math.abs(by.get('SALE')?.units ?? 0),
    restockedUnits: Math.max(0, by.get('MANUAL_ADJUSTMENT')?.units ?? 0),
    adjustments: by.get('MANUAL_ADJUSTMENT')?.count ?? 0,
  };
}

export async function listMovements(query: {
  page: number;
  limit: number;
  product?: string;
  type?: MovementType;
}) {
  const filter: Record<string, unknown> = {};

  if (query.product) filter.product = new Types.ObjectId(query.product);
  if (query.type) filter.type = query.type;

  const [movements, total] = await Promise.all([
    InventoryMovement.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<MovementLean[]>(),
    InventoryMovement.countDocuments(filter),
  ]);

  return {
    items: movements.map(toMovementRow),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export interface InventorySummary {
  products: number;
  activeProducts: number;
  /** Every sellable unit in the catalogue, active products only. */
  sellableUnits: number;
  outOfStock: number;
  lowStock: number;
  healthy: number;
  /** Ledger activity over the last week, so "quiet" and "busy" are visible. */
  recentMovements: number;
  recentAdjustments: number;
  defaultThreshold: number;
  /** Where the console asks twice, so the listing does not hardcode it either. */
  largeAdjustmentThreshold: number;
}

/**
 * The inventory dashboard's figures.
 *
 * All six counts run concurrently and each returns a number rather than a page
 * of documents. `sellableUnits` is scoped to active products on purpose: units
 * sitting against a deactivated product are not sellable, and counting them
 * would overstate what the shop can actually ship.
 */
export async function getInventorySummary(): Promise<InventorySummary> {
  const activeOnly = { isActive: true };
  const since = startOfDaysAgo(RECENTLY_CHANGED_DAYS);

  const [
    products,
    activeProducts,
    units,
    outOfStock,
    lowStock,
    recentMovements,
    recentAdjustments,
  ] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments(activeOnly),
    Product.aggregate<{ total: number }>([
      { $match: activeOnly },
      { $group: { _id: null, total: { $sum: '$stock' } } },
    ]),
    Product.countDocuments({ ...activeOnly, ...STOCK_FILTERS.out_of_stock }),
    Product.countDocuments({ ...activeOnly, ...STOCK_FILTERS.low_stock }),
    InventoryMovement.countDocuments({ createdAt: { $gte: since } }),
    InventoryMovement.countDocuments({
      type: 'MANUAL_ADJUSTMENT',
      createdAt: { $gte: since },
    }),
  ]);

  return {
    products,
    activeProducts,
    sellableUnits: units[0]?.total ?? 0,
    outOfStock,
    lowStock,
    healthy: Math.max(0, activeProducts - outOfStock - lowStock),
    recentMovements,
    recentAdjustments,
    defaultThreshold: LOW_STOCK_THRESHOLD,
    largeAdjustmentThreshold: LARGE_ADJUSTMENT,
  };
}
