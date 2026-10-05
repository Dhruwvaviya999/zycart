import mongoose, { Types } from 'mongoose';
import { Brand } from '../../src/models/brand.model';
import { Cart } from '../../src/models/cart.model';
import { Category } from '../../src/models/category.model';
import { InventoryMovement } from '../../src/models/inventory-movement.model';
import { ProductAlert } from '../../src/models/product-alert.model';
import { Product } from '../../src/models/product.model';
import { Review } from '../../src/models/review.model';
import { UserActivity } from '../../src/models/user-activity.model';
import { Wishlist } from '../../src/models/wishlist.model';
import { slugify } from '../../src/utils/slugify';
import { CATALOG } from './catalog';
import { GENERATED_SKU_PREFIX } from './generate';
import type { ProductInsert } from './validate';

/** Keeps passwords out of anything printed: `mongodb+srv://user:pass@host` → `mongodb+srv://***@host`. */
export const redactUri = (text: string): string =>
  text.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]+@/g, '$1***@');

/** A connection failure explained in terms of what to check, not just what the driver said. */
export function explainConnectionError(error: unknown): string {
  const message = redactUri(error instanceof Error ? error.message : String(error));
  const hints: string[] = [];

  if (/ENOTFOUND|querySrv|EAI_AGAIN/i.test(message))
    hints.push(
      'The cluster host could not be resolved — check the host in MONGODB_URI and your internet/DNS.',
    );
  if (/auth|authentication/i.test(message))
    hints.push('Authentication failed — check the username and password in MONGODB_URI.');
  if (/ECONNREFUSED/i.test(message))
    hints.push('Nothing is listening at that address — is mongod running?');
  if (/Server selection timed out|ServerSelection|ETIMEDOUT|timed out/i.test(message)) {
    hints.push(
      'Timed out reaching the server — on Atlas, add your current IP under Network Access.',
    );
  }
  if (hints.length === 0)
    hints.push('Check MONGODB_URI in backend/.env and that the database is reachable.');

  return `${message}\n  ${hints.join('\n  ')}`;
}

export async function connect(uri: string): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}

export const generatedFilter = { sku: { $regex: `^${GENERATED_SKU_PREFIX}` } };

/** What a clear would remove, for the confirmation message. */
export async function countProducts(): Promise<{ total: number; generated: number }> {
  const [total, generated] = await Promise.all([
    Product.countDocuments({}),
    Product.countDocuments(generatedFilter),
  ]);
  return { total, generated };
}

/** Names, slugs and SKUs a new batch must not reuse — everything that will still exist after the clear. */
export async function reservedIdentities(scope: 'all' | 'non-generated' | 'none') {
  if (scope === 'none') return { names: [], slugs: [], skus: [] };
  const filter = scope === 'all' ? {} : { sku: { $not: new RegExp(`^${GENERATED_SKU_PREFIX}`) } };
  const rows = await Product.find(filter, { name: 1, slug: 1, sku: 1 }).lean();
  return {
    names: rows.map((r) => r.name),
    slugs: rows.map((r) => r.slug),
    skus: rows.map((r) => r.sku),
  };
}

export interface ClearResult {
  products: number;
  movements: number;
  reviews: number;
  alerts: number;
  activity: number;
  cartsTouched: number;
  wishlistsTouched: number;
  brands: number;
}

/**
 * Removes products and everything that would otherwise point at nothing.
 *
 * Orders and return requests are left alone on purpose: their lines are
 * snapshots (name, SKU, price, image) with a nullable product reference,
 * written so that history survives a product being deleted.
 *
 * Categories are never removed — they carry GST rates and try-on settings an
 * administrator chose. Brands are removed only by `--replace-all`, and only
 * those no remaining product uses.
 */
export async function clearProducts(
  scope: 'generated' | 'all',
  chunkSize = 1_000,
): Promise<ClearResult> {
  const ids = (await Product.find(scope === 'all' ? {} : generatedFilter, { _id: 1 }).lean()).map(
    (row) => row._id,
  );
  const result: ClearResult = {
    products: 0,
    movements: 0,
    reviews: 0,
    alerts: 0,
    activity: 0,
    cartsTouched: 0,
    wishlistsTouched: 0,
    brands: 0,
  };

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const inChunk = { $in: chunk };
    const [movements, reviews, alerts, activity, carts, wishlists, products] = await Promise.all([
      InventoryMovement.deleteMany({ product: inChunk }),
      Review.deleteMany({ product: inChunk }),
      ProductAlert.deleteMany({ product: inChunk }),
      UserActivity.deleteMany({ product: inChunk }),
      Cart.updateMany({ 'items.product': inChunk }, { $pull: { items: { product: inChunk } } }),
      Wishlist.updateMany({ 'items.product': inChunk }, { $pull: { items: { product: inChunk } } }),
      Product.deleteMany({ _id: inChunk }),
    ]);
    result.movements += movements.deletedCount;
    result.reviews += reviews.deletedCount;
    result.alerts += alerts.deletedCount;
    result.activity += activity.deletedCount;
    result.cartsTouched += carts.modifiedCount;
    result.wishlistsTouched += wishlists.modifiedCount;
    result.products += products.deletedCount;
  }

  if (scope === 'all') {
    const used = await Product.distinct('brand');
    result.brands = (await Brand.deleteMany({ _id: { $nin: used } })).deletedCount;
  }

  return result;
}

/**
 * Makes sure every category the generator uses exists, creating only the
 * missing ones. An existing category is never modified: its GST rate, HSN
 * code and try-on switch belong to whoever set them in the console.
 */
export async function ensureCategories(): Promise<{
  ids: Map<string, Types.ObjectId>;
  created: string[];
}> {
  const ids = new Map<string, Types.ObjectId>();
  const created: string[] = [];

  for (const category of CATALOG) {
    const existing = await Category.findOne(
      { $or: [{ slug: category.slug }, { name: category.name }] },
      { _id: 1 },
    ).lean();
    let id = existing?._id;
    if (!id) {
      const inserted = await Category.create({
        name: category.name,
        slug: category.slug,
        description: category.description,
        image: category.image,
        gstRate: category.gstRate,
        hsnCode: category.hsnCode,
        tryOnEnabled: category.tryOnEnabled,
        isActive: true,
      });
      id = inserted._id;
      created.push(category.name);
    }
    ids.set(category.slug, id);
  }

  return { ids, created };
}

/** Same rule for brands: reuse by name (or slug), create what is missing, in one insert. */
export async function ensureBrands(
  names: readonly string[],
): Promise<{ ids: Map<string, Types.ObjectId>; created: number }> {
  const wanted = [...new Set(names)];
  const slugOf = (name: string) => slugify(name) || 'brand';
  const existing = await Brand.find(
    { $or: [{ name: { $in: wanted } }, { slug: { $in: wanted.map(slugOf) } }] },
    { name: 1, slug: 1 },
  ).lean();

  const ids = new Map<string, Types.ObjectId>();
  for (const name of wanted) {
    const match =
      existing.find((b) => b.name === name) ?? existing.find((b) => b.slug === slugOf(name));
    if (match) ids.set(name, match._id);
  }

  const missing = wanted.filter((name) => !ids.has(name));
  if (missing.length > 0) {
    const inserted = await Brand.insertMany(
      missing.map((name) => ({ name, slug: slugOf(name), logo: '', isActive: true })),
    );
    for (const brand of inserted) ids.set(brand.name, brand._id);
  }

  return { ids, created: missing.length };
}

/**
 * Opening stock, recorded in the ledger as the movement it is — the same
 * INITIAL_STOCK rows `pnpm seed` and `createProduct` write — so the inventory
 * console's history for a generated product starts at its real opening count.
 */
function openingMovements(product: ProductInsert & { _id: Types.ObjectId }) {
  if (product.stock <= 0) return [];
  const base = {
    product: product._id,
    productName: product.name,
    sku: product.sku,
    type: 'INITIAL_STOCK' as const,
    referenceType: 'PRODUCT' as const,
    referenceId: product._id,
    createdAt: product.createdAt,
    updatedAt: product.createdAt,
  };

  if (product.variants.length === 0) {
    return [
      {
        ...base,
        quantityBefore: 0,
        quantityChange: product.stock,
        quantityAfter: product.stock,
        referenceLabel: product.sku,
      },
    ];
  }

  let total = 0;
  return product.variants
    .filter((variant) => variant.stock > 0)
    .map((variant) => {
      const quantityBefore = total;
      total += variant.stock;
      return {
        ...base,
        variant: {
          color: variant.color,
          size: variant.size,
          sku: variant.sku,
          quantityBefore: 0,
          quantityAfter: variant.stock,
        },
        quantityBefore,
        quantityChange: variant.stock,
        quantityAfter: total,
        referenceLabel: variant.sku,
      };
    });
}

/**
 * Bulk-inserts in batches, then writes the ledger in batches.
 *
 * The caller assigns ids up front so that a failure part-way through can be
 * undone exactly: `rollback` deletes this run's products and movements by id
 * and touches nothing else.
 */
export async function insertProducts(
  withIds: readonly (ProductInsert & { _id: Types.ObjectId })[],
  batchSize: number,
  onProgress: (stage: 'products' | 'ledger', done: number, total: number) => void,
): Promise<{ inserted: number; movements: number }> {
  let inserted = 0;
  for (let i = 0; i < withIds.length; i += batchSize) {
    const batch = withIds.slice(i, i + batchSize);
    // `timestamps: false` keeps the generated createdAt/updatedAt; `ordered`
    // stops at the first failure so the rollback has a clean boundary.
    await Product.insertMany(batch, { ordered: true, timestamps: false });
    inserted += batch.length;
    onProgress('products', inserted, withIds.length);
  }

  const movements = withIds.flatMap(openingMovements);
  let written = 0;
  for (let i = 0; i < movements.length; i += batchSize) {
    const batch = movements.slice(i, i + batchSize);
    await InventoryMovement.insertMany(batch, { ordered: true, timestamps: false });
    written += batch.length;
    onProgress('ledger', written, movements.length);
  }

  return { inserted, movements: written };
}

export async function rollback(ids: readonly Types.ObjectId[]): Promise<number> {
  await InventoryMovement.deleteMany({ product: { $in: ids } });
  return (await Product.deleteMany({ _id: { $in: ids } })).deletedCount;
}
