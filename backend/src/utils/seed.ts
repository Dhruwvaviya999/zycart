import 'dotenv/config';
import { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { loadEnv } from '../config/env';
import { Brand } from '../models/brand.model';
import { Category } from '../models/category.model';
import { Product } from '../models/product.model';
import { seedBrands, seedCategories, seedProducts } from './seed-data';

/**
 * Replaces the catalogue collections with the development dataset.
 *
 * Destructive by design: it empties products, categories and brands first so
 * repeated runs are identical. It touches nothing else in the database.
 */
async function seedDatabase(): Promise<void> {
  const env = loadEnv();
  await connectDatabase(env.MONGODB_URI);

  await Promise.all([Product.deleteMany({}), Category.deleteMany({}), Brand.deleteMany({})]);
  console.log('Cleared products, categories and brands');

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

  // `timestamps: false` keeps the authored createdAt values, so "newest" and
  // "oldest" sorting order the catalogue meaningfully rather than by insert order.
  const inserted = await Product.insertMany(documents, { timestamps: false });

  console.log(
    `Seeded ${categories.length} categories, ${brands.length} brands, ${inserted.length} products`,
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
