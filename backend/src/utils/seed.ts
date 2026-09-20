import 'dotenv/config';
import { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { loadEnv } from '../config/env';
import { Brand } from '../models/brand.model';
import { Category } from '../models/category.model';
import { InventoryMovement } from '../models/inventory-movement.model';
import { Product } from '../models/product.model';
import { seedBrands, seedCategories, seedProducts } from './seed-data';

/**
 * Replaces the catalogue collections with the development dataset.
 *
 * Destructive by design: it empties products, categories and brands first so
 * repeated runs are identical. It touches nothing else in the database.
 *
 * From Phase 12 it also resets the inventory ledger, because the ledger
 * describes products this script is about to delete — leaving it would produce
 * a movement history pointing at nothing. The audit trail is deliberately left
 * alone: it records what members of staff did, which a catalogue reset does not
 * undo.
 */
async function seedDatabase(): Promise<void> {
  const env = loadEnv();
  await connectDatabase(env.MONGODB_URI);

  await Promise.all([
    Product.deleteMany({}),
    Category.deleteMany({}),
    Brand.deleteMany({}),
    InventoryMovement.deleteMany({}),
  ]);
  console.log('Cleared products, categories, brands and inventory movements');

  const categories = await Category.insertMany(seedCategories);
  const brands = await Brand.insertMany(seedBrands);

  const categoryIds = new Map<string, Types.ObjectId>(
    categories.map((category) => [category.slug, category._id]),
  );
  const brandIds = new Map<string, Types.ObjectId>(brands.map((brand) => [brand.name, brand._id]));

  const documents = seedProducts.map((product) => {
    const category = categoryIds.get(product.category);
    const brand = brandIds.get(product.brand);

    if (!category) throw new Error(`Unknown category slug: ${product.category}`);
    if (!brand) throw new Error(`Unknown brand name: ${product.brand}`);

    const createdAt = new Date(product.createdAt);
    return { ...product, category, brand, createdAt, updatedAt: createdAt };
  });

  /**
   * Seeded products carry no rating.
   *
   * From Phase 8 a product's rating is derived from real, purchase-verified
   * reviews and nothing else, so the catalogue starts unrated and earns its
   * stars. `pnpm seed:reviews` creates genuine reviews — real customers, real
   * delivered orders — if a populated storefront is wanted for development.
   *
   * `timestamps: false` keeps the authored createdAt values, so "newest" and
   * "oldest" sorting order the catalogue meaningfully rather than by insert order.
   */
  const inserted = await Product.insertMany(documents, { timestamps: false });

  /**
   * Opening stock, recorded as the movement it actually is.
   *
   * These are not invented history: the seed *is* the moment these products
   * came into existence with these quantities, so an INITIAL_STOCK row is the
   * literal truth about them — unlike backfilling one for a product that has
   * been selling for months, which `migrate:phase12` deliberately does not do.
   *
   * Dated to each product's own `createdAt` so the ledger and the catalogue
   * agree, and inserted in one call rather than one per product.
   */
  const openingStock = inserted
    .filter((product) => product.stock > 0)
    .map((product) => ({
      product: product._id,
      productName: product.name,
      sku: product.sku,
      type: 'INITIAL_STOCK' as const,
      quantityBefore: 0,
      quantityChange: product.stock,
      quantityAfter: product.stock,
      referenceType: 'PRODUCT' as const,
      referenceId: product._id,
      referenceLabel: product.sku,
      createdAt: product.createdAt,
      updatedAt: product.createdAt,
    }));

  await InventoryMovement.insertMany(openingStock, { timestamps: false });

  console.log(
    `Seeded ${categories.length} categories, ${brands.length} brands, ${inserted.length} products, ` +
      `${openingStock.length} opening-stock movements`,
  );

  const counts = {
    featured: inserted.filter((product) => product.isFeatured).length,
    bestSellers: inserted.filter((product) => product.isBestSeller).length,
    newArrivals: inserted.filter((product) => product.isNewArrival).length,
    outOfStock: inserted.filter((product) => product.stock === 0).length,
  };
  console.log(
    `  featured ${counts.featured} · best sellers ${counts.bestSellers} · ` +
      `new arrivals ${counts.newArrivals} · out of stock ${counts.outOfStock}`,
  );
}

seedDatabase()
  .then(async () => {
    await disconnectDatabase();
    console.log('Done.');
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
