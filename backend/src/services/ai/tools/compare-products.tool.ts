import { z } from 'zod';
import { AI_LIMITS } from '../../../config/ai';
import * as productService from '../../product.service';
import { objectIdSchema } from '../../../validators/common';
import { defineTool } from './types';
import {
  remember,
  toProductDetailView,
  type AiProductDetailView,
  type CatalogueProduct,
} from './product-view';

/** How availability reads in a comparison row. */
const AVAILABILITY_LABEL = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
} as const;

const input = z
  .object({
    productIds: z
      .array(objectIdSchema)
      .min(AI_LIMITS.minCompareProducts, 'compare at least two products')
      .max(AI_LIMITS.maxCompareProducts, 'compare at most four products')
      .describe('Ids of products from earlier tool results. Two to four.'),
  })
  .strict();

const rupees = (value: number): string => `₹${value.toLocaleString('en-IN')}`;

/**
 * Builds the comparison table.
 *
 * Every row is a field the catalogue actually stores. A specification only one
 * product documents still gets a row, with `null` where the others say nothing —
 * because "not listed" and "does not have it" are different claims, and
 * collapsing them is how a comparison starts inventing differences.
 */
function buildRows(
  products: AiProductDetailView[],
): { label: string; values: (string | null)[] }[] {
  const rows: { label: string; values: (string | null)[] }[] = [
    { label: 'Brand', values: products.map((product) => product.brand || null) },
    { label: 'Category', values: products.map((product) => product.category || null) },
    { label: 'Price', values: products.map((product) => rupees(product.price)) },
    {
      label: 'Was',
      values: products.map((product) =>
        product.compareAtPrice ? rupees(product.compareAtPrice) : null,
      ),
    },
    {
      label: 'Rating',
      values: products.map((product) =>
        product.reviewCount > 0
          ? `${product.rating.toFixed(1)} (${String(product.reviewCount)} ${product.reviewCount === 1 ? 'review' : 'reviews'})`
          : null,
      ),
    },
    {
      label: 'Availability',
      values: products.map((product) => AVAILABILITY_LABEL[product.availability]),
    },
    {
      label: 'Colours',
      values: products.map((product) => (product.colors.length ? product.colors.join(', ') : null)),
    },
    {
      label: 'Sizes',
      values: products.map((product) =>
        product.sizes.length ? product.sizes.map((size) => size.label).join(', ') : null,
      ),
    },
  ];

  // Specification labels in the order they first appear, so the table reads the
  // way the first product's spec sheet does.
  const specLabels: string[] = [];
  for (const product of products) {
    for (const spec of product.specifications) {
      if (spec.label && !specLabels.includes(spec.label)) specLabels.push(spec.label);
    }
  }

  for (const label of specLabels.slice(0, AI_LIMITS.maxSpecifications)) {
    rows.push({
      label,
      values: products.map(
        (product) => product.specifications.find((spec) => spec.label === label)?.value ?? null,
      ),
    });
  }

  // A row identical across every product tells the customer nothing and costs
  // a line of table. Keep it only when the products actually differ, or when
  // it is one of the headline facts they came to compare.
  const ALWAYS_KEEP = new Set(['Price', 'Rating', 'Availability']);

  return rows.filter((row) => {
    if (ALWAYS_KEEP.has(row.label)) return true;
    if (row.values.every((value) => value === null)) return false;
    return new Set(row.values).size > 1;
  });
}

export const compareProductsTool = defineTool({
  name: 'compare_products',
  description:
    'Compare two to four products side by side on price, rating, availability, variants and any documented specifications. Returns only fields the catalogue actually records — a blank means the store does not list that detail, not that the product lacks it.',
  requiresAuth: false,
  input,

  async execute(args, context) {
    // Duplicates would produce a table comparing a product with itself.
    const ids = [...new Set(args.productIds)];

    // Sequential rather than parallel: a comparison is at most four documents,
    // and an unknown id should fail as "product not found" naming that product
    // rather than as whichever of four concurrent lookups lost the race.
    const products: AiProductDetailView[] = [];
    for (const id of ids) {
      products.push(toProductDetailView((await productService.getProduct(id)) as CatalogueProduct));
    }

    remember(context.shown, products);

    return {
      products,
      rows: buildRows(products),
      note: 'Report the documented differences. Do not name a winner unless the customer has said what they are optimising for.',
    };
  },
});
