import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { Order } from '../models/order.model';
import { WebhookEvent } from '../models/webhook-event.model';

/**
 * Brings orders written before Phase 7 up to the shape Phase 7 reasons about.
 *
 * One field matters: `stockCommitted`.
 *
 * Phase 6 had only cash on delivery, which always took stock at creation, so
 * "does this order hold stock?" was answerable from its status alone. Phase 7
 * added a payment method that takes stock later, which made the question
 * un-derivable — hence the explicit flag, and hence this backfill. Without it,
 * every pre-existing order would read as holding no stock, and cancelling one
 * would quietly fail to put its units back.
 *
 * The rule is exactly Phase 6's behaviour:
 *
 *   - a cancelled order already had its stock restored  -> false
 *   - anything else took stock when it was placed       -> true
 *
 * Deliberately additive and idempotent. It writes only to documents where the
 * field is absent, so running it twice changes nothing the second time, and it
 * never deletes, drops or overwrites anything.
 *
 *   pnpm --filter zycart-backend migrate:phase7
 */
async function migrate(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await connectDatabase(uri);

  console.log(`Database: ${mongoose.connection.name}`);

  const pending = await Order.countDocuments({ stockCommitted: { $exists: false } });

  if (pending === 0) {
    console.log('stockCommitted: nothing to backfill, every order already has it.');
  } else {
    console.log(`stockCommitted: ${pending} order(s) to backfill.`);

    const cancelled = await Order.collection.updateMany(
      { stockCommitted: { $exists: false }, status: 'CANCELLED' },
      { $set: { stockCommitted: false } },
    );

    const live = await Order.collection.updateMany(
      { stockCommitted: { $exists: false } },
      { $set: { stockCommitted: true } },
    );

    console.log(`  cancelled orders  -> stockCommitted: false  (${cancelled.modifiedCount})`);
    console.log(`  all other orders  -> stockCommitted: true   (${live.modifiedCount})`);
  }

  /**
   * The unique partial index on payment.razorpayOrderId is part of what makes
   * payment finalisation safe, so it is created here rather than left to the
   * first write that happens to need it.
   *
   * `createIndexes`, deliberately, not `syncIndexes`: the latter drops any
   * index the schema does not declare, which is not a decision a data
   * migration should be making on somebody's live collection.
   */
  console.log('\nCreating indexes (existing ones are left alone)...');
  await Order.createIndexes();
  await WebhookEvent.createIndexes();

  const indexes = await Order.collection.indexes();
  console.log(`  orders: ${indexes.map((index) => index.name).join(', ')}`);

  const webhookIndexes = await WebhookEvent.collection.indexes();
  console.log(`  webhookevents: ${webhookIndexes.map((index) => index.name).join(', ')}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

migrate().catch((error: unknown) => {
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
