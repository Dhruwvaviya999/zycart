/**
 * How the console names a colour-and-size variant (Phase 20).
 *
 * Copies of two small rules in the backend's `variant-stock.ts`, kept here so
 * the product form can label a row and preview a SKU before anything has been
 * saved. The server remains the authority: the inventory page shows the label
 * it sends, and a SKU the form previews is only ever a placeholder — leaving the
 * field blank is what asks the server to derive one.
 *
 * Deliberately local to the console rather than shared with the storefront.
 * The shop words variants for customers and may change how; the console needs
 * the exact wording the server writes into the ledger and the audit log.
 */

type Option = string | null | undefined;

const normal = (value: Option): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
};

/** `Black · Size 9`, `Size M`, `Black`, or empty when neither is named. */
export function variantLabel(choice: { color?: Option; size?: Option } | null | undefined): string {
  const color = normal(choice?.color);
  const size = normal(choice?.size);

  return [color, size ? `Size ${size}` : null].filter(Boolean).join(' · ');
}

/** The longest variant SKU the server accepts. Matches `MAX_VARIANT_SKU_LENGTH`. */
export const MAX_VARIANT_SKU_LENGTH = 64;

/** The most variants one product may carry. Matches `MAX_VARIANTS`. */
export const MAX_VARIANTS = 120;

const SKU_PART = /[^A-Z0-9]+/g;

/**
 * The SKU the server will give a variant whose SKU is left blank:
 * `ZY-RUN-01` in Triple Black, size 9 becomes `ZY-RUN-01-TRIPLE-BLACK-9`.
 *
 * Shown as a placeholder, so an operator can see what they will get without
 * having to type it — and can tell when two rows would collide.
 */
export function defaultVariantSku(
  productSku: string,
  choice: { color?: Option; size?: Option },
): string {
  const part = (value: Option): string =>
    (normal(value) ?? '')
      .toUpperCase()
      .replace(SKU_PART, '-')
      .replace(/^-+|-+$/g, '');

  return [productSku.trim().toUpperCase(), part(choice.color), part(choice.size)]
    .filter(Boolean)
    .join('-')
    .slice(0, MAX_VARIANT_SKU_LENGTH);
}

/**
 * The key a variant is matched by: its colour and size, as the server pairs
 * them. Two rows with the same key are the same combination, whatever their
 * ids or SKUs say.
 */
export const pairKey = (choice: { color?: Option; size?: Option }): string =>
  `${normal(choice.color) ?? ''}::${normal(choice.size) ?? ''}`;
