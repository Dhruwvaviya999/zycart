import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { AuditLog } from '../models/audit-log.model';
import { Order } from '../models/order.model';
import { ReturnRequest } from '../models/return.model';
import { Shipment } from '../models/shipment.model';

/**
 * Prepares an existing database for Phase 13.
 *
 *   pnpm migrate:phase13
 *
 * ## What it does, and what it refuses to do
 *
 * Three things, all of them additive:
 *
 *  1. **Creates the indexes** for the two new collections, and the
 *     `{ status, deliveredAt }` index on orders that the return-rate query
 *     needs.
 *
 *  2. **Initialises the two new counters** — `items[].returnedQuantity` and
 *     `payment.refundedAmount` — to zero on documents written before they
 *     existed. This one is not cosmetic. The return reservation is an atomic
 *     update whose array filter compares `returnedQuantity` against a number,
 *     and in MongoDB a *missing* field does not match a numeric `$lte`. Without
 *     this step, every order placed before Phase 13 would silently refuse every
 *     return, with a message about quantity that would make no sense.
 *
 *  3. **Backfills `Order.deliveredAt`** from the audit trail, and only from the
 *     audit trail. The return window is counted from delivery, so an order with
 *     no delivery date cannot be self-served — and the honest source for when a
 *     past order was delivered is the `ORDER_STATUS_CHANGED` row that recorded
 *     the transition. That is a timestamp somebody actually wrote down.
 *
 * ## What it will not invent
 *
 * - **No shipments are created.** An order that shipped before Phase 13 has no
 *   carrier, no tracking number and no dispatch date on record, and writing
 *   plausible ones would put fiction on a customer's tracking page. Those
 *   orders show "shipment tracking is not available for this order", which is
 *   true. The same reasoning kept Phase 12 from inventing opening-stock
 *   movements.
 *
 * - **No delivery date is guessed.** An order delivered before Phase 12's audit
 *   trail existed has no row to read, so `deliveredAt` stays null. Those orders
 *   are refused a self-service return, with an explanation and a route to
 *   support, rather than being given a window starting from `createdAt` or
 *   `updatedAt` — neither of which is when it was delivered.
 *
 * Idempotent and non-destructive. It creates no documents, deletes none, and
 * running it twice produces the same result: every update below is filtered to
 * documents that do not already have the field. `createIndexes` rather than
 * `syncIndexes`, because the latter drops any index the schema does not
 * declare, which is not a decision a migration should make on a live
 * collection.
 */
async function migrate(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await connectDatabase(uri);
  console.log(`Database: ${mongoose.connection.name}\n`);

  const [orders, shipments, returns] = await Promise.all([
    Order.estimatedDocumentCount(),
    Shipment.estimatedDocumentCount(),
    ReturnRequest.estimatedDocumentCount(),
  ]);

  console.log(
    `${orders} order(s), ${shipments} existing shipment(s), ${returns} existing return(s).`,
  );

  /* 1. Indexes ---------------------------------------------------- */

  console.log('\nCreating indexes (existing ones are left alone)...');

  await Promise.all([Shipment.createIndexes(), ReturnRequest.createIndexes(), Order.createIndexes()]);

  for (const model of [Shipment, ReturnRequest, Order]) {
    const names = (await model.collection.indexes()).map((index) => index.name).join(', ');
    console.log(`  ${model.modelName}: ${names}`);
  }

  /* 2. Counters --------------------------------------------------- */

  console.log('\nInitialising the new counters...');

  /**
   * Only the array elements that are actually missing the field are touched.
   *
   * `items.$[]` would have written zero over every element including ones that
   * already had a value — harmless today, since no returns can exist yet, and
   * wrong the moment this script is re-run on a database that has them.
   */
  const itemCounters = await Order.updateMany(
    { items: { $elemMatch: { returnedQuantity: { $exists: false } } } },
    { $set: { 'items.$[it].returnedQuantity': 0 } },
    { arrayFilters: [{ 'it.returnedQuantity': { $exists: false } }] },
  );

  console.log(`  returnedQuantity initialised on ${itemCounters.modifiedCount} order(s)`);

  const refundCounters = await Order.updateMany(
    { 'payment.refundedAmount': { $exists: false } },
    { $set: { 'payment.refundedAmount': 0 } },
  );

  console.log(`  payment.refundedAmount initialised on ${refundCounters.modifiedCount} order(s)`);

  /**
   * An order Phase 7 already refunded in full should say so in the new running
   * total, or the cap that stops an order being over-refunded would start from
   * zero on money that has already gone back.
   */
  const settled = await Order.updateMany(
    { 'payment.status': 'REFUNDED', 'payment.refundedAmount': 0 },
    [{ $set: { 'payment.refundedAmount': '$pricing.total' } }],
    // Mongoose 9 requires the intent to be stated: an array update is an
    // aggregation pipeline, not a document, and it will not guess.
    { updatePipeline: true },
  );

  console.log(`  refundedAmount backfilled on ${settled.modifiedCount} already-refunded order(s)`);

  /* 3. Delivery dates --------------------------------------------- */

  console.log('\nBackfilling delivery dates from the audit trail...');

  const delivered = await Order.find({ status: 'DELIVERED', deliveredAt: null })
    .select('_id orderNumber')
    .lean();

  console.log(`  ${delivered.length} delivered order(s) with no recorded delivery date`);

  let backfilled = 0;

  for (const order of delivered) {
    /**
     * The first transition into DELIVERED. Sorted ascending because an order
     * cannot leave DELIVERED, so there should be exactly one — and if a
     * database somehow holds two, the earlier is the delivery and the later is
     * a duplicate, not a redelivery.
     */
    const entry = await AuditLog.findOne({
      entityType: 'ORDER',
      entityId: order._id,
      action: 'ORDER_STATUS_CHANGED',
      'changes.to': 'DELIVERED',
    })
      .sort({ createdAt: 1 })
      .select('createdAt')
      .lean();

    if (!entry) continue;

    await Order.updateOne({ _id: order._id }, { $set: { deliveredAt: entry.createdAt } });
    backfilled += 1;
  }

  console.log(`  ${backfilled} delivery date(s) recovered from audit rows`);

  const unrecoverable = delivered.length - backfilled;

  if (unrecoverable > 0) {
    console.log(
      `\n  ${unrecoverable} delivered order(s) have no audit row and keep a null delivery date.\n` +
        '  These are left alone on purpose: there is no honest way to say when they arrived,\n' +
        '  so ZyCart declines a self-service return on them and points the customer at support\n' +
        '  rather than starting a return window from a date nobody recorded.',
    );
  }

  console.log('\nDone. Nothing was deleted and no shipment or return was invented.');
}

migrate()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('\nMigration failed:', error instanceof Error ? error.message : error);
    void mongoose.disconnect().finally(() => process.exit(1));
  });
