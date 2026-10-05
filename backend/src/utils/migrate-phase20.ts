import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { Product } from '../models/product.model';
import { ProductAlert } from '../models/product-alert.model';

/**
 * Prepares an existing database for Phase 20.
 *
 *   pnpm migrate:phase20
 *
 * ## What it does
 *
 * Two things, both additive:
 *
 *  1. **Creates the indexes** for the new `ProductAlert` collection — among
 *     them the partial unique index that stops a customer holding two
 *     identical alerts. The API would build it on start-up as well; creating
 *     it here means a deploy does not depend on that, and says so if it fails.
 *
 *  2. **Gives every product an empty `variants` list** where the field is
 *     missing. Not load-bearing: every query that asks "does this product
 *     track variants?" is written as `'variants.0': { $exists: false }`, which
 *     a missing field satisfies. It makes the documents uniform, so a reader in
 *     a database shell sees the same shape on every product.
 *
 * ## What it will not do
 *
 * **It does not split anybody's stock into variants.** A product that holds 40
 * pairs of shoes in five sizes holds no record of how many are size 9, and
 * dividing the 40 by five would put a guess into the ledger as though it had
 * been counted. An operator splits a product from its edit page, entering the
 * counts they actually have — and the form refuses a split that does not add up
 * to what the product holds.
 *
 * Idempotent and non-destructive. `createIndexes` rather than `syncIndexes`,
 * for the reason Phase 13 gives: the latter drops indexes the schema does not
 * declare, which is not a decision a migration should make.
 */
async function migrate(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await connectDatabase(uri);
  console.log(`Database: ${mongoose.connection.name}\n`);

  /* 1. Indexes ---------------------------------------------------- */

  console.log('Creating indexes (existing ones are left alone)...');

  await ProductAlert.createIndexes();

  const names = (await ProductAlert.collection.indexes()).map((index) => index.name).join(', ');
  console.log(`  ${ProductAlert.modelName}: ${names}`);

  /* 2. Variant lists ---------------------------------------------- */

  console.log('\nGiving products without a variant list an empty one...');

  const initialised = await Product.updateMany(
    { variants: { $exists: false } },
    { $set: { variants: [] } },
    // Not a change anybody made to the product.
    { timestamps: false },
  );

  console.log(`  variants initialised on ${initialised.modifiedCount} product(s)`);

  const tracking = await Product.countDocuments({ 'variants.0': { $exists: true } });
  console.log(`  ${tracking} product(s) already track stock per variant`);

  console.log(
    '\nDone. No stock was moved or divided: products keep one count until an operator\n' +
      'splits them into variants from the product page.',
  );
}

migrate()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('\nMigration failed:', error instanceof Error ? error.message : error);
    void mongoose.disconnect().finally(() => process.exit(1));
  });
