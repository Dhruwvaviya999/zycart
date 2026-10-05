import type { ProductSummary, ProductVariant } from '@/types/product';

/**
 * Stock per colour and size, as the storefront reads it (Phase 20).
 *
 * A product either holds one count for everything it sells, or lists
 * `variants`, each a colour-and-size pair with its own count. These helpers
 * are the storefront's half of that rule, and they mirror
 * `backend/src/services/inventory/variant-stock.ts` deliberately: the API
 * decides what can be bought, and a picker that disagreed with it would offer
 * a size the cart then refuses. Change one and change the other.
 *
 * Everything here is pure and takes the narrowest shape it needs, so the
 * product page, quick add and the picker can all ask the same question of
 * whatever they happen to hold.
 */

/** A colour or size as the API stores it: absent, `null` and blank all mean "none". */
type Option = string | null | undefined;

/** What a customer chose, in the vocabulary cart lines and alerts share. */
export interface VariantChoice {
  color?: Option;
  size?: Option;
}

/** The fields of a product these helpers read. Structural, so a summary or a detail both fit. */
type StockShape = Pick<ProductSummary, 'stock' | 'variants'>;
type OptionShape = Pick<ProductSummary, 'colors' | 'sizes'>;
type SizeShape = Pick<ProductSummary, 'sizes' | 'variants'>;

/**
 * How an option looks from where the customer is standing.
 *
 * `not-sold` exists only on a product that tracks variants: the pair the
 * option would make with the other axis's choice is not one the shop sells at
 * all, which is a different answer from "sold out" — nothing will ever come
 * back in stock, so there is nothing to wait for.
 */
export type OptionAvailability = 'available' | 'sold-out' | 'not-sold';

const normal = (value: Option): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
};

/** Two options are the same option when they are equal after trimming, or both absent. */
export const sameOption = (a: Option, b: Option): boolean => normal(a) === normal(b);

/** Whether a product holds its stock per variant rather than as one count. */
export function tracksVariants(product: Pick<ProductSummary, 'variants'>): boolean {
  return (product.variants?.length ?? 0) > 0;
}

/**
 * The variant a choice names, or null when the product sells no such
 * combination.
 *
 * Exact on both axes, as on the server: a product with colours and sizes needs
 * both, and a sizes-only product's variants carry a `null` colour, so a choice
 * with no colour is the one that matches.
 */
export function findVariant(
  variants: readonly ProductVariant[] | null | undefined,
  choice: VariantChoice | null | undefined,
): ProductVariant | null {
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
 * How many of this exact choice can be sold right now.
 *
 * The variant's own count on a product that tracks them — zero when the
 * combination is not sold — and the product's count otherwise. The same
 * answer the cart gives, which is the point.
 */
export function sellableQuantity(
  product: StockShape,
  choice: VariantChoice | null | undefined,
): number {
  if (!tracksVariants(product)) return Math.max(0, product.stock);
  return Math.max(0, findVariant(product.variants, choice)?.stock ?? 0);
}

/**
 * Whether every axis the product has been chosen on.
 *
 * Until it is, a variant product has not named a variant, and the only honest
 * stock figure is one about the options so far — see `selectionStock`.
 */
export function isChoiceComplete(product: OptionShape, color?: Option, size?: Option): boolean {
  return (
    (product.colors.length === 0 || normal(color) !== null) &&
    (product.sizes.length === 0 || normal(size) !== null)
  );
}

/**
 * How many units the customer's selection, as far as it goes, could buy.
 *
 * - On a product that tracks variants, the units of every variant consistent
 *   with what has been chosen. With nothing chosen that is the whole product;
 *   with both axes chosen it is exactly `sellableQuantity`; with only a colour
 *   it is everything in that colour, which is what lets the page say "out of
 *   stock" the moment a colour with nothing left is picked.
 * - On a product that holds one count, that count — unless the chosen size is
 *   marked sold out, the one per-size fact such a product has.
 *
 * This drives the stock pill, the low-stock note and the quantity cap. The
 * cart is still the authority: it re-checks the variant on every add.
 */
export function selectionStock(
  product: StockShape & SizeShape,
  choice: VariantChoice | null | undefined,
): number {
  const color = normal(choice?.color);
  const size = normal(choice?.size);

  if (!tracksVariants(product)) {
    if (product.stock <= 0) return 0;
    if (size && product.sizes.find((entry) => sameOption(entry.label, size))?.inStock === false) {
      return 0;
    }
    return product.stock;
  }

  return (product.variants ?? [])
    .filter(
      (variant) =>
        (color === null || sameOption(variant.color, color)) &&
        (size === null || sameOption(variant.size, size)),
    )
    .reduce((total, variant) => total + Math.max(0, variant.stock), 0);
}

/**
 * The shared half of `colorAvailability` and `sizeAvailability`: the variants
 * that carry this option and agree with the other axis's choice, if any.
 */
function optionAvailability(matching: readonly ProductVariant[]): OptionAvailability {
  if (matching.length === 0) return 'not-sold';
  return matching.some((variant) => variant.stock > 0) ? 'available' : 'sold-out';
}

/**
 * A colour, judged against the size already chosen (if any).
 *
 * On a product with one count a colour carries no availability of its own —
 * it never has — so it is always offered, exactly as before.
 */
export function colorAvailability(
  product: SizeShape,
  color: string,
  size?: Option,
): OptionAvailability {
  if (!tracksVariants(product)) return 'available';

  const chosenSize = normal(size);
  return optionAvailability(
    (product.variants ?? []).filter(
      (variant) =>
        sameOption(variant.color, color) &&
        (chosenSize === null || sameOption(variant.size, chosenSize)),
    ),
  );
}

/**
 * A size, judged against the colour already chosen (if any).
 *
 * On a product with one count this is the `inStock` flag an operator typed,
 * which is all the picker ever knew about a size before variants existed.
 */
export function sizeAvailability(
  product: SizeShape,
  size: string,
  color?: Option,
): OptionAvailability {
  if (!tracksVariants(product)) {
    const entry = product.sizes.find((option) => sameOption(option.label, size));
    return entry && !entry.inStock ? 'sold-out' : 'available';
  }

  const chosenColor = normal(color);
  return optionAvailability(
    (product.variants ?? []).filter(
      (variant) =>
        sameOption(variant.size, size) &&
        (chosenColor === null || sameOption(variant.color, chosenColor)),
    ),
  );
}

/** Whether some unit in this colour — and the chosen size, if one is — can be bought. */
export const colorHasStock = (product: SizeShape, color: string, size?: Option): boolean =>
  colorAvailability(product, color, size) === 'available';

/** Whether some unit in this size — and the chosen colour, if one is — can be bought. */
export const sizeHasStock = (product: SizeShape, size: string, color?: Option): boolean =>
  sizeAvailability(product, size, color) === 'available';
