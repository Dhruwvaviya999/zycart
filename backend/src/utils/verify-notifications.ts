import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database';
import { loadEnv, type Env } from '../config/env';
import { MAX_AUTOMATIC_ATTEMPTS, STALE_SENDING_MS } from '../config/notifications';
import { AuditLog } from '../models/audit-log.model';
import { Brand } from '../models/brand.model';
import { Category } from '../models/category.model';
import { InventoryMovement } from '../models/inventory-movement.model';
import {
  NotificationDelivery,
  type NotificationEvent,
} from '../models/notification-delivery.model';
import { Order } from '../models/order.model';
import { Product } from '../models/product.model';
import { ReturnRequest } from '../models/return.model';
import { Shipment } from '../models/shipment.model';
import { User } from '../models/user.model';
import type { AuditActor } from '../services/admin/audit.service';
import * as shipments from '../services/fulfillment/shipment.service';
import {
  capturedEmails,
  clearForcedFailures,
  failNextSends,
  resetCapturedEmails,
} from '../services/notifications/mock.provider';
import { drainNotifications } from '../services/notifications/drain';
import {
  getNotification,
  retryNotification,
} from '../services/notifications/notification.service';
import { setOrderStatus, transitionOrderStatus } from '../services/order.service';
import { applyRefundOutcome } from '../services/returns/refund.service';
import * as returns from '../services/returns/return.service';
import { AppError } from './AppError';

/**
 * Exercises Phase 14 against a real MongoDB.
 *
 * ## What this covers that the unit suite cannot
 *
 * `tests/notifications.test.ts` covers every rule that can be decided without a
 * database — escaping, template output, failure classification, configuration.
 * What it cannot cover is the part that only exists *because* there is a
 * database and a replica set:
 *
 *  - whether the notification is created in the **same transaction** as the
 *    business change, so that a rolled-back shipment leaves no message behind;
 *  - whether a duplicate event — a repeated webhook, a second click, a retried
 *    request — produces one delivery record or two;
 *  - what two genuinely concurrent transitions do to one idempotency key;
 *  - what two administrators pressing Retry at the same instant actually send;
 *  - whether a provider failure leaves the commerce operation intact.
 *
 * So this runs the real service functions, in real transactions, on a real
 * replica set, and asserts the outcomes.
 *
 *   pnpm notifications:verify
 *
 * ## Safety
 *
 * This points at whatever `MONGODB_URI` is configured, which may well be the
 * live Atlas database, so it is written to be safe there:
 *
 *  - Everything it creates is under a `ZYCART-P14-` SKU prefix, a `ZYC-P14-`
 *    order-number prefix and a `@zycart-p14.test` email domain. Nothing else in
 *    ZyCart uses any of them.
 *  - It never reads, edits or deletes a record it did not create.
 *  - It removes exactly its own records at the end, in a `finally`, so a failed
 *    run still cleans up — including the delivery records it caused.
 *  - There is no `deleteMany({})`, `dropDatabase`, `dropCollection` or
 *    `syncIndexes` anywhere in this file.
 *  - **No email is ever sent.** The run refuses to start unless the configured
 *    provider is `mock`, which captures messages to an array. That check is at
 *    the top of `main` and is not optional: a verification script that mailed
 *    real customers because somebody ran it against a production `.env` would
 *    be an unrecoverable mistake.
 *  - No refund is ever issued at the gateway. The refund-completed path is
 *    driven through `applyRefundOutcome`, which is the function the
 *    `refund.processed` webhook itself calls — so the real path is exercised
 *    without money moving.
 */

const SKU_PREFIX = 'ZYCART-P14';
const SLUG_PREFIX = 'zycart-p14';
const ORDER_PREFIX = 'ZYC-P14';
const EMAIL_DOMAIN = 'zycart-p14.test';

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
  namelessId: Types.ObjectId;
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
    firstName: 'Phase14',
    lastName: 'Verifier',
    email: `admin@${EMAIL_DOMAIN}`,
    role: 'ADMIN',
    isActive: true,
  });

  const second = await User.create({
    firstName: 'Phase14',
    lastName: 'Colleague',
    email: `admin2@${EMAIL_DOMAIN}`,
    role: 'ADMIN',
    isActive: true,
  });

  /**
   * A customer whose name is an injection attempt.
   *
   * A shopper controls their own first name, so this is the most realistic
   * stored-XSS vector in the whole system — and it is carried all the way
   * through a real transition, a real delivery record and a real render rather
   * than being handed straight to the template.
   */
  const customer = await User.create({
    firstName: '<img src=x onerror=alert(1)>',
    lastName: 'Shopper',
    email: `shopper@${EMAIL_DOMAIN}`,
    role: 'USER',
    isActive: true,
  });

  const nameless = await User.create({
    firstName: 'A',
    lastName: 'B',
    email: `nameless@${EMAIL_DOMAIN}`,
    role: 'USER',
    isActive: true,
  });

  return {
    actor: { id: String(admin._id), name: 'Phase14 Verifier', email: `admin@${EMAIL_DOMAIN}` },
    actorId: admin._id,
    otherActor: {
      id: String(second._id),
      name: 'Phase14 Colleague',
      email: `admin2@${EMAIL_DOMAIN}`,
    },
    otherActorId: second._id,
    customerId: customer._id,
    namelessId: nameless._id,
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
  user?: Types.ObjectId;
  lines: { product: Awaited<ReturnType<typeof makeProduct>>; quantity: number }[];
}

/**
 * Builds an order directly, rather than through checkout.
 *
 * Deliberate, and for the same reason Phase 13's script did it: what is under
 * test is the notification machinery, and driving it through cart, address,
 * checkout and payment would make every failure ambiguous.
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
    user: spec.user ?? fixtures.customerId,
    items,
    shippingAddress: {
      fullName: 'Phase14 Shopper',
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
      razorpayOrderId: spec.paid ? `order_p14${String(sequence).padStart(9, '0')}` : null,
      razorpayPaymentId: spec.paid ? `pay_p14${String(sequence).padStart(10, '0')}` : null,
      paidAt: spec.paid ? new Date() : null,
      refundedAmount: 0,
    },
    status: spec.status ?? 'PROCESSING',
    stockCommitted: true,
    deliveredAt:
      spec.deliveredAt !== undefined
        ? spec.deliveredAt
        : (spec.status ?? 'PROCESSING') === 'DELIVERED'
          ? new Date()
          : null,
  });

  fixtures.orderIds.push(order._id);
  return order;
}

async function removeFixtures(fixtures: Fixtures): Promise<void> {
  console.log('\nRemoving verification data…');

  const returnIds = (
    await ReturnRequest.find({ order: { $in: fixtures.orderIds } }).select('_id')
  ).map((row) => row._id);

  // Children first: every one of these points at something below it.
  await NotificationDelivery.deleteMany({
    entityId: { $in: [...fixtures.orderIds, ...returnIds] },
  });
  await InventoryMovement.deleteMany({
    $or: [
      { product: { $in: fixtures.productIds } },
      { referenceType: 'RETURN', referenceId: { $in: returnIds } },
    ],
  });
  await AuditLog.deleteMany({ actor: { $in: [fixtures.actorId, fixtures.otherActorId] } });
  await Shipment.deleteMany({ order: { $in: fixtures.orderIds } });
  await ReturnRequest.deleteMany({ order: { $in: fixtures.orderIds } });
  await Order.deleteMany({ _id: { $in: fixtures.orderIds } });
  await Product.deleteMany({ _id: { $in: fixtures.productIds } });
  await Category.deleteOne({ _id: fixtures.categoryId });
  await Brand.deleteOne({ _id: fixtures.brandId });
  await User.deleteMany({
    _id: {
      $in: [fixtures.actorId, fixtures.otherActorId, fixtures.customerId, fixtures.namelessId],
    },
  });

  /**
   * Anchored on the trailing hyphen this script's own references carry.
   *
   * `ZYC-P14` without it also matches `ZYC-P14B-001`, which belongs to a
   * different fixture set entirely — and a cleanup check that reports somebody
   * else's data as a leak is a check people learn to ignore.
   *
   * Return-keyed deliveries are not counted here: return numbers are generated
   * by `generateReturnNumber` and carry no prefix of this script's choosing, so
   * they are removed by entity id above and have no signature to count.
   */
  const leftovers =
    (await Product.countDocuments({ sku: new RegExp(`^${SKU_PREFIX}-`) })) +
    (await Order.countDocuments({ orderNumber: new RegExp(`^${ORDER_PREFIX}-`) })) +
    (await NotificationDelivery.countDocuments({
      entityLabel: new RegExp(`^${ORDER_PREFIX}-`),
    }));

  console.log(`  ${leftovers === 0 ? 'clean' : `WARNING: ${String(leftovers)} record(s) remain`}`);
}

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

const deliveriesFor = (entityId: Types.ObjectId, event?: NotificationEvent) =>
  NotificationDelivery.find({ entityId, ...(event ? { event } : {}) });

const countFor = (entityId: Types.ObjectId, event?: NotificationEvent) =>
  NotificationDelivery.countDocuments({ entityId, ...(event ? { event } : {}) });

const deliveryFor = (entityId: Types.ObjectId, event: NotificationEvent) =>
  NotificationDelivery.findOne({ entityId, event });

/* ---------------------------------------------------------------- */
/* 1 · Transactional creation                                        */
/* ---------------------------------------------------------------- */

/**
 * §125: marking an order shipped must leave the order, the parcel, the audit
 * row and the notification all committed together.
 */
async function verifyTransactionalCreation(env: Env, fixtures: Fixtures): Promise<void> {
  section('Domain state and the notification commit together');

  const product = await makeProduct(fixtures, 'Ship');
  const order = await makeOrder(fixtures, { lines: [{ product, quantity: 2 }] });

  await shipments.createShipment(
    order.orderNumber,
    {
      carrier: 'Verification Courier',
      trackingNumber: 'P14-TRACK-001',
      trackingUrl: 'https://track.example.test/P14-TRACK-001',
    },
    fixtures.actor,
  );

  resetCapturedEmails();

  await shipments.advanceShipment(env, order.orderNumber, { status: 'SHIPPED' }, fixtures.actor);

  const reloaded = await Order.findById(order._id);
  const parcel = await Shipment.findOne({ order: order._id });
  const audits = await AuditLog.countDocuments({
    entityId: order._id,
    action: 'ORDER_STATUS_CHANGED',
  });

  check('the order reached SHIPPED', reloaded?.status === 'SHIPPED');
  check('the parcel reached SHIPPED', parcel?.status === 'SHIPPED');
  check('the transition was audited', audits === 1);
  check('exactly one shipped notification exists', (await countFor(order._id, 'ORDER_SHIPPED')) === 1);

  const delivery = await deliveryFor(order._id, 'ORDER_SHIPPED');

  check('it is keyed by event and order number', delivery?.key === `ORDER_SHIPPED:${order.orderNumber}`);
  check('the recipient came from the account, not the request', delivery?.recipientEmail === `shopper@${EMAIL_DOMAIN}`);
  check('it names the template and its version', delivery?.template === 'order-shipped' && delivery.templateVersion === 1);
  check('it stores the payload needed for a deterministic retry', delivery?.payload !== null && delivery?.payload !== undefined);
  check('it stores no rendered HTML body', !JSON.stringify(delivery?.payload ?? {}).includes('<!doctype'));

  /* Delivery was attempted after the commit, and the mock captured it. */
  check('the message was accepted by the provider', delivery?.status === 'SENT');
  check('on the first attempt', delivery?.attempts === 1);
  check('and the provider was recorded', delivery?.provider === 'mock');
  check('with the provider message id kept', typeof delivery?.providerMessageId === 'string');

  const sent = capturedEmails().at(-1);

  check('one message was captured', capturedEmails().length === 1);
  check('addressed to the account', sent?.to === `shopper@${EMAIL_DOMAIN}`);
  check('with the shipped subject', sent?.subject === `Your ZyCart order ${order.orderNumber} has shipped`);
  check('carrying the real tracking number', sent?.html.includes('P14-TRACK-001') === true);
  check('and the real tracking link', sent?.html.includes('https://track.example.test/P14-TRACK-001') === true);

  /**
   * §51 end to end: the customer's own name is an injection attempt, and it has
   * now been through a real transaction, a stored payload and a real render.
   */
  check('a malicious customer name is escaped in the real message', sent?.html.includes('<img') === false);
  check('and appears as visible text instead', sent?.html.includes('&lt;img src=x onerror=alert(1)&gt;') === true);
  check('the plain-text alternative exists', (sent?.text.length ?? 0) > 0);
  check('nothing rendered as undefined', sent?.html.includes('undefined') === false);

  /* §20 · the same transition again must not produce a second message. */
  await refuses(
    'refuses a repeated shipped transition',
    () => shipments.advanceShipment(env, order.orderNumber, { status: 'SHIPPED' }, fixtures.actor),
    { status: 409 },
  );

  check('still exactly one shipped notification', (await countFor(order._id, 'ORDER_SHIPPED')) === 1);
  check('and still one captured message', capturedEmails().length === 1);

  /* §87 · an exception is not a dispatch. */
  await shipments.advanceShipment(
    env,
    order.orderNumber,
    { status: 'EXCEPTION', note: 'Nobody home.' },
    fixtures.actor,
  );

  check('an exception raises no notification at all', (await countFor(order._id)) === 1);

  /* §80 · delivery raises exactly one, and a different one. */
  resetCapturedEmails();

  await shipments.advanceShipment(env, order.orderNumber, { status: 'DELIVERED' }, fixtures.actor);

  check('exactly one delivered notification exists', (await countFor(order._id, 'ORDER_DELIVERED')) === 1);
  check('two notifications in total for this order', (await countFor(order._id)) === 2);

  const deliveredMail = capturedEmails().at(-1);

  check('the delivered message was sent', deliveredMail?.template === 'order-delivered');
  check('it offers a return, because this order is returnable', deliveredMail?.html.includes('Start a return') === true);
  check('and links at the returns anchor on the order page', deliveredMail?.html.includes('/account/orders/') === true);
}

/* ---------------------------------------------------------------- */
/* 2 · The other door into SHIPPED                                   */
/* ---------------------------------------------------------------- */

/**
 * §21: the event has to follow the business transition, not one particular
 * screen. An operator who marks an order shipped from the order page must
 * produce the same message as one who advances the parcel.
 */
async function verifyBothDoors(env: Env, fixtures: Fixtures): Promise<void> {
  section('Both routes into a transition raise the same event');

  const product = await makeProduct(fixtures, 'ViaOrder');
  const order = await makeOrder(fixtures, { lines: [{ product, quantity: 1 }] });

  resetCapturedEmails();

  await setOrderStatus(env, order.orderNumber, 'SHIPPED', undefined, fixtures.actor);

  check('marking the order shipped raises the event', (await countFor(order._id, 'ORDER_SHIPPED')) === 1);
  check('and the message was sent', capturedEmails().length === 1);

  const delivery = await deliveryFor(order._id, 'ORDER_SHIPPED');

  check('with no carrier invented for an order that has no parcel', JSON.stringify(delivery?.payload).includes('"carrier":""'));

  const mail = capturedEmails().at(-1);

  check('the message mentions no carrier', mail?.html.includes('Carrier') === false);
  check('and no tracking number', mail?.html.includes('Tracking number') === false);
  check('and no estimated delivery date', mail?.html.includes('Estimated delivery') === false);
  check('but still links to the order', mail?.html.includes(`/account/orders/${order.orderNumber}`) === true);
}

/* ---------------------------------------------------------------- */
/* 3 · Returns and refunds                                           */
/* ---------------------------------------------------------------- */

async function verifyReturnEvents(env: Env, fixtures: Fixtures): Promise<void> {
  section('Return approval and refund completion');

  const product = await makeProduct(fixtures, 'Return');
  const order = await makeOrder(fixtures, {
    status: 'DELIVERED',
    paid: true,
    lines: [{ product, quantity: 2 }],
  });

  const lineId = String(order.items[0]?._id);

  const request = await returns.createReturn(String(fixtures.customerId), order.orderNumber, {
    items: [{ orderItemId: lineId, quantity: 2, reason: 'DAMAGED' }],
  });

  check('creating a return raises nothing', (await countFor(new Types.ObjectId(request.id))) === 0);

  resetCapturedEmails();

  await returns.approveReturn(
    env,
    request.returnNumber,
    {
      items: [{ orderItemId: lineId, approvedQuantity: 1 }],
      resolutionNote: 'Send back the damaged one.',
      adminNote: 'INTERNAL: customer has returned twice this month.',
    },
    fixtures.actor,
  );

  const returnId = new Types.ObjectId(request.id);

  check('approving raises exactly one notification', (await countFor(returnId, 'RETURN_APPROVED')) === 1);

  const approvedMail = capturedEmails().at(-1);

  check('the approval message was sent', approvedMail?.template === 'return-approved');
  check('it quotes the approved quantity, not the requested one', approvedMail?.text.includes('x1') === true);
  check('it carries the customer-facing note', approvedMail?.html.includes('Send back the damaged one.') === true);
  /* §42 · the internal note must never reach a customer. */
  check('and never the internal note', approvedMail?.html.includes('INTERNAL') === false);
  check('nor in the plain-text part', approvedMail?.text.includes('INTERNAL') === false);

  /* §20 · approving again is refused and raises nothing further. */
  await refuses(
    'refuses a second approval',
    () => returns.approveReturn(env, request.returnNumber, {}, fixtures.actor),
    { status: 409 },
  );

  check('still exactly one approval notification', (await countFor(returnId, 'RETURN_APPROVED')) === 1);

  /* §86 · a rejection is a different message, and Phase 14 does not send one. */
  const other = await returns.createReturn(String(fixtures.customerId), order.orderNumber, {
    items: [{ orderItemId: lineId, quantity: 1, reason: 'CHANGED_MIND' }],
  });

  await returns.rejectReturn(
    other.returnNumber,
    { resolutionNote: 'These were worn.' },
    fixtures.actor,
  );

  check('rejecting raises no notification', (await countFor(new Types.ObjectId(other.id))) === 0);

  /* Receive, so the refund path can be driven. */
  await returns.receiveReturn(
    request.returnNumber,
    { resellable: false },
    fixtures.actor,
  );

  check('receiving raises no notification', (await countFor(returnId)) === 1);

  /**
   * §82 · the refund-completed message must come from the actual
   * refund-completion path.
   *
   * `applyRefundOutcome` is the function the `refund.processed` webhook calls,
   * so driving it here exercises the real path without touching the gateway.
   * The return is moved into REFUND_PENDING with a refund id first, exactly as
   * `issueReturnRefund` would have left it.
   */
  await ReturnRequest.updateOne(
    { _id: returnId },
    {
      $set: {
        status: 'REFUND_PENDING',
        'refund.claimedAt': new Date(),
        'refund.amount': 1000,
        'refund.razorpayRefundId': `rfnd_p14${String(sequence).padStart(9, '0')}`,
        'refund.initiatedAt': new Date(),
      },
    },
  );

  resetCapturedEmails();

  const settled = await applyRefundOutcome({
    env,
    returnId,
    refundId: `rfnd_p14${String(sequence).padStart(9, '0')}`,
    status: 'processed',
    actor: null,
  });

  check('the refund settled', settled === 'SETTLED');
  check('and raised exactly one refund notification', (await countFor(returnId, 'REFUND_COMPLETED')) === 1);

  const refundMail = capturedEmails().at(-1);

  check('the refund message was sent', refundMail?.template === 'refund-completed');
  /* §43/§45 · the amount comes from the stored refund record. */
  check('it quotes the authoritative stored amount', refundMail?.html.includes('₹1,000') === true);
  check('and says so in plain text too', refundMail?.text.includes('₹1,000') === true);

  /* §85 · a duplicate webhook must not produce a second message. */
  const again = await applyRefundOutcome({
    env,
    returnId,
    refundId: `rfnd_p14${String(sequence).padStart(9, '0')}`,
    status: 'processed',
    actor: null,
  });

  check('a duplicate refund webhook changes nothing', again === 'UNCHANGED');
  check('and raises no second refund notification', (await countFor(returnId, 'REFUND_COMPLETED')) === 1);
  check('and sends no second message', capturedEmails().length === 1);
}

/**
 * §84: a refund that failed must never produce "your refund is complete".
 */
async function verifyRefundFailureIsSilent(env: Env, fixtures: Fixtures): Promise<void> {
  section('A failed refund communicates nothing');

  const product = await makeProduct(fixtures, 'RefundFail');
  const order = await makeOrder(fixtures, {
    status: 'DELIVERED',
    paid: true,
    lines: [{ product, quantity: 1 }],
  });

  const lineId = String(order.items[0]?._id);

  const request = await returns.createReturn(String(fixtures.customerId), order.orderNumber, {
    items: [{ orderItemId: lineId, quantity: 1, reason: 'DEFECTIVE' }],
  });

  const returnId = new Types.ObjectId(request.id);
  const refundId = `rfnd_p14fail${String(sequence).padStart(4, '0')}`;

  await returns.approveReturn(env, request.returnNumber, {}, fixtures.actor);
  await returns.receiveReturn(request.returnNumber, { resellable: false }, fixtures.actor);

  await ReturnRequest.updateOne(
    { _id: returnId },
    {
      $set: {
        status: 'REFUND_PENDING',
        'refund.claimedAt': new Date(),
        'refund.amount': 1000,
        'refund.razorpayRefundId': refundId,
        'refund.initiatedAt': new Date(),
      },
    },
  );

  await Order.updateOne({ _id: order._id }, { $inc: { 'payment.refundedAmount': 1000 } });

  resetCapturedEmails();

  const outcome = await applyRefundOutcome({
    env,
    returnId,
    refundId,
    status: 'failed',
    actor: null,
  });

  check('the failure was recorded', outcome === 'FAILED');
  check('and raised no refund-completed notification', (await countFor(returnId, 'REFUND_COMPLETED')) === 0);
  check('and sent nothing', capturedEmails().length === 0);

  const reloaded = await ReturnRequest.findById(returnId);
  check('the return went back so it can be retried', reloaded?.status === 'RECEIVED');

  const reloadedOrder = await Order.findById(order._id);
  check('and the refunded total was taken back off', (reloadedOrder?.payment.refundedAmount ?? -1) === 0);
}

/* ---------------------------------------------------------------- */
/* 4 · Concurrency                                                   */
/* ---------------------------------------------------------------- */

/**
 * §107/§146: two simultaneous attempts at the same event must produce one
 * delivery record, and two simultaneous retries must not send twice.
 */
async function verifyConcurrency(env: Env, fixtures: Fixtures): Promise<void> {
  section('Concurrency');

  const product = await makeProduct(fixtures, 'Race');
  const order = await makeOrder(fixtures, { lines: [{ product, quantity: 1 }] });

  resetCapturedEmails();

  /**
   * Two administrators, one transition. One wins; the other is refused by the
   * order's own transition rules, by a write conflict, or — if it got as far as
   * the insert — by the unique index on the notification key. Whichever of the
   * three decides it, the outcome that matters is the same.
   */
  const results = await Promise.allSettled([
    setOrderStatus(env, order.orderNumber, 'SHIPPED', undefined, fixtures.actor),
    setOrderStatus(env, order.orderNumber, 'SHIPPED', undefined, fixtures.otherActor),
  ]);

  const fulfilled = results.filter((result) => result.status === 'fulfilled').length;

  check('exactly one concurrent transition succeeded', fulfilled === 1);
  check('exactly one delivery record exists', (await countFor(order._id, 'ORDER_SHIPPED')) === 1);
  check('and exactly one message was sent', capturedEmails().length === 1);

  /* Two concurrent retries of one failed delivery. */
  const failing = await makeProduct(fixtures, 'RaceRetry');
  const failingOrder = await makeOrder(fixtures, { lines: [{ product: failing, quantity: 1 }] });

  // Enough forced failures to use up the whole automatic budget.
  failNextSends(MAX_AUTOMATIC_ATTEMPTS);
  resetCapturedEmails();

  await setOrderStatus(env, failingOrder.orderNumber, 'SHIPPED', undefined, fixtures.actor);

  const stuck = await deliveryFor(failingOrder._id, 'ORDER_SHIPPED');

  check('a provider outage leaves the order shipped anyway', (await Order.findById(failingOrder._id))?.status === 'SHIPPED');
  check('and the delivery is FAILED, not SENT', stuck?.status === 'FAILED');
  check('with the whole automatic budget used', stuck?.attempts === MAX_AUTOMATIC_ATTEMPTS);
  check('and a diagnosable reason recorded', (stuck?.failure?.reason.length ?? 0) > 10);
  /**
   * §63 · running out of attempts is not the same as being unfixable.
   *
   * The status says nothing automatic will try again; the classification says
   * why it failed. Conflating them told an operator a retry was pointless about
   * a message that goes out on the very next attempt — which is exactly what
   * the two retries below do.
   */
  check('classified by its cause, not by the budget', stuck?.failure?.kind === 'TEMPORARY');
  check('nothing was captured', capturedEmails().length === 0);

  clearForcedFailures();

  const id = String(stuck?._id);

  const retries = await Promise.allSettled([
    retryNotification(env, id),
    retryNotification(env, id),
  ]);

  /**
   * `claimed`, not `sent`.
   *
   * The loser of the race re-reads a row the winner may already have finished,
   * so "is it sent?" is true for both while only one of them caused it — which
   * is exactly what this check exists to distinguish, and what an earlier
   * version of it got wrong often enough to be caught by a timing difference
   * between runs.
   */
  const claimedCount = retries.filter(
    (result) => result.status === 'fulfilled' && result.value.claimed,
  ).length;

  check('exactly one of two concurrent retries performed the attempt', claimedCount === 1);
  check('and exactly one message left', capturedEmails().length === 1);

  /**
   * The loser is honest about two different situations, and both are correct:
   * it may find the row already SENT, or still SENDING while the winner works.
   * What must never happen is either caller being told the send failed — that
   * would put a red "could not be sent" in front of an administrator whose
   * colleague just sent it.
   */
  check(
    'neither caller is told the send failed',
    retries.every(
      (result) => result.status === 'fulfilled' && (!result.value.claimed || result.value.sent),
    ),
  );

  const afterRetry = await deliveryFor(failingOrder._id, 'ORDER_SHIPPED');
  check('the delivery is now SENT', afterRetry?.status === 'SENT');
  check('and the attempt count reflects every attempt begun', (afterRetry?.attempts ?? 0) >= MAX_AUTOMATIC_ATTEMPTS + 1);

  /* §27 · a message already accepted is never resent. */
  await refuses(
    'refuses to retry a message the provider already accepted',
    () => retryNotification(env, id),
    { status: 409, match: /already/i },
  );

  check('and still only one message was sent', capturedEmails().length === 1);
}

/* ---------------------------------------------------------------- */
/* 5 · Retry behaviour                                               */
/* ---------------------------------------------------------------- */

/**
 * §103/§105: a transient failure followed by a success ends SENT, with the
 * attempt count telling the truth about how many sends were begun.
 */
async function verifyRetryRecovery(env: Env, fixtures: Fixtures): Promise<void> {
  section('Retry behaviour');

  const product = await makeProduct(fixtures, 'Recover');
  const order = await makeOrder(fixtures, { lines: [{ product, quantity: 1 }] });

  failNextSends(1);
  resetCapturedEmails();

  await setOrderStatus(env, order.orderNumber, 'SHIPPED', undefined, fixtures.actor);

  const delivery = await deliveryFor(order._id, 'ORDER_SHIPPED');

  check('attempt one failed and attempt two succeeded', delivery?.status === 'SENT');
  check('and the attempt count says two', delivery?.attempts === 2);
  check('the earlier failure is still on the record', (delivery?.failure?.reason.length ?? 0) > 0);
  check('exactly one message was delivered', capturedEmails().length === 1);

  clearForcedFailures();

  /* §104 · a permanent failure stops immediately rather than using the budget. */
  const permanent = await makeProduct(fixtures, 'Permanent');
  const permanentOrder = await makeOrder(fixtures, { lines: [{ product: permanent, quantity: 1 }] });

  failNextSends(5, { permanent: true });
  resetCapturedEmails();

  await setOrderStatus(env, permanentOrder.orderNumber, 'SHIPPED', undefined, fixtures.actor);

  const rejected = await deliveryFor(permanentOrder._id, 'ORDER_SHIPPED');

  check('a rejected recipient fails on the first attempt', rejected?.attempts === 1);
  check('and is not retried automatically', rejected?.status === 'FAILED');
  check('and is classified as permanent', rejected?.failure?.kind === 'PERMANENT');

  clearForcedFailures();

  /* §163 · a retry must touch nothing but the delivery row. */
  const before = await Order.findById(permanentOrder._id);
  const stockBefore = (await Product.findById(permanent._id))?.stock;

  await retryNotification(env, String(rejected?._id));

  const after = await Order.findById(permanentOrder._id);
  const stockAfter = (await Product.findById(permanent._id))?.stock;

  check('retrying did not change the order status', before?.status === after?.status);
  check('nor the payment state', before?.payment.status === after?.payment.status);
  check('nor the refunded total', before?.payment.refundedAmount === after?.payment.refundedAmount);
  check('nor stock', stockBefore === stockAfter);
  check('and created no second delivery record', (await countFor(permanentOrder._id, 'ORDER_SHIPPED')) === 1);

  const detail = await getNotification(String(rejected?._id));
  check('the console can read it back', detail.event === 'ORDER_SHIPPED');
  check('and it exposes no provider credential', !JSON.stringify(detail).toLowerCase().includes('password'));
}

/* ---------------------------------------------------------------- */
/* 6 · Recipients and history                                        */
/* ---------------------------------------------------------------- */

/**
 * §88/§89: an order that was already SHIPPED before Phase 14 must not suddenly
 * receive a message, because nothing scans for them.
 */
async function verifyNoBackfill(env: Env, fixtures: Fixtures): Promise<void> {
  section('History is left alone');

  const product = await makeProduct(fixtures, 'Historic');
  const historic = await makeOrder(fixtures, {
    status: 'SHIPPED',
    lines: [{ product, quantity: 1 }],
  });

  resetCapturedEmails();

  check('an order already shipped has no notification', (await countFor(historic._id)) === 0);

  /* Creating a parcel for it is not a dispatch either. */
  await shipments.createShipment(historic.orderNumber, { carrier: 'Late' }, fixtures.actor);

  check('recording a parcel after the fact raises nothing', (await countFor(historic._id)) === 0);
  check('and sends nothing', capturedEmails().length === 0);

  /* Its eventual delivery is a real transition, so that one does communicate. */
  await shipments.advanceShipment(env, historic.orderNumber, { status: 'DELIVERED' }, fixtures.actor);

  check('but its delivery does', (await countFor(historic._id, 'ORDER_DELIVERED')) === 1);
  check('and no shipped message is invented retrospectively', (await countFor(historic._id, 'ORDER_SHIPPED')) === 0);
}

/**
 * §90: for a single order the messages must arrive in the order the domain
 * reached them.
 */
async function verifyOrdering(env: Env, fixtures: Fixtures): Promise<void> {
  section('Event ordering');

  const product = await makeProduct(fixtures, 'Sequence');
  const order = await makeOrder(fixtures, { lines: [{ product, quantity: 1 }] });

  await setOrderStatus(env, order.orderNumber, 'SHIPPED', undefined, fixtures.actor);
  await setOrderStatus(env, order.orderNumber, 'DELIVERED', undefined, fixtures.actor);

  const rows = await deliveriesFor(order._id).sort({ createdAt: 1 });

  check('two messages, shipped first', rows[0]?.event === 'ORDER_SHIPPED');
  check('then delivered', rows[1]?.event === 'ORDER_DELIVERED');
  check('and no more than two', rows.length === 2);
}

/**
 * §55/§92: the recipient comes from the account, at creation time, and is
 * frozen afterwards.
 */
async function verifyRecipientResolution(env: Env, fixtures: Fixtures): Promise<void> {
  section('Recipient resolution');

  const product = await makeProduct(fixtures, 'Recipient');
  const order = await makeOrder(fixtures, {
    user: fixtures.namelessId,
    lines: [{ product, quantity: 1 }],
  });

  await setOrderStatus(env, order.orderNumber, 'SHIPPED', undefined, fixtures.actor);

  const delivery = await deliveryFor(order._id, 'ORDER_SHIPPED');
  check('the address came from the account', delivery?.recipientEmail === `nameless@${EMAIL_DOMAIN}`);

  /* Changing the account address does not rewrite where this one went. */
  await User.updateOne(
    { _id: fixtures.namelessId },
    { $set: { email: `moved@${EMAIL_DOMAIN}` } },
  );

  const unchanged = await deliveryFor(order._id, 'ORDER_SHIPPED');
  check('and is not rewritten when the account changes', unchanged?.recipientEmail === `nameless@${EMAIL_DOMAIN}`);

  /* The next event uses the new address, because it is resolved fresh. */
  resetCapturedEmails();
  await setOrderStatus(env, order.orderNumber, 'DELIVERED', undefined, fixtures.actor);

  const next = await deliveryFor(order._id, 'ORDER_DELIVERED');
  check('the next message uses the current account address', next?.recipientEmail === `moved@${EMAIL_DOMAIN}`);
  check('and that is where it was sent', capturedEmails().at(-1)?.to === `moved@${EMAIL_DOMAIN}`);

  await User.updateOne(
    { _id: fixtures.namelessId },
    { $set: { email: `nameless@${EMAIL_DOMAIN}` } },
  );
}

/* ---------------------------------------------------------------- */
/* 7 · The drain                                                     */
/* ---------------------------------------------------------------- */

/**
 * Strands a delivery exactly as a crash between commit and send would.
 *
 * The domain transition runs with no outbox, so the intent is written inside
 * its transaction and committed, and nothing ever attempts it — which is
 * precisely the state Phase 14 left open and Phase 15 exists to recover. It is
 * produced by the real service rather than by inserting a row, so what the
 * drain finds is what a crash actually leaves behind.
 */
async function strandOne(fixtures: Fixtures, suffix: string) {
  const product = await makeProduct(fixtures, suffix);
  const order = await makeOrder(fixtures, { lines: [{ product, quantity: 1 }] });

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const loaded = await Order.findById(order._id).session(session);
      if (!loaded) throw new Error('fixture order vanished');

      // No `outbox`: the intent commits, and nothing is ever handed to a
      // provider. See `transitionOrderStatus`.
      await transitionOrderStatus(loaded, 'SHIPPED', session, { actor: fixtures.actor });
    });
  } finally {
    await session.endSession();
  }

  return { order, product };
}

async function verifyDrain(env: Env, fixtures: Fixtures): Promise<void> {
  section('The drain recovers what a crash stranded');

  const { order } = await strandOne(fixtures, 'Stranded');

  const stranded = await deliveryFor(order._id, 'ORDER_SHIPPED');

  check(
    'a committed transition with no dispatch leaves a PENDING delivery',
    stranded?.status === 'PENDING',
  );
  check('with no attempt made', stranded?.attempts === 0);

  resetCapturedEmails();

  /* §59 · a dry run must report without touching anything. */
  const dry = await drainNotifications(env, { limit: 10, includeStale: false, dryRun: true });

  check('a dry run finds the stranded delivery', dry.claimed >= 1);
  check('and sends nothing', capturedEmails().length === 0);

  const afterDry = await deliveryFor(order._id, 'ORDER_SHIPPED');

  check('and claims nothing', afterDry?.status === 'PENDING');
  check('and spends no attempt', afterDry?.attempts === 0);

  /* The real run. */
  const run = await drainNotifications(env, { limit: 10, includeStale: false, dryRun: false });

  check('a real run sends it', run.sent >= 1);
  check('and reports no failures', run.failed === 0);
  check('and names the provider it used', run.provider === 'mock');

  const delivered = await deliveryFor(order._id, 'ORDER_SHIPPED');

  check('the delivery is now SENT', delivered?.status === 'SENT');
  check('on its first attempt', delivered?.attempts === 1);
  check('and the message was really composed', capturedEmails().length === 1);
  check('addressed to the account', capturedEmails().at(-1)?.to === `shopper@${EMAIL_DOMAIN}`);

  /* A second run finds nothing left. */
  const empty = await drainNotifications(env, { limit: 10, includeStale: false, dryRun: false });

  check('a second run finds nothing to do', empty.claimed === 0 && empty.sent === 0);
  check('and sends nothing further', capturedEmails().length === 1);

  /**
   * §22 · a FAILED delivery is not drain work.
   *
   * It has used its automatic budget, which means a person should look at it. A
   * cron job quietly retrying it forever would turn a bounded retry policy into
   * an unbounded one.
   */
  const { order: failedOrder } = await strandOne(fixtures, 'Exhausted');
  const failedDelivery = await deliveryFor(failedOrder._id, 'ORDER_SHIPPED');

  failNextSends(MAX_AUTOMATIC_ATTEMPTS);
  resetCapturedEmails();

  // Burn the budget through the drain itself, one attempt per run — which is
  // also the assertion that a run does not retry within itself.
  for (let round = 0; round < MAX_AUTOMATIC_ATTEMPTS; round += 1) {
    await drainNotifications(env, { limit: 10, includeStale: false, dryRun: false });
  }

  clearForcedFailures();

  const exhausted = await deliveryFor(failedOrder._id, 'ORDER_SHIPPED');

  check('the drain spends one attempt per run', exhausted?.attempts === MAX_AUTOMATIC_ATTEMPTS);
  check('and stops at FAILED', exhausted?.status === 'FAILED');
  check('nothing was sent', capturedEmails().length === 0);

  const afterExhausted = await drainNotifications(env, {
    limit: 10,
    includeStale: false,
    dryRun: false,
  });

  check('a FAILED delivery is not picked up again by the drain', afterExhausted.claimed === 0);
  check('and still nothing was sent', capturedEmails().length === 0);

  /* §23 · the admin retry still reaches it, under its own rules. */
  const retried = await retryNotification(env, String(failedDelivery?._id));

  check('an administrator can still retry it by hand', retried.sent);
  check('and that is what sends it', capturedEmails().length === 1);

  /* §9 · an abandoned SENDING row. */
  const { order: staleOrder } = await strandOne(fixtures, 'Stale');
  const staleDelivery = await deliveryFor(staleOrder._id, 'ORDER_SHIPPED');

  /**
   * Written directly, because there is no way to make a process die mid-send on
   * demand. The row is put in exactly the state a crash leaves behind: SENDING,
   * one attempt begun, last touched longer ago than the stale threshold.
   */
  await NotificationDelivery.updateOne(
    { _id: staleDelivery?._id },
    {
      $set: {
        status: 'SENDING',
        attempts: 1,
        lastAttemptAt: new Date(Date.now() - STALE_SENDING_MS - 60_000),
      },
    },
  );

  resetCapturedEmails();

  const withStale = await drainNotifications(env, {
    limit: 10,
    includeStale: false,
    dryRun: false,
  });

  check('an ordinary drain does not touch an abandoned SENDING row', withStale.claimed === 0);
  check('but it reports that one is waiting', withStale.staleWaiting >= 1);
  check('and sends nothing', capturedEmails().length === 0);

  const untouched = await deliveryFor(staleOrder._id, 'ORDER_SHIPPED');
  check('the row is left exactly as it was', untouched?.attempts === 1);

  const reclaimed = await drainNotifications(env, {
    limit: 10,
    includeStale: true,
    dryRun: false,
  });

  const afterReclaim = await deliveryFor(staleOrder._id, 'ORDER_SHIPPED');

  check('--include-stale reclaims it', reclaimed.sent === 1);
  check('and it is sent', afterReclaim?.status === 'SENT');
  check('with the extra attempt counted', afterReclaim?.attempts === 2);
  check('and exactly one message left', capturedEmails().length === 1);

  /* §12 · the limit is honoured, and the remainder is reported. */
  await strandOne(fixtures, 'Batch1');
  await strandOne(fixtures, 'Batch2');
  await strandOne(fixtures, 'Batch3');

  resetCapturedEmails();

  const limited = await drainNotifications(env, { limit: 2, includeStale: false, dryRun: false });

  check('a run stops at its limit', limited.sent === 2);
  check('and says how much is left', limited.remaining >= 1);
  check('and sent exactly that many messages', capturedEmails().length === 2);

  const rest = await drainNotifications(env, { limit: 10, includeStale: false, dryRun: false });

  check('the next run picks up the remainder', rest.sent === 1);
  check('and then there is nothing left', rest.remaining === 0);
}

/**
 * §11/§63: two drains at once.
 */
async function verifyDrainConcurrency(env: Env, fixtures: Fixtures): Promise<void> {
  section('Two drains at once');

  const stranded = [
    await strandOne(fixtures, 'Race1'),
    await strandOne(fixtures, 'Race2'),
    await strandOne(fixtures, 'Race3'),
  ];

  resetCapturedEmails();

  const [a, b] = await Promise.all([
    drainNotifications(env, { limit: 10, includeStale: false, dryRun: false }),
    drainNotifications(env, { limit: 10, includeStale: false, dryRun: false }),
  ]);

  check('the three messages were sent exactly once between them', a.sent + b.sent === 3);
  check('and exactly three messages left', capturedEmails().length === 3);
  check('neither run reported a failure', a.failed === 0 && b.failed === 0);

  for (const { order } of stranded) {
    const delivery = await deliveryFor(order._id, 'ORDER_SHIPPED');

    check(
      `${order.orderNumber} was attempted exactly once`,
      delivery?.attempts === 1 && delivery.status === 'SENT',
    );
  }
}

/**
 * §64: the delivery ledger says only things that can be true together.
 */
async function verifyLedgerConsistency(fixtures: Fixtures): Promise<void> {
  section('The delivery ledger is internally consistent');

  const returnIds = (
    await ReturnRequest.find({ order: { $in: fixtures.orderIds } }).select('_id')
  ).map((row) => row._id);

  const rows = await NotificationDelivery.find({
    entityId: { $in: [...fixtures.orderIds, ...returnIds] },
  });

  const keys = new Set(rows.map((row) => row.key));

  check('every notification key is unique', keys.size === rows.length);

  let sentWithoutTime = 0;
  let sentWithoutProvider = 0;
  let failedWithoutReason = 0;
  let negativeAttempts = 0;
  let sentWithoutAttempt = 0;
  let futureTimestamps = 0;

  const now = Date.now();

  for (const row of rows) {
    if (row.status === 'SENT') {
      if (!row.sentAt) sentWithoutTime += 1;
      if (!row.provider) sentWithoutProvider += 1;
      if (row.attempts < 1) sentWithoutAttempt += 1;
    }

    if (row.status === 'FAILED' && !row.failure?.reason) failedWithoutReason += 1;
    if (row.attempts < 0) negativeAttempts += 1;

    for (const stamp of [row.createdAt, row.lastAttemptAt, row.sentAt]) {
      if (stamp && stamp.getTime() > now + 60_000) futureTimestamps += 1;
    }
  }

  check('every SENT delivery records when it was accepted', sentWithoutTime === 0);
  check('and which transport accepted it', sentWithoutProvider === 0);
  check('and took at least one attempt to get there', sentWithoutAttempt === 0);
  check('every FAILED delivery records a reason', failedWithoutReason === 0);
  check('no attempt count is negative', negativeAttempts === 0);
  check('no timestamp is in the future', futureTimestamps === 0);

  /**
   * Nothing is repaired here. A verification script that quietly fixed what it
   * found would be unable to tell anybody what was wrong — and the next run
   * would report a clean ledger over a bug that is still there.
   */
  const stuck = rows.filter((row) => row.status === 'SENDING');

  check('no delivery is left mid-send', stuck.length === 0, stuck.map((row) => row.key).join(', '));
}

/* ---------------------------------------------------------------- */
/* Entry point                                                       */
/* ---------------------------------------------------------------- */

async function main(): Promise<void> {
  const env = loadEnv();

  /**
   * The guard that makes this script safe to run anywhere.
   *
   * Every fixture below belongs to a made-up `.test` address, so even a real
   * send would go nowhere — but "would go nowhere" is not a guarantee, and a
   * verification script is not the place to find out. It refuses to start
   * against a configured mail server.
   */
  if (env.EMAIL_PROVIDER !== 'mock') {
    console.error(
      `Refusing to run: EMAIL_PROVIDER is "${env.EMAIL_PROVIDER}". This script drives the real\n` +
        'notification path and must never be able to send mail. Set EMAIL_PROVIDER=mock.',
    );
    process.exitCode = 1;
    return;
  }

  await connectDatabase(env.MONGODB_URI);

  console.log('\nPhase 14 · transactional communication verification');
  console.log(`Database: ${mongoose.connection.name}`);
  console.log('Email provider: mock (nothing is delivered)');
  console.log('Creating temporary verification data…');

  const fixtures = await createFixtures();

  try {
    await verifyTransactionalCreation(env, fixtures);
    await verifyBothDoors(env, fixtures);
    await verifyReturnEvents(env, fixtures);
    await verifyRefundFailureIsSilent(env, fixtures);
    await verifyConcurrency(env, fixtures);
    await verifyRetryRecovery(env, fixtures);
    await verifyNoBackfill(env, fixtures);
    await verifyOrdering(env, fixtures);
    await verifyRecipientResolution(env, fixtures);
    await verifyDrain(env, fixtures);
    await verifyDrainConcurrency(env, fixtures);
    await verifyLedgerConsistency(fixtures);
  } finally {
    clearForcedFailures();
    resetCapturedEmails();
    await removeFixtures(fixtures);
    await mongoose.disconnect();
  }

  console.log(`\n${String(passed)} passed, ${String(failed)} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
