import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database';
import { loadEnv } from '../config/env';
import { AuditLog } from '../models/audit-log.model';
import { Brand } from '../models/brand.model';
import { Category } from '../models/category.model';
import { InventoryMovement } from '../models/inventory-movement.model';
import { NotificationDelivery } from '../models/notification-delivery.model';
import { Order } from '../models/order.model';
import { Product } from '../models/product.model';
import { ReturnRequest } from '../models/return.model';
import { Shipment } from '../models/shipment.model';
import { User } from '../models/user.model';
import type { AuditActor } from '../services/admin/audit.service';
import { setOrderStatus } from '../services/order.service';
import * as shipments from '../services/fulfillment/shipment.service';
import { issueReturnRefund } from '../services/returns/refund.service';
import * as returns from '../services/returns/return.service';
import { AppError } from './AppError';

/**
 * Exercises Phase 13 against a real MongoDB.
 *
 * ## What this covers that the unit suite cannot
 *
 * `tests/returns.test.ts` covers every rule that can be decided without a
 * database — the transition graphs, the window arithmetic, the refund
 * apportionment, the validators. What it cannot cover is the part that only
 * exists *because* there is a database:
 *
 *  - the atomic reservation of returnable quantity, and what two clients racing
 *    for the last unit actually do;
 *  - the transaction that binds a shipment move to its order move, and whether
 *    an illegal order transition really does roll the shipment back;
 *  - whether restocking a return writes the movement it claims to, through the
 *    Phase 12 ledger;
 *  - whether two administrators approving at once produce one approval.
 *
 * So this runs the real service functions, in real transactions, on a real
 * replica set, and asserts the outcomes.
 *
 *   pnpm returns:verify
 *
 * ## Safety
 *
 * This points at whatever `MONGODB_URI` is configured, which may well be the
 * live Atlas database, so it is written to be safe there:
 *
 *  - Everything it creates is under a `ZYCART-P13-` SKU prefix, a
 *    `ZYC-P13-` order-number prefix and a `@zycart-p13.test` email domain.
 *    Nothing else in ZyCart uses any of them.
 *  - It never reads, edits or deletes a record it did not create.
 *  - It removes exactly its own records at the end, in a `finally`, so a failed
 *    run still cleans up — including the movements, audit rows, shipments and
 *    returns it caused.
 *  - There is no `deleteMany({})`, `dropDatabase`, `dropCollection` or
 *    `syncIndexes` anywhere in this file.
 *  - No refund is ever issued. Money is not moved by a verification script, so
 *    the gateway-facing half of the refund path is exercised by its unit tests
 *    and by the manual walkthrough recorded in `docs/phase-13.md`, not here.
 */

/**
 * Phase 14 gave the service entry points an `Env`, because a domain transition
 * that notifies a customer has to know which mail provider to hand the message
 * to. Loaded once here; `EMAIL_PROVIDER` defaults to `mock`, so this script
 * exercises the notification path end to end without a message leaving the
 * machine.
 */
const env = loadEnv();

const SKU_PREFIX = 'ZYCART-P13';
const SLUG_PREFIX = 'zycart-p13';
const ORDER_PREFIX = 'ZYC-P13';
const EMAIL_DOMAIN = 'zycart-p13.test';

/** A bcrypt-shaped placeholder. These accounts cannot be signed in to. */
const UNUSABLE_PASSWORD = '$2b$10$zycartp13verificationaccountnotsigninablexxxxxxxxxxxx';

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
  otherActor: AuditActor;
  otherActorId: Types.ObjectId;
  customerId: Types.ObjectId;
  intruderId: Types.ObjectId;
  categoryId: Types.ObjectId;
  brandId: Types.ObjectId;
  productIds: Types.ObjectId[];
  orderIds: Types.ObjectId[];
}

let sequence = 0;

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
    firstName: 'Phase13',
    lastName: 'Verifier',
    email: `admin@${EMAIL_DOMAIN}`,
    password: UNUSABLE_PASSWORD,
    role: 'ADMIN',
    isActive: true,
  });

  const second = await User.create({
    firstName: 'Phase13',
    lastName: 'Colleague',
    email: `admin2@${EMAIL_DOMAIN}`,
    password: UNUSABLE_PASSWORD,
    role: 'ADMIN',
    isActive: true,
  });

  const customer = await User.create({
    firstName: 'Phase13',
    lastName: 'Shopper',
    email: `shopper@${EMAIL_DOMAIN}`,
    password: UNUSABLE_PASSWORD,
    role: 'USER',
    isActive: true,
  });

  const intruder = await User.create({
    firstName: 'Phase13',
    lastName: 'Intruder',
    email: `intruder@${EMAIL_DOMAIN}`,
    password: UNUSABLE_PASSWORD,
    role: 'USER',
    isActive: true,
  });

  return {
    actor: { id: String(admin._id), name: 'Phase13 Verifier', email: `admin@${EMAIL_DOMAIN}` },
    actorId: admin._id,
    otherActor: {
      id: String(second._id),
      name: 'Phase13 Colleague',
      email: `admin2@${EMAIL_DOMAIN}`,
    },
    otherActorId: second._id,
    customerId: customer._id,
    intruderId: intruder._id,
    categoryId: category._id,
    brandId: brand._id,
    productIds: [],
    orderIds: [],
  };
}

async function makeProduct(fixtures: Fixtures, suffix: string, stock = 50) {
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
  return product;
}

interface OrderSpec {
  status?: 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED';
  deliveredAt?: Date | null;
  paid?: boolean;
  lines: { product: Awaited<ReturnType<typeof makeProduct>>; quantity: number }[];
}

/**
 * Builds an order directly, rather than through checkout.
 *
 * Deliberate: what is under test here is the return and shipment machinery, and
 * driving it through cart, address, checkout and payment would make every
 * failure ambiguous. The documents produced are the same shape `createOrder`
 * writes, including the Phase 13 counters.
 */
async function makeOrder(fixtures: Fixtures, spec: OrderSpec) {
  sequence += 1;

  const items = spec.lines.map((line) => ({
    product: line.product._id,
    productName: line.product.name,
    productSlug: line.product.slug,
    productImage: '',
    sku: line.product.sku,
    brand: `${SKU_PREFIX} Brand`,
    quantity: line.quantity,
    unitPrice: line.product.price,
    lineTotal: line.product.price * line.quantity,
    selectedColor: null,
    selectedSize: null,
    returnedQuantity: 0,
  }));

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  const order = await Order.create({
    orderNumber: `${ORDER_PREFIX}-${String(Date.now()).slice(-6)}-${String(sequence).padStart(3, '0')}`,
    user: fixtures.customerId,
    items,
    shippingAddress: {
      fullName: 'Phase13 Shopper',
      phone: '9000000000',
      addressLine1: '1 Verification Road',
      city: 'Surat',
      state: 'Gujarat',
      postalCode: '395007',
      country: 'India',
    },
    pricing: { subtotal, shipping: 0, discount: 0, tax: 0, total: subtotal },
    payment: {
      method: spec.paid ? 'RAZORPAY' : 'COD',
      status: spec.paid ? 'PAID' : 'PENDING',
      provider: spec.paid ? 'razorpay' : null,
      razorpayOrderId: spec.paid ? `order_p13${String(sequence).padStart(9, '0')}` : null,
      razorpayPaymentId: spec.paid ? `pay_p13${String(sequence).padStart(10, '0')}` : null,
      paidAt: spec.paid ? new Date() : null,
      refundedAmount: 0,
    },
    status: spec.status ?? 'DELIVERED',
    stockCommitted: true,
    deliveredAt:
      spec.deliveredAt !== undefined
        ? spec.deliveredAt
        : (spec.status ?? 'DELIVERED') === 'DELIVERED'
          ? new Date()
          : null,
  });

  fixtures.orderIds.push(order._id);
  return order;
}

async function removeFixtures(fixtures: Fixtures): Promise<void> {
  console.log('\nRemoving verification data…');

  const returnIds = (await ReturnRequest.find({ order: { $in: fixtures.orderIds } }).select('_id'))
    .map((row) => row._id);

  // Children first: every one of these points at something below it.
  await InventoryMovement.deleteMany({
    $or: [
      { product: { $in: fixtures.productIds } },
      { referenceType: 'RETURN', referenceId: { $in: returnIds } },
    ],
  });
  await AuditLog.deleteMany({ actor: { $in: [fixtures.actorId, fixtures.otherActorId] } });
  /**
   * Phase 14: the transitions above raise customer notifications, so this
   * script now creates delivery rows too. Removed by the entities they belong
   * to — orders this run created, and returns against them — so nothing
   * belonging to a real customer is matched.
   */
  await NotificationDelivery.deleteMany({
    entityId: { $in: [...fixtures.orderIds, ...returnIds] },
  });
  await Shipment.deleteMany({ order: { $in: fixtures.orderIds } });
  await ReturnRequest.deleteMany({ order: { $in: fixtures.orderIds } });
  await Order.deleteMany({ _id: { $in: fixtures.orderIds } });
  await Product.deleteMany({ _id: { $in: fixtures.productIds } });
  await Category.deleteOne({ _id: fixtures.categoryId });
  await Brand.deleteOne({ _id: fixtures.brandId });
  await User.deleteMany({
    _id: {
      $in: [fixtures.actorId, fixtures.otherActorId, fixtures.customerId, fixtures.intruderId],
    },
  });

  const leftovers =
    (await Product.countDocuments({ sku: new RegExp(`^${SKU_PREFIX}`) })) +
    (await Order.countDocuments({ orderNumber: new RegExp(`^${ORDER_PREFIX}`) }));

  console.log(`  ${leftovers === 0 ? 'clean' : `WARNING: ${String(leftovers)} record(s) remain`}`);
}

const heldFor = async (orderId: Types.ObjectId, index = 0): Promise<number> => {
  const order = await Order.findById(orderId).select('items');
  return order?.items[index]?.returnedQuantity ?? -1;
};

const stockOf = async (id: Types.ObjectId): Promise<number> =>
  (await Product.findById(id).select('stock'))?.stock ?? -1;

/* ---------------------------------------------------------------- */
/* Eligibility                                                       */
/* ---------------------------------------------------------------- */

async function verifyEligibility(fixtures: Fixtures): Promise<void> {
  section('Eligibility is decided by the server, against stored data');

  const product = await makeProduct(fixtures, 'Eligible');
  const customer = String(fixtures.customerId);

  const undelivered = await makeOrder(fixtures, {
    status: 'SHIPPED',
    lines: [{ product, quantity: 2 }],
  });

  await refuses(
    'refuses a return on an order that has not been delivered',
    () =>
      returns.createReturn(customer, undelivered.orderNumber, {
        items: [
          {
            orderItemId: String(undelivered.items[0]?._id),
            quantity: 1,
            reason: 'SIZE_ISSUE',
          },
        ],
      }),
    { status: 409, match: /delivered/i },
  );

  const undated = await makeOrder(fixtures, {
    status: 'DELIVERED',
    deliveredAt: null,
    lines: [{ product, quantity: 1 }],
  });

  await refuses(
    'refuses a return when no delivery date was ever recorded',
    () =>
      returns.createReturn(customer, undated.orderNumber, {
        items: [
          { orderItemId: String(undated.items[0]?._id), quantity: 1, reason: 'CHANGED_MIND' },
        ],
      }),
    { status: 409, match: /delivery dates|support/i },
  );

  const expired = await makeOrder(fixtures, {
    status: 'DELIVERED',
    deliveredAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    lines: [{ product, quantity: 1 }],
  });

  await refuses(
    'refuses a return after the window has closed',
    () =>
      returns.createReturn(customer, expired.orderNumber, {
        items: [{ orderItemId: String(expired.items[0]?._id), quantity: 1, reason: 'DAMAGED' }],
      }),
    { status: 409, match: /window/i },
  );

  const fresh = await makeOrder(fixtures, { lines: [{ product, quantity: 2 }] });

  await refuses(
    'refuses a line that is not on the order',
    () =>
      returns.createReturn(customer, fresh.orderNumber, {
        items: [
          { orderItemId: '507f1f77bcf86cd799439011', quantity: 1, reason: 'WRONG_ITEM' },
        ],
      }),
    { status: 400, match: /not part of this order/i },
  );

  await refuses(
    'refuses more units than were bought',
    () =>
      returns.createReturn(customer, fresh.orderNumber, {
        items: [{ orderItemId: String(fresh.items[0]?._id), quantity: 5, reason: 'WRONG_ITEM' }],
      }),
    { status: 409, match: /only 2/i },
  );

  await refuses(
    "refuses another customer's order outright",
    () =>
      returns.createReturn(String(fixtures.intruderId), fresh.orderNumber, {
        items: [{ orderItemId: String(fresh.items[0]?._id), quantity: 1, reason: 'DAMAGED' }],
      }),
    { status: 404, match: /not found/i },
  );
}

/* ---------------------------------------------------------------- */
/* Quantity accounting                                               */
/* ---------------------------------------------------------------- */

async function verifyQuantities(fixtures: Fixtures): Promise<void> {
  section('Returned quantity is held on the order and released honestly');

  const product = await makeProduct(fixtures, 'Quantity');
  const customer = String(fixtures.customerId);
  const order = await makeOrder(fixtures, { lines: [{ product, quantity: 3 }] });
  const lineId = String(order.items[0]?._id);

  const first = await returns.createReturn(customer, order.orderNumber, {
    items: [{ orderItemId: lineId, quantity: 2, reason: 'SIZE_ISSUE' }],
  });

  check('a request holds the units it asked for', (await heldFor(order._id)) === 2);

  await refuses(
    'refuses a second request that would exceed what is left',
    () =>
      returns.createReturn(customer, order.orderNumber, {
        items: [{ orderItemId: lineId, quantity: 2, reason: 'DAMAGED' }],
      }),
    { status: 409, match: /only 1/i },
  );

  const second = await returns.createReturn(customer, order.orderNumber, {
    items: [{ orderItemId: lineId, quantity: 1, reason: 'DAMAGED' }],
  });

  check('a second request may take the remainder', (await heldFor(order._id)) === 3);

  await refuses(
    'refuses a third request when nothing is left',
    () =>
      returns.createReturn(customer, order.orderNumber, {
        items: [{ orderItemId: lineId, quantity: 1, reason: 'OTHER' }],
      }),
    { status: 409, match: /already been requested/i },
  );

  await returns.cancelReturn(customer, second.returnNumber);
  check('withdrawing a request releases its units', (await heldFor(order._id)) === 2);

  await returns.rejectReturn(
    first.returnNumber,
    { resolutionNote: 'These were worn, so we cannot take them back.' },
    fixtures.actor,
  );
  check('rejecting a request releases its units', (await heldFor(order._id)) === 0);

  const third = await returns.createReturn(customer, order.orderNumber, {
    items: [{ orderItemId: lineId, quantity: 3, reason: 'DEFECTIVE' }],
  });

  await returns.approveReturn(
    env,
    third.returnNumber,
    { items: [{ orderItemId: lineId, approvedQuantity: 1 }] },
    fixtures.actor,
  );

  check('approving fewer units releases the difference', (await heldFor(order._id)) === 1);

  const reloaded = await returns.getAdminReturn(third.returnNumber);
  check('the request still records what was asked for', reloaded.items[0]?.requestedQuantity === 3);
  check('and separately what was agreed', reloaded.items[0]?.approvedQuantity === 1);

  await refuses(
    'refuses approving more than was requested',
    async () => {
      const another = await returns.createReturn(customer, order.orderNumber, {
        items: [{ orderItemId: lineId, quantity: 1, reason: 'OTHER' }],
      });
      return returns.approveReturn(
        env,
        another.returnNumber,
        { items: [{ orderItemId: lineId, approvedQuantity: 9 }] },
        fixtures.actor,
      );
    },
    { status: 400, match: /more of/i },
  );
}

/* ---------------------------------------------------------------- */
/* Concurrency                                                       */
/* ---------------------------------------------------------------- */

async function verifyConcurrency(fixtures: Fixtures): Promise<void> {
  section('Races resolve to exactly one winner');

  const customer = String(fixtures.customerId);

  /**
   * Two tabs, one returnable unit.
   *
   * This is the scenario the `returnedQuantity` counter exists for. Both calls
   * read a remaining quantity of 1 and both try to take it; the array filter
   * inside the update is what makes only one succeed.
   */
  const productA = await makeProduct(fixtures, 'RaceQty');
  const orderA = await makeOrder(fixtures, { lines: [{ product: productA, quantity: 1 }] });
  const lineA = String(orderA.items[0]?._id);

  const attempts = await Promise.allSettled([
    returns.createReturn(customer, orderA.orderNumber, {
      items: [{ orderItemId: lineA, quantity: 1, reason: 'SIZE_ISSUE' }],
    }),
    returns.createReturn(customer, orderA.orderNumber, {
      items: [{ orderItemId: lineA, quantity: 1, reason: 'DAMAGED' }],
    }),
  ]);

  const won = attempts.filter((result) => result.status === 'fulfilled').length;

  check(
    'two simultaneous requests for the last unit: exactly one succeeds',
    won === 1,
    `${String(won)} succeeded`,
  );
  check('and the order holds exactly one unit', (await heldFor(orderA._id)) === 1);
  check(
    'and only one request exists',
    (await ReturnRequest.countDocuments({ order: orderA._id })) === 1,
  );

  /**
   * Two administrators, one return.
   *
   * The losing transaction either finds the status already moved or hits a
   * write conflict and is retried into finding it moved. Either way one
   * approval, one audit row.
   */
  const productB = await makeProduct(fixtures, 'RaceApprove');
  const orderB = await makeOrder(fixtures, { lines: [{ product: productB, quantity: 2 }] });
  const lineB = String(orderB.items[0]?._id);

  const request = await returns.createReturn(customer, orderB.orderNumber, {
    items: [{ orderItemId: lineB, quantity: 2, reason: 'DEFECTIVE' }],
  });

  const approvals = await Promise.allSettled([
    returns.approveReturn(env, request.returnNumber, {}, fixtures.actor),
    returns.approveReturn(env, request.returnNumber, {}, fixtures.otherActor),
  ]);

  const approved = approvals.filter((result) => result.status === 'fulfilled').length;

  check(
    'two administrators approving at once: exactly one succeeds',
    approved === 1,
    `${String(approved)} succeeded`,
  );

  const approvalRows = await AuditLog.countDocuments({
    action: 'RETURN_APPROVED',
    entityLabel: request.returnNumber,
  });

  check('and exactly one audit row was written', approvalRows === 1, `got ${String(approvalRows)}`);
  check('and the held quantity did not double', (await heldFor(orderB._id)) === 2);

  /**
   * Two withdrawals of the same request.
   *
   * The release must not run twice, or the counter would go below what other
   * requests are holding.
   */
  const productC = await makeProduct(fixtures, 'RaceCancel');
  const orderC = await makeOrder(fixtures, { lines: [{ product: productC, quantity: 2 }] });
  const lineC = String(orderC.items[0]?._id);

  const withdrawable = await returns.createReturn(customer, orderC.orderNumber, {
    items: [{ orderItemId: lineC, quantity: 2, reason: 'CHANGED_MIND' }],
  });

  const withdrawals = await Promise.allSettled([
    returns.cancelReturn(customer, withdrawable.returnNumber),
    returns.cancelReturn(customer, withdrawable.returnNumber),
  ]);

  const withdrawn = withdrawals.filter((result) => result.status === 'fulfilled').length;

  check(
    'two simultaneous withdrawals: exactly one succeeds',
    withdrawn === 1,
    `${String(withdrawn)} succeeded`,
  );
  check('and the units are released exactly once', (await heldFor(orderC._id)) === 0);
}

/* ---------------------------------------------------------------- */
/* Inventory                                                         */
/* ---------------------------------------------------------------- */

async function verifyInventoryInteraction(fixtures: Fixtures): Promise<void> {
  section('Receiving a return respects Phase 12 stock authority');

  const customer = String(fixtures.customerId);

  /* Not resellable: nothing moves. */
  const damaged = await makeProduct(fixtures, 'Damaged', 40);
  const damagedOrder = await makeOrder(fixtures, { lines: [{ product: damaged, quantity: 2 }] });

  const damagedReturn = await returns.createReturn(customer, damagedOrder.orderNumber, {
    items: [{ orderItemId: String(damagedOrder.items[0]?._id), quantity: 2, reason: 'DAMAGED' }],
  });

  await returns.approveReturn(env, damagedReturn.returnNumber, {}, fixtures.actor);
  await returns.receiveReturn(
    damagedReturn.returnNumber,
    { resellable: false, adminNote: 'Both pairs scuffed.' },
    fixtures.actor,
  );

  check('unsellable goods do not increase stock', (await stockOf(damaged._id)) === 40);
  check(
    'and write no inventory movement',
    (await InventoryMovement.countDocuments({
      referenceType: 'RETURN',
      referenceId: new Types.ObjectId(damagedReturn.id),
    })) === 0,
  );

  /* Resellable: stock moves, through the ledger. */
  const good = await makeProduct(fixtures, 'Resellable', 40);
  const goodOrder = await makeOrder(fixtures, { lines: [{ product: good, quantity: 3 }] });

  const goodReturn = await returns.createReturn(customer, goodOrder.orderNumber, {
    items: [{ orderItemId: String(goodOrder.items[0]?._id), quantity: 3, reason: 'SIZE_ISSUE' }],
  });

  await returns.approveReturn(env, goodReturn.returnNumber, {}, fixtures.actor);
  const received = await returns.receiveReturn(
    goodReturn.returnNumber,
    { resellable: true },
    fixtures.actor,
  );

  check('resellable goods go back into stock', (await stockOf(good._id)) === 43);
  check('and the return records that it restocked', received.restocked === true);

  const movements = await InventoryMovement.find({
    referenceType: 'RETURN',
    referenceId: new Types.ObjectId(goodReturn.id),
  });

  check('exactly one movement was written', movements.length === 1, `got ${movements.length}`);
  check('typed RETURN, not CANCELLATION', movements[0]?.type === 'RETURN');
  check('with the right sign and size', movements[0]?.quantityChange === 3);
  check(
    'and arithmetic that checks out',
    movements[0] !== undefined &&
      movements[0].quantityBefore + movements[0].quantityChange === movements[0].quantityAfter,
  );
  check('naming the return it came from', movements[0]?.referenceLabel === goodReturn.returnNumber);

  await refuses(
    'refuses to receive a return twice',
    () => returns.receiveReturn(goodReturn.returnNumber, { resellable: true }, fixtures.actor),
    { status: 409, match: /already received/i },
  );

  check('and stock did not move again', (await stockOf(good._id)) === 43);
}

/* ---------------------------------------------------------------- */
/* Shipments                                                         */
/* ---------------------------------------------------------------- */

async function verifyShipments(fixtures: Fixtures): Promise<void> {
  section('Shipment state and order state never contradict each other');

  const product = await makeProduct(fixtures, 'Parcel');

  const pending = await makeOrder(fixtures, {
    status: 'CONFIRMED',
    lines: [{ product, quantity: 1 }],
  });
  await Order.updateOne({ _id: pending._id }, { $set: { status: 'PENDING' } });

  await refuses(
    'refuses a shipment for an unconfirmed order',
    () => shipments.createShipment(pending.orderNumber, {}, fixtures.actor),
    { status: 409, match: /not been confirmed/i },
  );

  const order = await makeOrder(fixtures, {
    status: 'PROCESSING',
    lines: [{ product, quantity: 1 }],
  });

  const created = await shipments.createShipment(
    order.orderNumber,
    { carrier: 'Verification Courier', trackingNumber: 'P13-TRACK-001' },
    fixtures.actor,
  );

  check('a new parcel starts ready to ship', created.status === 'READY_TO_SHIP');
  check('and records no dispatch date it does not have', created.shippedAt === null);
  check('and no estimate it was not given', created.estimatedDeliveryAt === null);

  await refuses(
    'refuses a second shipment for the same order',
    () => shipments.createShipment(order.orderNumber, {}, fixtures.actor),
    { status: 409, match: /already has a shipment/i },
  );

  await refuses(
    'refuses an illegal shipment transition',
    () =>
      shipments.advanceShipment(env, order.orderNumber, { status: 'OUT_FOR_DELIVERY' }, fixtures.actor),
    { status: 409, match: /cannot be moved/i },
  );

  const shipped = await shipments.advanceShipment(
    env,
    order.orderNumber,
    { status: 'SHIPPED' },
    fixtures.actor,
  );

  check('dispatching records when it happened', shipped.shippedAt !== null);
  check(
    'and carries the order to shipped',
    (await Order.findById(order._id))?.status === 'SHIPPED',
  );

  await shipments.advanceShipment(env, order.orderNumber, { status: 'IN_TRANSIT' }, fixtures.actor);
  check(
    'in transit leaves the order shipped',
    (await Order.findById(order._id))?.status === 'SHIPPED',
  );

  await shipments.advanceShipment(
    env,
    order.orderNumber,
    { status: 'EXCEPTION', note: 'Nobody home.' },
    fixtures.actor,
  );
  check(
    'an exception leaves the order shipped',
    (await Order.findById(order._id))?.status === 'SHIPPED',
  );

  const delivered = await shipments.advanceShipment(
    env,
    order.orderNumber,
    { status: 'DELIVERED' },
    fixtures.actor,
  );

  const afterDelivery = await Order.findById(order._id);

  check('delivery records when it happened', delivered.deliveredAt !== null);
  check('and carries the order to delivered', afterDelivery?.status === 'DELIVERED');
  check('and stamps the order delivery date', afterDelivery?.deliveredAt !== null);

  await refuses(
    'refuses to move a delivered parcel backwards',
    () => shipments.advanceShipment(env, order.orderNumber, { status: 'IN_TRANSIT' }, fixtures.actor),
    { status: 409, match: /cannot be moved/i },
  );

  /* The other door: the order moves first, and the parcel follows. */
  const viaOrder = await makeOrder(fixtures, {
    status: 'PROCESSING',
    lines: [{ product, quantity: 1 }],
  });

  await shipments.createShipment(viaOrder.orderNumber, { carrier: 'Other' }, fixtures.actor);

  await setOrderStatus(env, viaOrder.orderNumber, 'SHIPPED', undefined, fixtures.actor);

  const followed = await Shipment.findOne({ order: viaOrder._id });

  check('marking the order shipped carries the parcel with it', followed?.status === 'SHIPPED');
  check('and gives it a dispatch time', followed?.shippedAt !== null);

  /* Cancelling an order cancels its parcel. */
  const cancelled = await makeOrder(fixtures, {
    status: 'CONFIRMED',
    lines: [{ product, quantity: 1 }],
  });

  await shipments.createShipment(cancelled.orderNumber, {}, fixtures.actor);
  await setOrderStatus(env, cancelled.orderNumber, 'CANCELLED', 'Verification', fixtures.actor);

  const cancelledParcel = await Shipment.findOne({ order: cancelled._id });
  check('cancelling an order cancels its parcel', cancelledParcel?.status === 'CANCELLED');
}

/* ---------------------------------------------------------------- */
/* Refund guards (no money is moved)                                 */
/* ---------------------------------------------------------------- */

async function verifyRefundGuards(fixtures: Fixtures): Promise<void> {
  section('Refunds are refused where they should be, before any money moves');

  const customer = String(fixtures.customerId);
  const product = await makeProduct(fixtures, 'Refund');

  /* Cash on delivery: nothing captured, so nothing to reverse. */
  const cod = await makeOrder(fixtures, { lines: [{ product, quantity: 1 }] });
  const codReturn = await returns.createReturn(customer, cod.orderNumber, {
    items: [{ orderItemId: String(cod.items[0]?._id), quantity: 1, reason: 'CHANGED_MIND' }],
  });

  await returns.approveReturn(env, codReturn.returnNumber, {}, fixtures.actor);
  await returns.receiveReturn(codReturn.returnNumber, { resellable: true }, fixtures.actor);

  const codDetail = await returns.getAdminReturn(codReturn.returnNumber);
  check('a cash order reports why it cannot be refunded', codDetail.refundPlan.blocker === 'COD_ORDER');
  check('and still computes what it would be worth', codDetail.refundPlan.amount === 1000);

  await refuses(
    'refuses to refund a cash-on-delivery order',
    () => issueReturnRefund({} as never, codReturn.returnNumber, fixtures.actor),
    { status: 409, match: /cash on delivery/i },
  );

  /* Paid, but the goods are not back yet. */
  const paid = await makeOrder(fixtures, { paid: true, lines: [{ product, quantity: 2 }] });
  const paidReturn = await returns.createReturn(customer, paid.orderNumber, {
    items: [{ orderItemId: String(paid.items[0]?._id), quantity: 1, reason: 'SIZE_ISSUE' }],
  });

  await refuses(
    'refuses to refund before the goods are received',
    () => issueReturnRefund({} as never, paidReturn.returnNumber, fixtures.actor),
    { status: 409, match: /received/i },
  );

  await returns.approveReturn(env, paidReturn.returnNumber, {}, fixtures.actor);

  const plan = await returns.getAdminReturn(paidReturn.returnNumber);
  check('a paid order prices the refund from the order snapshot', plan.refundPlan.amount === 1000);
  check('and caps it at what is left on the order', plan.refundPlan.remainingOnOrder === 2000);

  /* Already fully refunded elsewhere: nothing left. */
  await Order.updateOne({ _id: paid._id }, { $set: { 'payment.refundedAmount': 2000 } });

  const exhausted = await returns.getAdminReturn(paidReturn.returnNumber);
  check(
    'an already-refunded order reports nothing is left',
    exhausted.refundPlan.blocker === 'NOTHING_LEFT',
  );
}

/* ---------------------------------------------------------------- */
/* Ledger consistency                                                */
/* ---------------------------------------------------------------- */

async function verifyLedgerConsistency(fixtures: Fixtures): Promise<void> {
  section("The order's held quantity agrees with the returns that hold it");

  const { HOLDING_STATUSES } = returns;

  for (const orderId of fixtures.orderIds) {
    const order = await Order.findById(orderId).select('orderNumber items');
    if (!order) continue;

    const requests = await ReturnRequest.find({
      order: orderId,
      status: { $in: HOLDING_STATUSES },
    });

    const expected = new Map<string, number>();

    for (const request of requests) {
      for (const item of request.items) {
        const key = String(item.orderItemId);
        const held = item.approvedQuantity ?? item.requestedQuantity;
        expected.set(key, (expected.get(key) ?? 0) + held);
      }
    }

    for (const item of order.items) {
      const key = String(item._id);
      const stored = item.returnedQuantity ?? 0;
      const derived = expected.get(key) ?? 0;

      if (stored !== derived) {
        check(
          `${order.orderNumber} line ${key} counter matches its returns`,
          false,
          `stored ${String(stored)}, derived ${String(derived)}`,
        );
        return;
      }

      if (stored > item.quantity) {
        check(`${order.orderNumber} line ${key} never exceeds what was bought`, false);
        return;
      }
    }
  }

  check('every order counter matches the returns holding it', true);
  check('and no counter exceeds the quantity bought', true);
}

/* ---------------------------------------------------------------- */

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await connectDatabase(uri);
  console.log(`Database: ${mongoose.connection.name}`);
  console.log('Creating temporary verification data…');

  const fixtures = await createFixtures();

  try {
    await verifyEligibility(fixtures);
    await verifyQuantities(fixtures);
    await verifyConcurrency(fixtures);
    await verifyInventoryInteraction(fixtures);
    await verifyShipments(fixtures);
    await verifyRefundGuards(fixtures);
    await verifyLedgerConsistency(fixtures);
  } finally {
    await removeFixtures(fixtures);
  }

  console.log(`\n${passed} passed, ${failed} failed`);

  if (failed > 0) throw new Error(`${failed} check(s) failed`);
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('\nVerification failed:', error instanceof Error ? error.message : error);
    void mongoose.disconnect().finally(() => process.exit(1));
  });
