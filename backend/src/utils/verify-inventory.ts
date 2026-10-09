import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database';
import { loadEnv } from '../config/env';
import { AuditLog } from '../models/audit-log.model';
import { Brand } from '../models/brand.model';
import { Category } from '../models/category.model';
import { InventoryMovement } from '../models/inventory-movement.model';
import { Product } from '../models/product.model';
import { User } from '../models/user.model';
import type { AuditActor } from '../services/admin/audit.service';
import * as inventory from '../services/inventory/inventory.service';
import { AppError } from './AppError';

/**
 * Exercises Phase 12's inventory writes against a real MongoDB.
 *
 * The unit suite covers every rule that can be decided without a database. What
 * it cannot cover is the part that only exists *because* there is a database:
 * the atomicity of the adjustment, the transaction that binds a stock change to
 * its movement and audit row, and what happens when two adjustments race for
 * the same last units.
 *
 * So that is what this script is for. It runs the real service functions inside
 * real transactions on a real replica set, and asserts the outcomes.
 *
 *   pnpm inventory:verify
 *
 * Safety, because this points at whatever MONGODB_URI is configured and that
 * may well be the real Atlas database:
 *
 *  - It creates its own category, brand, products and administrator under a
 *    `ZYCART-P12-` SKU prefix and a `@zycart-p12.test` email domain. Nothing
 *    else uses either.
 *  - It never reads, edits or deletes a record it did not create.
 *  - It removes exactly its own records at the end, in a `finally`, so a failed
 *    run still cleans up — including the movements and audit rows it caused.
 *  - There is no `deleteMany({})`, `dropDatabase`, `dropCollection` or
 *    `syncIndexes` anywhere in this file.
 */

const SKU_PREFIX = 'ZYCART-P12';
const SLUG_PREFIX = 'zycart-p12';
const EMAIL_DOMAIN = 'zycart-p12.test';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(name: string): void {
  console.log(`\n${name}`);
}

/** Runs something that must be refused, and reports how. */
async function refuses(
  label: string,
  run: () => Promise<unknown>,
  expect: { status?: number; match?: RegExp } = {},
): Promise<void> {
  try {
    await run();
    check(label, false, 'it was allowed');
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 0;
    const message = error instanceof Error ? error.message : String(error);

    const statusOk = expect.status === undefined || status === expect.status;
    const messageOk = expect.match === undefined || expect.match.test(message);

    check(label, statusOk && messageOk, `${String(status)} ${message}`);
  }
}

interface Fixtures {
  actor: AuditActor;
  actorId: Types.ObjectId;
  categoryId: Types.ObjectId;
  brandId: Types.ObjectId;
  productIds: Types.ObjectId[];
}

async function createFixtures(): Promise<Fixtures> {
  const category = await Category.create({
    name: `${SKU_PREFIX} Category`,
    slug: `${SLUG_PREFIX}-category`,
    description: 'Temporary verification category',
    isActive: true,
  });

  const brand = await Brand.create({
    name: `${SKU_PREFIX} Brand`,
    slug: `${SLUG_PREFIX}-brand`,
    isActive: true,
  });

  const admin = await User.create({
    firstName: 'Phase12',
    lastName: 'Verifier',
    email: `admin@${EMAIL_DOMAIN}`,
    role: 'ADMIN',
    isActive: true,
  });

  return {
    actor: {
      id: String(admin._id),
      name: 'Phase12 Verifier',
      email: `admin@${EMAIL_DOMAIN}`,
    },
    actorId: admin._id,
    categoryId: category._id,
    brandId: brand._id,
    productIds: [],
  };
}

async function makeProduct(
  fixtures: Fixtures,
  suffix: string,
  stock: number,
): Promise<Types.ObjectId> {
  const product = await Product.create({
    name: `${SKU_PREFIX} ${suffix}`,
    slug: `${SLUG_PREFIX}-${suffix.toLowerCase()}`,
    description: 'Temporary verification product. Safe to delete.',
    images: ['https://example.test/placeholder.png'],
    price: 1000,
    category: fixtures.categoryId,
    brand: fixtures.brandId,
    sku: `${SKU_PREFIX}-${suffix.toUpperCase()}`,
    stock,
    isActive: true,
  });

  fixtures.productIds.push(product._id);
  return product._id;
}

async function removeFixtures(fixtures: Fixtures): Promise<void> {
  console.log('\nRemoving verification data…');

  // Movements and audit rows first: they point at the records below.
  await InventoryMovement.deleteMany({ product: { $in: fixtures.productIds } });
  await AuditLog.deleteMany({ actor: fixtures.actorId });
  await Product.deleteMany({ _id: { $in: fixtures.productIds } });
  await Category.deleteOne({ _id: fixtures.categoryId });
  await Brand.deleteOne({ _id: fixtures.brandId });
  await User.deleteOne({ _id: fixtures.actorId });

  const leftovers = await Product.countDocuments({ sku: new RegExp(`^${SKU_PREFIX}`) });
  console.log(`  ${leftovers === 0 ? 'clean' : `WARNING: ${String(leftovers)} product(s) remain`}`);
}

const stockOf = async (id: Types.ObjectId): Promise<number> =>
  (await Product.findById(id).select('stock'))?.stock ?? -1;

/* ---------------------------------------------------------------- */

async function verifyAdjustment(fixtures: Fixtures): Promise<void> {
  section('Adjustment writes stock, a movement and an audit row together');

  const id = await makeProduct(fixtures, 'Adjust', 24);

  const result = await inventory.adjustStock(
    String(id),
    { quantityChange: 10, reason: 'RESTOCK', note: 'Verification restock', shownStock: 24 },
    fixtures.actor,
  );

  check('reports the quantity before', result.quantityBefore === 24);
  check('reports the quantity after', result.quantityAfter === 34);
  check('is not reported as stale', result.stale === false);
  check('actually moved the product', (await stockOf(id)) === 34);

  const movements = await InventoryMovement.find({ product: id }).sort({ createdAt: 1 });

  check('wrote exactly one movement', movements.length === 1, `got ${String(movements.length)}`);
  check('typed it as a manual adjustment', movements[0]?.type === 'MANUAL_ADJUSTMENT');
  check('recorded the reason', movements[0]?.reason === 'RESTOCK');
  check('recorded the note', movements[0]?.note === 'Verification restock');
  check('attributed it to the administrator', String(movements[0]?.actor) === fixtures.actor.id);

  check(
    'the ledger arithmetic holds',
    movements[0] !== undefined &&
      movements[0].quantityAfter === movements[0].quantityBefore + movements[0].quantityChange,
  );

  const audits = await AuditLog.find({ entityId: id, action: 'INVENTORY_ADJUSTED' });

  check('wrote exactly one audit row', audits.length === 1, `got ${String(audits.length)}`);
  check('the audit row reads as a sentence', /24 → 34/.test(audits[0]?.summary ?? ''));
  check('the audit row names the actor', audits[0]?.actorName === 'Phase12 Verifier');
  check(
    'the audit row records the before and after',
    audits[0]?.changes[0]?.from === '24' && audits[0]?.changes[0]?.to === '34',
  );
}

async function verifyRefusals(fixtures: Fixtures): Promise<void> {
  section('Refusals leave nothing behind');

  const id = await makeProduct(fixtures, 'Refuse', 4);

  await refuses(
    'a decrease larger than the stock on hand is refused',
    () =>
      inventory.adjustStock(String(id), { quantityChange: -5, reason: 'DAMAGED' }, fixtures.actor),
    { status: 409, match: /Only 4 in stock/ },
  );

  check('the stock is untouched', (await stockOf(id)) === 4);
  check('no movement was written', (await InventoryMovement.countDocuments({ product: id })) === 0);
  check(
    'no audit row claims it succeeded',
    (await AuditLog.countDocuments({ entityId: id })) === 0,
  );

  await refuses(
    'a reason that contradicts the direction is refused',
    () =>
      inventory.adjustStock(String(id), { quantityChange: -2, reason: 'RESTOCK' }, fixtures.actor),
    { status: 400, match: /cannot be used for a decrease/ },
  );

  check('the stock is still untouched', (await stockOf(id)) === 4);

  await refuses(
    'an unknown product is a 404',
    () =>
      inventory.adjustStock(
        '507f1f77bcf86cd799439011',
        { quantityChange: 5, reason: 'RESTOCK' },
        fixtures.actor,
      ),
    { status: 404 },
  );
}

async function verifyStaleCount(fixtures: Fixtures): Promise<void> {
  section('A stale counted total is refused; a stale delta is not');

  const id = await makeProduct(fixtures, 'Count', 20);

  await refuses(
    'a recount against a stock that has moved is refused',
    () =>
      inventory.adjustStock(
        String(id),
        { quantityChange: -3, reason: 'COUNT_CORRECTION', expectedStock: 17 },
        fixtures.actor,
      ),
    { status: 409, match: /is now 20, not the 17/ },
  );

  check('the stock is untouched', (await stockOf(id)) === 20);

  // The same operator, now working from the real number.
  const ok = await inventory.adjustStock(
    String(id),
    { quantityChange: -3, reason: 'COUNT_CORRECTION', expectedStock: 20 },
    fixtures.actor,
  );

  check('a recount against the real stock applies', ok.quantityAfter === 17);

  // A plain delta is correct whatever the screen showed, and says so.
  const stale = await inventory.adjustStock(
    String(id),
    { quantityChange: -2, reason: 'DAMAGED', shownStock: 20 },
    fixtures.actor,
  );

  check('a delta against a stale screen still applies', stale.quantityAfter === 15);
  check('and reports that the screen was stale', stale.stale === true);
}

/**
 * The test the unit suite cannot run.
 *
 * Ten adjustments of −6 fired at once against a stock of 10. Exactly one can
 * succeed: the guard is in the filter of a single atomic `findOneAndUpdate`, so
 * every other update matches nothing. Final stock must be 4, never −50 and
 * never 4 with nine ledger entries claiming otherwise.
 */
async function verifyConcurrency(fixtures: Fixtures): Promise<void> {
  section('Concurrent adjustments cannot oversell');

  const id = await makeProduct(fixtures, 'Race', 10);

  const attempts = Array.from({ length: 10 }, () =>
    inventory
      .adjustStock(String(id), { quantityChange: -6, reason: 'DAMAGED' }, fixtures.actor)
      .then(() => 'ok' as const)
      .catch(() => 'refused' as const),
  );

  const outcomes = await Promise.all(attempts);
  const succeeded = outcomes.filter((outcome) => outcome === 'ok').length;

  check('exactly one of ten succeeded', succeeded === 1, `${String(succeeded)} succeeded`);
  check('the final stock is 4', (await stockOf(id)) === 4);

  const movements = await InventoryMovement.find({ product: id });

  check(
    'the ledger holds exactly one movement',
    movements.length === 1,
    `got ${String(movements.length)}`,
  );
  check('and it agrees with the product', movements[0]?.quantityAfter === 4);

  check(
    'no audit row was written for a refused attempt',
    (await AuditLog.countDocuments({ entityId: id })) === 1,
  );

  // Now race increases, which have no floor and must therefore all apply.
  const ups = Array.from({ length: 5 }, () =>
    inventory.adjustStock(String(id), { quantityChange: 3, reason: 'RESTOCK' }, fixtures.actor),
  );

  await Promise.all(ups);

  check('five concurrent restocks all applied', (await stockOf(id)) === 19);
  check(
    'and each wrote its own movement',
    (await InventoryMovement.countDocuments({ product: id })) === 6,
  );
}

async function verifyLedgerIntegrity(fixtures: Fixtures): Promise<void> {
  section('The ledger reconciles with the product it describes');

  const id = await makeProduct(fixtures, 'Ledger', 50);

  for (const change of [-4, 12, -7, 30, -1]) {
    await inventory.adjustStock(
      String(id),
      { quantityChange: change, reason: change > 0 ? 'RESTOCK' : 'DAMAGED' },
      fixtures.actor,
    );
  }

  const movements = await InventoryMovement.find({ product: id }).sort({ createdAt: 1, _id: 1 });

  check('every adjustment is recorded', movements.length === 5);

  const arithmetic = movements.every(
    (movement) => movement.quantityAfter === movement.quantityBefore + movement.quantityChange,
  );
  check('every movement is internally consistent', arithmetic);

  const contiguous = movements.every(
    (movement, index) =>
      index === 0 || movement.quantityBefore === movements[index - 1]?.quantityAfter,
  );
  check('the chain has no gaps — nothing bypassed the ledger', contiguous);

  const finalStock = await stockOf(id);
  check(
    'the last movement agrees with the product',
    movements.at(-1)?.quantityAfter === finalStock,
    `ledger ${String(movements.at(-1)?.quantityAfter)} vs product ${String(finalStock)}`,
  );
  check('the arithmetic lands where it should', finalStock === 80);
}

async function verifyReads(fixtures: Fixtures): Promise<void> {
  section('The reading side agrees with the writing side');

  const id = await makeProduct(fixtures, 'Read', 3);

  await inventory.setThreshold(String(id), 10, fixtures.actor);

  const item = await inventory.getInventoryItem(String(id));

  check('the detail reports the stock', item.stock === 3);
  check('the threshold is the one just set', item.lowStockThreshold === 10);
  check('and is not reported as the default', item.usesDefaultThreshold === false);
  check('3 against a threshold of 10 reads as low stock', item.stockState === 'low_stock');

  await inventory.setThreshold(String(id), null, fixtures.actor);

  const restored = await inventory.getInventoryItem(String(id));
  check('clearing it restores the store default', restored.usesDefaultThreshold === true);
  check('and 3 now reads as low against the default of 5', restored.stockState === 'low_stock');

  check(
    'a threshold change writes no stock movement',
    (await InventoryMovement.countDocuments({ product: id })) === 0,
  );

  const listed = await inventory.listInventory({
    page: 1,
    limit: 100,
    search: `${SKU_PREFIX}-READ`,
    sort: 'stock_asc',
  });

  check(
    'the listing finds it by SKU',
    listed.items.some((row) => row.id === String(id)),
  );

  const summary = await inventory.getInventorySummary();
  check('the summary returns real counts', summary.products > 0 && summary.activeProducts > 0);
  check('and states the store default', summary.defaultThreshold === 5);
}

async function main(): Promise<void> {
  const env = loadEnv();
  await connectDatabase(env.MONGODB_URI);

  console.log(`Verifying ZyCart inventory against ${mongoose.connection.name}`);
  console.log('Creating isolated test data…');

  const fixtures = await createFixtures();

  try {
    await verifyAdjustment(fixtures);
    await verifyRefusals(fixtures);
    await verifyStaleCount(fixtures);
    await verifyConcurrency(fixtures);
    await verifyLedgerIntegrity(fixtures);
    await verifyReads(fixtures);
  } finally {
    await removeFixtures(fixtures);
    await mongoose.disconnect();
  }

  console.log(`\n${String(passed)} passed, ${String(failed)} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
