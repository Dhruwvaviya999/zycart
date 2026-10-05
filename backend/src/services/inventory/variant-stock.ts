import type mongoose from 'mongoose';
import { Types } from 'mongoose';
import { MAX_VARIANTS, MAX_VARIANT_SKU_LENGTH, Product } from '../../models/product.model';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';

/**
 * Stock per colour and size (Phase 20).
 *
 * ## The model in one paragraph
 *
 * A product either holds one count for everything it sells — every product
 * before this phase — or it lists `variants`, each a `(color, size)` pair with
 * its own count. In the second case `Product.stock` is still there and still
 * means "how many can this shop sell": it is the sum of the variants, and every
 * write moves the sum and the one variant in a single atomic update. That is
 * why the listing filters, the low-stock panel, the dashboard and the cards did
 * not need to change at all.
 *
 * ## Why a variant is found by its pair, not its id
 *
 * A cart line, an order line and a return line each already record the colour
 * and size the customer chose, and have done since Phase 5. Matching on that
 * pair means none of them needed a new field, an order placed before a product
 * was split into variants still finds its variant when it is cancelled, and a
 * customer's request can never name a variant id the server did not offer.
 * The console, which edits rows of a table, uses the id instead.
 *
 * ## The one writer
 *
 * `writeStock` below is the only code that changes `stock` or a variant's
 * count. The five paths Phase 12 and 13 named — sale, cancellation, opening
 * stock, adjustment, restock from a return — each call it inside their own
 * transaction and record the movement it describes. The ledger is therefore
 * exactly as complete as it was, and now says which variant moved.
 */

/** A colour or size as stored: absent and `null` mean the same thing. */
type Option = string | null | undefined;

/** What a customer chose, in the vocabulary cart, order and return lines share. */
export interface VariantChoice {
  color?: Option;
  size?: Option;
}

/** The fields of a stored variant this module reads. Structural, so lean rows and documents both fit. */
export interface VariantLike {
  _id?: unknown;
  color?: Option;
  size?: Option;
  sku?: string | null;
  stock: number;
}

const normal = (value: Option): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
};

/** Two options are the same option when they are equal after trimming, or both absent. */
export const sameOption = (a: Option, b: Option): boolean => normal(a) === normal(b);

/** Whether a product holds its stock per variant rather than as one count. */
export function tracksVariants(product: { variants?: readonly unknown[] | null }): boolean {
  return (product.variants?.length ?? 0) > 0;
}

/**
 * The variant a customer's choice names, or null when the product sells no
 * such combination.
 *
 * Exact on both axes. A product with colours and sizes needs both chosen; a
 * product with only sizes has `null` colours on every variant, so a choice
 * with no colour matches and a choice *with* one does not — a crafted request
 * cannot reach a variant by naming an axis the product does not have.
 */
export function findVariant<V extends VariantLike>(
  variants: readonly V[] | null | undefined,
  choice: VariantChoice | null | undefined,
): V | null {
  if (!variants || variants.length === 0) return null;

  return (
    variants.find(
      (variant) =>
        sameOption(variant.color, choice?.color) && sameOption(variant.size, choice?.size),
    ) ?? null
  );
}

/** `Black · Size 9`, `Size M`, `Black`, or empty — the way every screen names a variant. */
export function variantLabel(choice: VariantChoice | null | undefined): string {
  const color = normal(choice?.color);
  const size = normal(choice?.size);

  return [color, size ? `Size ${size}` : null].filter(Boolean).join(' · ');
}

/**
 * How many of this choice can be sold right now.
 *
 * The variant's own count on a product that tracks them — zero when the
 * combination is not sold — and the product's count otherwise. The cart, the
 * checkout and the alerts all ask this question, and this is the one answer.
 */
export function sellableQuantity(
  product: { stock: number; variants?: readonly VariantLike[] | null },
  choice: VariantChoice | null | undefined,
): number {
  if (!tracksVariants(product)) return Math.max(0, product.stock);
  return Math.max(0, findVariant(product.variants, choice)?.stock ?? 0);
}

const SKU_PART = /[^A-Z0-9]+/g;

/**
 * A variant's SKU when the operator did not give one: the product's own, then
 * the colour, then the size, in upper case with anything else turned into a
 * hyphen. `ZY-RUN-01` in Triple Black, size 9 becomes `ZY-RUN-01-TRIPLE-BLACK-9`.
 *
 * Deterministic, so saving the same form twice produces the same SKUs, and
 * bounded, so a long colourway name cannot produce an unstorable one.
 */
export function defaultVariantSku(productSku: string, choice: VariantChoice): string {
  const part = (value: Option): string =>
    (normal(value) ?? '')
      .toUpperCase()
      .replace(SKU_PART, '-')
      .replace(/^-+|-+$/g, '');

  return [productSku.toUpperCase(), part(choice.color), part(choice.size)]
    .filter(Boolean)
    .join('-')
    .slice(0, MAX_VARIANT_SKU_LENGTH);
}

/**
 * The size list with `inStock` derived from the variants.
 *
 * A size is in stock exactly when some variant of that size has units. On a
 * product that does not track variants the flags are kept as they are, because
 * there `inStock` is still something an operator states.
 *
 * Always returns plain `{ label, inStock }` objects, never the entries it was
 * given. Those are often Mongoose subdocuments, and a spread copy of one
 * carries its internal `_doc` — which Mongoose then prefers over the field
 * written beside it, so a `$set` built from a spread silently writes back the
 * old flag.
 */
export function deriveSizeAvailability(
  sizes: readonly { label: string; inStock?: boolean | null }[],
  variants: readonly VariantLike[] | null | undefined,
): { label: string; inStock: boolean }[] {
  if (!variants || variants.length === 0) {
    return sizes.map((size) => ({ label: size.label, inStock: size.inStock !== false }));
  }

  return sizes.map((size) => ({
    label: size.label,
    inStock: variants.some((variant) => sameOption(variant.size, size.label) && variant.stock > 0),
  }));
}

/** Whether `deriveSizeAvailability` would change anything — so a write is skipped when it would not. */
export function sizeAvailabilityChanged(
  sizes: readonly { label: string; inStock?: boolean | null }[],
  variants: readonly VariantLike[] | null | undefined,
): boolean {
  const derived = deriveSizeAvailability(sizes, variants);
  return derived.some((size, index) => (sizes[index]?.inStock ?? true) !== size.inStock);
}

/**
 * Refuses a variant list that does not fit the product's own options.
 *
 * Four rules, each a way a catalogue could otherwise offer something it
 * cannot describe:
 *
 * - an axis the product has must be named on every variant, and an axis it
 *   lacks must be named on none — otherwise `findVariant` could not match a
 *   customer's choice against it;
 * - a named colour or size must be one the product lists, so the picker can
 *   draw it;
 * - a pair may appear once, or two rows would hold stock for the same thing;
 * - SKUs are distinct within the product, or the console could not tell two
 *   rows apart in the ledger.
 */
export function assertVariantShape(
  variants: readonly { color?: Option; size?: Option; sku?: Option }[],
  axes: { colors: readonly string[]; sizes: readonly string[] },
): void {
  if (variants.length > MAX_VARIANTS) {
    throw new AppError(`A product can have at most ${MAX_VARIANTS} variants`, 400);
  }

  const seenPairs = new Set<string>();
  const seenSkus = new Set<string>();

  for (const variant of variants) {
    const color = normal(variant.color);
    const size = normal(variant.size);

    if (axes.colors.length > 0 && !color) {
      throw new AppError('Every variant must name a colour, because the product has colours', 400);
    }
    if (axes.colors.length === 0 && color) {
      throw new AppError(`"${color}" is not a colour this product has`, 400);
    }
    if (color && !axes.colors.some((name) => sameOption(name, color))) {
      throw new AppError(`"${color}" is not a colour this product has`, 400);
    }

    if (axes.sizes.length > 0 && !size) {
      throw new AppError('Every variant must name a size, because the product has sizes', 400);
    }
    if (axes.sizes.length === 0 && size) {
      throw new AppError(`"${size}" is not a size this product has`, 400);
    }
    if (size && !axes.sizes.some((label) => sameOption(label, size))) {
      throw new AppError(`"${size}" is not a size this product has`, 400);
    }

    if (!color && !size) {
      throw new AppError('A variant must name a colour, a size or both', 400);
    }

    const pair = `${color ?? ''}::${size ?? ''}`;
    if (seenPairs.has(pair)) {
      throw new AppError(`${variantLabel({ color, size })} is listed twice`, 400);
    }
    seenPairs.add(pair);

    const sku = normal(variant.sku)?.toUpperCase();
    if (sku) {
      if (seenSkus.has(sku)) throw new AppError(`Variant SKU ${sku} is used twice`, 400);
      seenSkus.add(sku);
    }
  }
}

/* ---------------------------------------------------------------- */
/* Planning the variant list                                         */
/* ---------------------------------------------------------------- */

/** A variant as the console describes it: which combination, and optionally its SKU and count. */
export interface VariantDraft {
  color?: Option;
  size?: Option;
  sku?: string | null;
  stock?: number | null;
}

/** A variant ready to store. `_id` is present for one that already existed. */
export interface PlannedVariant {
  _id?: Types.ObjectId;
  color: string | null;
  size: string | null;
  sku: string;
  stock: number;
}

export interface VariantAxes {
  colors: readonly string[];
  sizes: readonly string[];
}

const pairKey = (choice: VariantChoice): string =>
  `${normal(choice.color) ?? ''}::${normal(choice.size) ?? ''}`;

function assertDistinctSkus(variants: readonly PlannedVariant[]): void {
  const seen = new Set<string>();

  for (const variant of variants) {
    if (seen.has(variant.sku)) {
      throw new AppError(
        `Variant SKU ${variant.sku} is used twice. Give one of them its own SKU.`,
        400,
      );
    }
    seen.add(variant.sku);
  }
}

function draftSku(draft: VariantDraft, productSku: string): string {
  return normal(draft.sku)?.toUpperCase() ?? defaultVariantSku(productSku, draft);
}

/**
 * The variants a new product is created with, opening counts and all.
 *
 * Pure, so the rules a form is checked against can be tested without a
 * database: the shape rules in `assertVariantShape`, SKUs filled in where the
 * operator left them blank, and distinct once they have been.
 */
export function planNewVariants(
  drafts: readonly VariantDraft[],
  productSku: string,
  axes: VariantAxes,
): PlannedVariant[] {
  assertVariantShape(drafts, axes);

  const planned = drafts.map((draft) => ({
    color: normal(draft.color),
    size: normal(draft.size),
    sku: draftSku(draft, productSku),
    stock: draft.stock ?? 0,
  }));

  assertDistinctSkus(planned);
  return planned;
}

export interface VariantEditPlan {
  variants: PlannedVariant[];
  /** A product that held one count is being divided among variants. */
  split: boolean;
  /** Every variant is being removed: the product goes back to one count, its total unchanged. */
  merged: boolean;
  added: string[];
  removed: string[];
}

/**
 * What saving the product form does to an existing variant list.
 *
 * ## The rule every branch follows
 *
 * Editing the form never moves a unit. Units move through the inventory
 * console's adjustments, which carry a reason and write the ledger — so this
 * function refuses anything that would make the total change silently:
 *
 * - **Split** (the product held one count): the opening counts must add up to
 *   exactly what it holds. Nothing is created or destroyed; one bucket becomes
 *   several.
 * - **Merge** (every variant removed): the product keeps the total it already
 *   holds, as one count. Again nothing moves.
 * - **Edit** (variants before and after): an existing combination keeps its
 *   count; a new one starts at zero and is restocked from the console; a
 *   combination can be removed only once it holds nothing, because its units
 *   would otherwise vanish from a total that still counts them.
 *
 * A combination is "existing" when its colour and size match, so renaming a
 * colour is a removal and an addition — which is right, since a pair of shoes
 * in "Black" does not become a pair in "Midnight" because a label changed.
 */
export function planVariantEdit(params: {
  existing: readonly (VariantLike & { _id: Types.ObjectId; sku: string })[];
  existingStock: number;
  drafts: readonly VariantDraft[];
  productSku: string;
  axes: VariantAxes;
}): VariantEditPlan {
  const { existing, existingStock, drafts, productSku, axes } = params;

  assertVariantShape(drafts, axes);

  if (existing.length === 0) {
    if (drafts.length === 0) {
      return { variants: [], split: false, merged: false, added: [], removed: [] };
    }

    const planned = planNewVariants(drafts, productSku, axes);
    const total = planned.reduce((sum, variant) => sum + variant.stock, 0);

    if (total !== existingStock) {
      throw new AppError(
        `The variant counts add up to ${total}, but the product holds ${existingStock}. ` +
          'Divide exactly what it holds — restock or correct the total from the inventory ' +
          'console afterwards.',
        400,
      );
    }

    return {
      variants: planned,
      split: true,
      merged: false,
      added: planned.map((variant) => variantLabel(variant)),
      removed: [],
    };
  }

  const byPair = new Map(existing.map((variant) => [pairKey(variant), variant]));
  const kept = new Set<string>();
  const added: string[] = [];

  const variants: PlannedVariant[] = drafts.map((draft) => {
    const key = pairKey(draft);
    const current = byPair.get(key);

    if (current) {
      kept.add(key);

      if (draft.stock != null && draft.stock !== current.stock) {
        throw new AppError(
          `${variantLabel(draft)} holds ${current.stock}. Counts change through the inventory ` +
            'console, where each change is recorded with a reason.',
          400,
        );
      }

      return {
        _id: current._id,
        color: normal(current.color),
        size: normal(current.size),
        sku: normal(draft.sku)?.toUpperCase() ?? current.sku,
        stock: current.stock,
      };
    }

    if (draft.stock) {
      throw new AppError(
        `${variantLabel(draft)} is new, so it starts at zero. Restock it from the inventory ` +
          'console once it is saved.',
        400,
      );
    }

    added.push(variantLabel(draft));

    return {
      color: normal(draft.color),
      size: normal(draft.size),
      sku: draftSku(draft, productSku),
      stock: 0,
    };
  });

  const removed: string[] = [];

  for (const variant of existing) {
    if (kept.has(pairKey(variant))) continue;

    // Removing every variant is a merge, which keeps the total; removing some
    // of them would drop their units from a total that still counts them.
    if (drafts.length > 0 && variant.stock > 0) {
      throw new AppError(
        `${variantLabel(variant)} still holds ${variant.stock}. Adjust it to zero from the ` +
          'inventory console before removing it.',
        409,
      );
    }

    removed.push(variantLabel(variant));
  }

  assertDistinctSkus(variants);

  return { variants, split: false, merged: drafts.length === 0, added, removed };
}

/* ---------------------------------------------------------------- */
/* The writer                                                        */
/* ---------------------------------------------------------------- */

export interface StockWrite {
  product: Types.ObjectId | string;
  /**
   * Which variant, by the customer's choice. Ignored for a product that does
   * not track variants, where the colour and size are context only.
   */
  choice?: VariantChoice | null;
  /** Which variant, by the console's handle. Takes precedence over `choice`. */
  variantId?: string | null;
  quantityChange: number;
  /** Refuse a deactivated product. Checkout asks for this; restoring stock does not. */
  requireActive?: boolean;
  /**
   * The count the caller believes is current — the variant's, when there is
   * one — joined into the atomic filter. Only a recount sends it.
   */
  expectedStock?: number;
}

/** What a movement records about the variant it changed. */
export interface MovementVariant {
  color: string | null;
  size: string | null;
  sku: string | null;
  quantityBefore: number | null;
  quantityAfter: number | null;
}

export type StockWriteOutcome =
  | {
      status: 'applied';
      product: {
        _id: Types.ObjectId;
        name: string;
        sku: string;
        lowStockThreshold?: number | null;
      };
      /** The product's total either side of the write. */
      quantityBefore: number;
      quantityAfter: number;
      /** The variant that moved, or null for a product without variants. */
      variant: MovementVariant | null;
    }
  /** Deleted — or deactivated, when the write asked for an active product. */
  | { status: 'missing_product' }
  /** The product tracks variants, and this one is not among them. */
  | { status: 'missing_variant'; productName: string }
  /** A decrease larger than what is there. `available` is the relevant count. */
  | { status: 'insufficient'; productName: string; available: number }
  /** `expectedStock` did not match. `current` is the relevant count. */
  | { status: 'stale'; productName: string; current: number };

const WRITE_FIELDS = 'name sku stock lowStockThreshold isActive sizes variants';

/**
 * The stock condition a filter carries, as a pure function.
 *
 * A decrease needs a floor at least as large as itself — that is the whole
 * concurrency guarantee, the same one Phase 6 built checkout on — and a recount
 * pins the exact current value. A pure increase needs nothing.
 */
export function stockCondition(
  quantityChange: number,
  expectedStock?: number,
): Record<string, number> | null {
  const condition: Record<string, number> = {};

  if (quantityChange < 0) condition.$gte = -quantityChange;
  if (expectedStock !== undefined) condition.$eq = expectedStock;

  return Object.keys(condition).length > 0 ? condition : null;
}

/**
 * The filter for one write, as a pure function, so its guards can be asserted
 * without a database.
 *
 * For a product without variants it also requires that the product *still*
 * has none: a product split into variants between the caller's read and this
 * write must not have its total moved behind its variants' backs. For a
 * variant, the stock condition sits inside `$elemMatch`, so it applies to that
 * variant's own count and to no other.
 */
export function stockWriteFilter(params: {
  productId: Types.ObjectId;
  variantId: Types.ObjectId | null;
  quantityChange: number;
  expectedStock?: number;
  requireActive?: boolean;
}): Record<string, unknown> {
  const condition = stockCondition(params.quantityChange, params.expectedStock);
  const filter: Record<string, unknown> = { _id: params.productId };

  if (params.requireActive) filter.isActive = true;

  if (params.variantId === null) {
    filter['variants.0'] = { $exists: false };
    if (condition) filter.stock = condition;
  } else {
    filter.variants = {
      $elemMatch: { _id: params.variantId, ...(condition ? { stock: condition } : {}) },
    };
  }

  return filter;
}

/**
 * Applies one signed change to a product's stock — and, when it tracks
 * variants, to the one variant the change belongs to — inside the caller's
 * transaction.
 *
 * ## Why it reads first
 *
 * Whether the write is a product-level `$inc` or a variant-level one depends on
 * what the product is, so the product is read before the write. The read is not
 * the guard: every condition that matters is repeated in the filter of the
 * atomic update, so a product that changed shape or ran out between the two is
 * caught by the update matching nothing. One indexed read by `_id` per line is
 * the cost, and it buys a write that cannot be aimed at the wrong bucket.
 *
 * ## Why a refusal is a value, not an exception
 *
 * Checkout turns "not enough" into "sold out while you were checking out";
 * cancelling an order turns "variant no longer sold" into "skip it, the order
 * keeps its snapshot"; the console turns "stale" into "refresh and count
 * again". Each caller knows its own words, so this returns what happened and
 * lets them say it.
 */
export async function writeStock(
  write: StockWrite,
  session: mongoose.ClientSession,
): Promise<StockWriteOutcome> {
  const productId = new Types.ObjectId(String(write.product));

  const shape = await Product.findById(productId).select(WRITE_FIELDS).session(session);

  if (!shape || (write.requireActive && !shape.isActive)) return { status: 'missing_product' };

  const variants = shape.variants ?? [];
  let variantId: Types.ObjectId | null = null;

  if (variants.length > 0) {
    const target = write.variantId
      ? variants.find((variant) => String(variant._id) === write.variantId)
      : findVariant(variants, write.choice);

    if (!target) return { status: 'missing_variant', productName: shape.name };
    variantId = target._id;
  } else if (write.variantId) {
    // The console named a variant on a product that holds one count.
    return { status: 'missing_variant', productName: shape.name };
  }

  const filter = stockWriteFilter({
    productId,
    variantId,
    quantityChange: write.quantityChange,
    expectedStock: write.expectedStock,
    requireActive: write.requireActive,
  });

  const updated = await Product.findOneAndUpdate(
    filter,
    variantId
      ? { $inc: { stock: write.quantityChange, 'variants.$[target].stock': write.quantityChange } }
      : { $inc: { stock: write.quantityChange } },
    {
      session,
      returnDocument: 'after',
      ...(variantId ? { arrayFilters: [{ 'target._id': variantId }] } : {}),
    },
  ).select(WRITE_FIELDS);

  if (!updated) return refusal(productId, variantId, write, session);

  const quantityAfter = updated.stock;
  const quantityBefore = quantityAfter - write.quantityChange;

  if (!variantId) {
    return {
      status: 'applied',
      product: updated,
      quantityBefore,
      quantityAfter,
      variant: null,
    };
  }

  const moved = updated.variants.find((variant) => String(variant._id) === String(variantId));

  /**
   * Size availability follows the counts, in the same transaction.
   *
   * The transaction already holds this product's document for the write above,
   * so nothing can slip between the two updates.
   */
  if (sizeAvailabilityChanged(updated.sizes, updated.variants)) {
    await Product.updateOne(
      { _id: productId },
      { $set: { sizes: deriveSizeAvailability(updated.sizes, updated.variants) } },
      { session },
    );
  }

  return {
    status: 'applied',
    product: updated,
    quantityBefore,
    quantityAfter,
    variant: {
      color: moved?.color ?? null,
      size: moved?.size ?? null,
      sku: moved?.sku ?? null,
      quantityBefore: moved ? moved.stock - write.quantityChange : null,
      quantityAfter: moved ? moved.stock : null,
    },
  };
}

/**
 * Says why the update matched nothing, read inside the same transaction.
 *
 * Reached only on the failure path, so the normal case pays nothing for it.
 */
async function refusal(
  productId: Types.ObjectId,
  variantId: Types.ObjectId | null,
  write: StockWrite,
  session: mongoose.ClientSession,
): Promise<StockWriteOutcome> {
  const current = await Product.findById(productId)
    .select('name stock isActive variants')
    .session(session);

  if (!current || (write.requireActive && !current.isActive)) return { status: 'missing_product' };

  const variants = current.variants ?? [];

  // The product changed shape under the write: split into variants, or a
  // variant removed. Either way the bucket the caller meant is gone.
  if ((variantId === null) !== (variants.length === 0)) {
    return { status: 'missing_variant', productName: current.name };
  }

  let count = current.stock;

  if (variantId) {
    const variant = variants.find((entry) => String(entry._id) === String(variantId));
    if (!variant) return { status: 'missing_variant', productName: current.name };
    count = variant.stock;
  }

  if (write.expectedStock !== undefined && count !== write.expectedStock) {
    return { status: 'stale', productName: current.name, current: count };
  }

  return { status: 'insufficient', productName: current.name, available: count };
}

/**
 * The `variant` a movement records for a write that was applied.
 *
 * The variant's own counts when one moved; otherwise the line's colour and
 * size as context, or nothing when there was no line — the Phase 12 shape,
 * unchanged.
 */
export function movementVariantOf(
  applied: Extract<StockWriteOutcome, { status: 'applied' }>,
  choice?: VariantChoice | null,
): MovementVariant | { color: string | null; size: string | null } | null {
  if (applied.variant) return applied.variant;
  if (!choice) return null;
  return { color: normal(choice.color), size: normal(choice.size) };
}

/**
 * Logged when stock that should come back has nowhere to go.
 *
 * A cancellation or a resellable return for a variant the operator has since
 * removed. Not an error — the order and the return keep their own snapshots —
 * but an operator reconciling counts would want to know units were not put
 * back, and why.
 */
export function logUnrestorable(context: {
  reason: 'variant_removed' | 'product_removed';
  productId: string;
  reference: string;
  choice: VariantChoice | null;
  quantity: number;
}): void {
  logger.warn('inventory_not_restored', {
    reason: context.reason,
    productId: context.productId,
    reference: context.reference,
    variant: variantLabel(context.choice),
    quantity: context.quantity,
  });
}
