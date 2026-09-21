import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { AuditLog } from '../models/audit-log.model';
import { InventoryMovement } from '../models/inventory-movement.model';
import { Product } from '../models/product.model';

/**
 * Prepares an existing database for Phase 12.
 *
 * ## What it does
 *
 * Creates the indexes for the two new collections and for the compound
 * `{ isActive, stock }` index the inventory console sorts on. That is all it
 * does to existing data, because that is all Phase 12 actually needs:
 *
 *  - `lowStockThreshold` is **not** backfilled. It is nullable by design, and
 *    null means "follow the store default" rather than "unset". Writing 5 into
 *    every product would turn a default that can be changed once into a value
 *    that would have to be changed everywhere.
 *  - Inventory movements are **not** invented for products that already exist.
 *    A product with 12 units today may have started with 40 and sold 28, and an
 *    INITIAL_STOCK row claiming it opened with 12 would be a fabricated entry
 *    whose arithmetic contradicts every sale that came before it. The ledger
 *    starts empty and fills up honestly from the first movement after this
 *    phase; the console says as much rather than showing a blank panel.
 *
 * Additive and idempotent. It creates no documents, deletes none, and running
 * it twice produces the same result. `createIndexes` rather than `syncIndexes`:
 * the latter drops any index the schema does not declare, which is not a
 * decision a migration should make on somebody's live collection.
 *
 *   pnpm migrate:phase12
 */
async function migrate(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await connectDatabase(uri);
  console.log(`Database: ${mongoose.connection.name}`);

  const [products, movements, audits] = await Promise.all([
    Product.estimatedDocumentCount(),
    InventoryMovement.estimatedDocumentCount(),
    AuditLog.estimatedDocumentCount(),
  ]);

  console.log(
    `\n${products} product(s), ${movements} existing movement(s), ${audits} existing audit row(s).`,
  );

  console.log('\nCreating indexes (existing ones are left alone)...');

  await Promise.all([
    InventoryMovement.createIndexes(),
    AuditLog.createIndexes(),
    Product.createIndexes(),
  ]);

  for (const model of [InventoryMovement, AuditLog, Product]) {
    const indexes = await model.collection.indexes();
    console.log(`  ${model.collection.collectionName}: ${indexes.map((i) => i.name).join(', ')}`);
  }

  const withThreshold = await Product.countDocuments({ lowStockThreshold: { $ne: null } });

  console.log(
    `\n${withThreshold} product(s) carry their own low-stock threshold; ` +
      `the rest follow the store default.`,
  );

  console.log(
    '\nNo inventory movements were created. Products that existed before this phase start ' +
      'with an empty ledger and record every change from now on.',
  );

  await mongoose.disconnect();
  console.log('\nDone.');
}

migrate().catch((error: unknown) => {
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
