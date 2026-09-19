import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { Product } from '../models/product.model';
import { Review } from '../models/review.model';
import { recomputeProductAggregates } from '../services/review.service';

/**
 * Brings the catalogue's rating aggregates in line with Phase 8.
 *
 * Two things change.
 *
 * **The aggregate shape.** Products gain `ratingSum` and `ratingBreakdown`,
 * which is what lets an average be maintained by addition and a distribution be
 * rendered without scanning every review.
 *
 * **The aggregate values.** Before Phase 8, `rating` and `reviewCount` were
 * placeholder numbers written by the seed — a product claimed 4.8 stars from
 * 2,841 reviews that did not exist anywhere. From Phase 8 a rating is a claim
 * about real, purchase-verified reviews, so every product's aggregates are
 * recomputed from the reviews that actually exist. On a database with no
 * reviews yet, that means the catalogue starts unrated, and
 * `pnpm seed:reviews` will populate it with genuine ones for development.
 *
 * Additive and idempotent: it writes only aggregate fields, uses
 * `createIndexes` rather than `syncIndexes` so no existing index is dropped,
 * and running it twice produces the same result. It touches no collection other
 * than products, and no field other than the four aggregates.
 *
 *   pnpm migrate:phase8
 */
async function migrate(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await connectDatabase(uri);
  console.log(`Database: ${mongoose.connection.name}`);

  const reviewCount = await Review.estimatedDocumentCount();
  const products = await Product.find().select('_id name rating reviewCount');

  console.log(`\n${products.length} product(s), ${reviewCount} review(s) in the database.`);

  let changed = 0;
  let placeholders = 0;

  for (const product of products) {
    const before = { rating: product.rating ?? 0, reviewCount: product.reviewCount ?? 0 };

    const after = await recomputeProductAggregates(product._id);

    if (before.rating !== after.rating || before.reviewCount !== after.reviewCount) {
      changed += 1;
      if (before.reviewCount > 0 && after.reviewCount === 0) placeholders += 1;
    }
  }

  console.log(`  aggregates recomputed for all ${products.length} product(s)`);
  console.log(`  ${changed} product(s) changed`);

  if (placeholders > 0) {
    console.log(
      `  ${placeholders} product(s) had placeholder ratings with no reviews behind them; ` +
        'those now read as unrated.',
    );
    console.log('  Run `pnpm seed:reviews` to populate the catalogue with genuine reviews.');
  }

  /**
   * `createIndexes`, deliberately, not `syncIndexes`: the latter drops any
   * index the schema does not declare, which is not a decision a data migration
   * should be making on somebody's live collection.
   */
  console.log('\nCreating indexes (existing ones are left alone)...');
  await Review.createIndexes();

  const indexes = await Review.collection.indexes();
  console.log(`  reviews: ${indexes.map((index) => index.name).join(', ')}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

migrate().catch((error: unknown) => {
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
