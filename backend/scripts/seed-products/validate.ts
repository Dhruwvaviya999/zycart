import { Error as MongooseError, type Types } from 'mongoose';
import { Product } from '../../src/models/product.model';
import { createProductSchema } from '../../src/validators/product.validator';
import { GENERATED_SKU_PREFIX, type GeneratedProduct } from './generate';
import { IMAGE_HOST } from './images';

/** A generated product with its references resolved — exactly what is inserted. */
export type ProductInsert = Omit<GeneratedProduct, 'categorySlug' | 'brandName' | 'subcategory'> & {
  category: Types.ObjectId;
  brand: Types.ObjectId;
};

export interface ValidationIssue {
  sku: string;
  problem: string;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Everything is checked before anything is written, so a bad dataset never
 * half-lands in the database. Three layers:
 *
 *  1. The admin API's own `createProductSchema` — the rules an operator's
 *     product must pass are the rules a generated one must pass.
 *  2. The Mongoose schema (`validate`), for the fields the API derives or
 *     never accepts: slug, rating aggregates, timestamps.
 *  3. The invariants the rest of the codebase relies on but neither schema
 *     can express: stock equals the sum of the variants, the rating
 *     aggregates agree with each other, a sale price is below its MRP, and
 *     names, slugs and SKUs are unique.
 */
export async function validateProducts(
  products: readonly ProductInsert[],
  now = new Date(),
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const names = new Map<string, string>();
  const slugs = new Map<string, string>();
  const skus = new Set<string>();
  const variantSkus = new Set<string>();

  for (const product of products) {
    const report = (problem: string) => issues.push({ sku: product.sku, problem });

    // 1. The API's create schema.
    const parsed = createProductSchema.safeParse({
      name: product.name,
      description: product.description,
      shortDescription: product.shortDescription,
      images: product.images,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      category: String(product.category),
      brand: String(product.brand),
      sku: product.sku,
      stock: product.stock,
      colors: product.colors,
      sizes: product.sizes,
      variants: product.variants.map(({ color, size, sku, stock }) => ({
        color,
        size,
        sku,
        stock,
      })),
      tags: product.tags,
      highlights: product.highlights,
      specifications: product.specifications,
      isFeatured: product.isFeatured,
      isBestSeller: product.isBestSeller,
      isNewArrival: product.isNewArrival,
      isActive: product.isActive,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        report(`${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }

    // 2. The Mongoose schema.
    try {
      await new Product(product).validate();
    } catch (error) {
      if (!(error instanceof MongooseError.ValidationError)) throw error;
      for (const [path, detail] of Object.entries(error.errors))
        report(`${path}: ${detail.message}`);
    }

    // 3. Invariants.
    if (!product.sku.startsWith(GENERATED_SKU_PREFIX))
      report(`SKU must start with ${GENERATED_SKU_PREFIX}`);
    if (!SLUG_PATTERN.test(product.slug)) report(`slug "${product.slug}" is not URL-safe`);
    if (!Number.isInteger(product.price) || product.price <= 0)
      report('price must be a positive whole number of rupees');
    if (product.compareAtPrice !== null && product.compareAtPrice <= product.price)
      report('compareAtPrice must be above price');
    if (product.images.some((url) => !url.startsWith(IMAGE_HOST)))
      report('every image must come from the verified Unsplash pool');

    if (product.variants.length > 0) {
      const total = product.variants.reduce((sum, variant) => sum + variant.stock, 0);
      if (total !== product.stock)
        report(`variant counts add up to ${total}, but stock is ${product.stock}`);
      for (const variant of product.variants) {
        if (variantSkus.has(variant.sku)) report(`variant SKU ${variant.sku} is used twice`);
        variantSkus.add(variant.sku);
      }
    }

    const breakdown = product.ratingBreakdown;
    const counted = breakdown[1] + breakdown[2] + breakdown[3] + breakdown[4] + breakdown[5];
    const summed =
      breakdown[1] + 2 * breakdown[2] + 3 * breakdown[3] + 4 * breakdown[4] + 5 * breakdown[5];
    const expectedRating =
      product.reviewCount > 0 ? Math.round((product.ratingSum / product.reviewCount) * 10) / 10 : 0;
    if (counted !== product.reviewCount)
      report(`rating breakdown totals ${counted}, but reviewCount is ${product.reviewCount}`);
    if (summed !== product.ratingSum)
      report(`rating breakdown sums to ${summed}, but ratingSum is ${product.ratingSum}`);
    if (product.rating !== expectedRating)
      report(`rating ${product.rating} does not match ratingSum / reviewCount (${expectedRating})`);

    if (product.createdAt > product.updatedAt) report('createdAt is after updatedAt');
    if (product.updatedAt > now) report('updatedAt is in the future');

    // Uniqueness within the batch. Collisions with the database were ruled out
    // at generation time, and the unique indexes on slug and SKU back that up.
    const nameKey = product.name.toLowerCase();
    if (names.has(nameKey)) report(`name duplicates ${names.get(nameKey)}`);
    names.set(nameKey, product.sku);
    if (slugs.has(product.slug)) report(`slug duplicates ${slugs.get(product.slug)}`);
    slugs.set(product.slug, product.sku);
    if (skus.has(product.sku)) report('SKU is used twice');
    skus.add(product.sku);
  }

  return issues;
}
