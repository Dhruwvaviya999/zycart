import 'dotenv/config';
import { createHmac, randomBytes } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database';
import { loadEnv, type Env } from '../config/env';
import { Brand } from '../models/brand.model';
import { Cart } from '../models/cart.model';
import { Category } from '../models/category.model';
import { InventoryMovement } from '../models/inventory-movement.model';
import { NotificationDelivery } from '../models/notification-delivery.model';
import { Order } from '../models/order.model';
import { Product } from '../models/product.model';
import { ReturnRequest } from '../models/return.model';
import { User } from '../models/user.model';
import { WebhookEvent } from '../models/webhook-event.model';
import {
  finalizeSuccessfulPayment,
  handleWebhookEvent,
  type PaymentGatewayReads,
} from '../services/payment.service';
import type { FetchedRazorpayPayment, IssuedRefund } from '../services/razorpay.service';
import { applyRefundOutcome } from '../services/returns/refund.service';
import { AppError } from './AppError';

/**
 * Exercises the Razorpay boundary against a real MongoDB.
 *
 * ## Why this exists
 *
 * Phase 14 finished by naming this as the repository's largest testing gap: the
 * code that decides whether a request is really from Razorpay, whether an event
 * has already been handled, and whether a payment becomes a confirmed order was
 * covered only indirectly. `tests/payments.test.ts` now covers the pure half —
 * HMACs, envelope shapes, validators, money. This covers the half that only
 * exists because there is a database:
 *
 *  - the full signed pipeline, from raw bytes through signature, envelope and
 *    event-id claim into domain state;
 *  - what a duplicate webhook does, sequentially and concurrently;
 *  - what the finalisation claim does when two requests race for one payment;
 *  - whether a captured payment with no stock behind it really does refund.
 *
 * ## No live gateway request is made
 *
 * Two things make that true, and both are checked rather than assumed:
 *
 *  1. **The webhook secret is generated in this process.** A random secret is
 *     used to sign payloads this same process then verifies. It is not a
 *     credential, it reaches no network, and the events driven through it —
 *     refunds, failures, unknown orders, unhandled types — resolve entirely
 *     against the database.
 *  2. **Finalisation is given a stub.** `finalizeSuccessfulPayment` takes its
 *     two gateway reads as a parameter with a production default; this passes a
 *     stub, so captured, authorised, failed and unfulfillable all run through
 *     the real transaction, the real claim and the real refund bookkeeping with
 *     nothing leaving the machine.
 *
 * `payment.captured` is deliberately **never** driven through
 * `handleWebhookEvent`, because that path would reach the live SDK.
 *
 * ## Safety
 *
 * Everything is created under a `ZYCART-P15-` SKU prefix, a `ZYC-P15-` order
 * prefix, an `evt_p15_` webhook-event prefix and a `@zycart-p15.test` email
 * domain. Nothing else in ZyCart uses any of them. Records are removed in a
 * `finally`, so a failed run still cleans up. There is no `deleteMany({})`,
 * `dropDatabase`, `dropCollection` or `syncIndexes` anywhere in this file, and
 * no real customer, order, product or payment is read or written.
 *
 *   pnpm payments:verify
 */

const SKU_PREFIX = 'ZYCART-P15';
const SLUG_PREFIX = 'zycart-p15';
const ORDER_PREFIX = 'ZYC-P15';
const EVENT_PREFIX = 'evt_p15_';
const EMAIL_DOMAIN = 'zycart-p15.test';

/** A bcrypt-shaped placeholder. These accounts cannot be signed in to. */
const UNUSABLE_PASSWORD = '$2b$10$zycartp15verificationaccountnotsigninablexxxxxxxxxxxx';

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

/* ---------------------------------------------------------------- */
/* A signed webhook, without a gateway                               */
/* ---------------------------------------------------------------- */

/**
 * The environment these checks run against.
 *
 * A copy of the real one with synthetic Razorpay values spliced in, because
 * `verifyWebhook` refuses to run at all on a deployment with no gateway
 * configured — which is the honest behaviour, and which would otherwise make
 * the whole webhook pipeline untestable here. The key id is shaped so `loadEnv`
 * accepts it; the two secrets are random bytes generated a moment ago.
 *
 * None of these is a credential. Nothing is sent anywhere.
 */
function verificationEnv(): { env: Env; webhookSecret: string } {
  const webhookSecret = randomBytes(24).toString('hex');

  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'development',
    RAZORPAY_KEY_ID: 'rzp_test_p15verification',
    RAZORPAY_KEY_SECRET: randomBytes(24).toString('hex'),
    RAZORPAY_WEBHOOK_SECRET: webhookSecret,
  });

  return { env, webhookSecret };
}

let eventSequence = 0;

/** Signs a payload exactly as Razorpay does: HMAC-SHA256 over the raw bytes. */
function signedEvent(
  webhookSecret: string,
  body: unknown,
): { rawBody: Buffer; signature: string; eventId: string } {
  const rawBody = Buffer.from(JSON.stringify(body));
  eventSequence += 1;

  return {
    rawBody,
    signature: createHmac('sha256', webhookSecret).update(rawBody).digest('hex'),
    eventId: `${EVENT_PREFIX}${String(Date.now()).slice(-8)}_${String(eventSequence)}`,
  };
}

/* ---------------------------------------------------------------- */
/* The stubbed gateway                                               */
/* ---------------------------------------------------------------- */

interface StubState {
  payment: FetchedRazorpayPayment;
  refund: IssuedRefund;
  fetchCalls: number;
  refundCalls: number;
  refundThrows: boolean;
}

/**
 * Stands in for the two gateway reads, and records what was asked of it.
 *
 * The call counters matter as much as the values: "a duplicate webhook does not
 * finalise twice" is only proved if the second call also did not reach the
 * gateway, and "one refund was issued" is only proved by counting refund calls
 * rather than by reading the order afterwards.
 */
function stubGateway(state: StubState): PaymentGatewayReads {
  return {
    fetchPayment: (_env, id) => {
      state.fetchCalls += 1;
      return Promise.resolve({ ...state.payment, id });
    },
    refundPaymentInFull: (_env, _params) => {
      state.refundCalls += 1;
      if (state.refundThrows) return Promise.reject(new Error('stubbed gateway refusal'));
      return Promise.resolve(state.refund);
    },
  };
}

const capturedPayment = (orderId: string, rupees: number): FetchedRazorpayPayment => ({
  id: 'pay_p15stub000000',
  orderId,
  amountInPaise: rupees * 100,
  currency: 'INR',
  status: 'captured',
  captured: true,
  method: 'upi',
  errorDescription: null,
});

/* ---------------------------------------------------------------- */
/* Fixtures                                                          */
/* ---------------------------------------------------------------- */

interface Fixtures {
  customerId: Types.ObjectId;
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

  const customer = await User.create({
    firstName: 'Phase15',
    lastName: 'Payer',
    email: `payer@${EMAIL_DOMAIN}`,
    password: UNUSABLE_PASSWORD,
    role: 'USER',
    isActive: true,
  });

  return {
    customerId: customer._id,
    categoryId: category._id,
    brandId: brand._id,
    productIds: [],
    orderIds: [],
  };
}

async function makeProduct(fixtures: Fixtures, suffix: string, stock = 20) {
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
  status?: 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';
  paymentStatus?: 'PENDING' | 'PAID' | 'FAILED' | 'AUTHORIZED';
  stockCommitted?: boolean;
  quantity?: number;
  product: Awaited<ReturnType<typeof makeProduct>>;
}

/**
 * An unpaid online order, as `createOrder` leaves one.
 *
 * Built directly rather than through checkout: what is under test is the
 * gateway boundary, and driving cart, address and pricing first would make
 * every failure ambiguous. The shape is the one `createOrder` writes, including
 * the gateway order id finalisation matches against.
 */
async function makeOrder(fixtures: Fixtures, spec: OrderSpec) {
  sequence += 1;

  const quantity = spec.quantity ?? 2;
  const unitPrice = spec.product.price;
  const subtotal = unitPrice * quantity;
  const paid = (spec.paymentStatus ?? 'PENDING') === 'PAID';

  const order = await Order.create({
    orderNumber: `${ORDER_PREFIX}-${String(Date.now()).slice(-6)}-${String(sequence).padStart(3, '0')}`,
    user: fixtures.customerId,
    items: [
      {
        product: spec.product._id,
        productName: spec.product.name,
        productSlug: spec.product.slug,
        productImage: '',
        sku: spec.product.sku,
        brand: `${SKU_PREFIX} Brand`,
        quantity,
        unitPrice,
        lineTotal: subtotal,
        selectedColor: null,
        selectedSize: null,
        returnedQuantity: 0,
      },
    ],
    shippingAddress: {
      fullName: 'Phase15 Payer',
      phone: '9000000000',
      addressLine1: '1 Verification Road',
      city: 'Surat',
      state: 'Gujarat',
      postalCode: '395007',
      country: 'India',
    },
    pricing: { subtotal, shipping: 0, discount: 0, tax: 0, total: subtotal },
    payment: {
      method: 'RAZORPAY',
      status: spec.paymentStatus ?? 'PENDING',
      provider: 'razorpay',
      razorpayOrderId: `order_p15${String(sequence).padStart(9, '0')}`,
      /**
       * A fixture that is already PAID carries the two fields the real
       * finalisation path always writes alongside that status.
       *
       * Not cosmetic: the reconciliation checks at the end assert that every
       * paid order has a gateway payment id and a paid-at time, and a fixture
       * in a shape the system never produces would fail an invariant that
       * production data satisfies — which is a broken test, not a finding.
       */
      razorpayPaymentId: paid ? `pay_p15fixture${String(sequence).padStart(3, '0')}` : null,
      paidAt: paid ? new Date() : null,
      refundedAmount: 0,
    },
    status: spec.status ?? 'PENDING',
    stockCommitted: spec.stockCommitted ?? false,
  });

  fixtures.orderIds.push(order._id);
  return order;
}

async function removeFixtures(fixtures: Fixtures): Promise<void> {
  console.log('\nRemoving verification data…');

  const returnIds = (
    await ReturnRequest.find({ order: { $in: fixtures.orderIds } }).select('_id')
  ).map((row) => row._id);

  await NotificationDelivery.deleteMany({
    entityId: { $in: [...fixtures.orderIds, ...returnIds] },
  });
  await InventoryMovement.deleteMany({ product: { $in: fixtures.productIds } });
  await WebhookEvent.deleteMany({ eventId: new RegExp(`^${EVENT_PREFIX}`) });
  await ReturnRequest.deleteMany({ order: { $in: fixtures.orderIds } });
  await Order.deleteMany({ _id: { $in: fixtures.orderIds } });
  await Product.deleteMany({ _id: { $in: fixtures.productIds } });
  await Category.deleteOne({ _id: fixtures.categoryId });
  await Brand.deleteOne({ _id: fixtures.brandId });
  await Cart.deleteMany({ user: fixtures.customerId });
  await User.deleteOne({ _id: fixtures.customerId });

  const leftovers =
    (await Product.countDocuments({ sku: new RegExp(`^${SKU_PREFIX}-`) })) +
    (await Order.countDocuments({ orderNumber: new RegExp(`^${ORDER_PREFIX}-`) })) +
    (await WebhookEvent.countDocuments({ eventId: new RegExp(`^${EVENT_PREFIX}`) })) +
    (await User.countDocuments({ email: new RegExp(`@${EMAIL_DOMAIN}$`) }));

  console.log(`  ${leftovers === 0 ? 'clean' : `WARNING: ${String(leftovers)} record(s) remain`}`);
}

const stockOf = async (id: Types.ObjectId): Promise<number> =>
  (await Product.findById(id).select('stock'))?.stock ?? -1;

/* ---------------------------------------------------------------- */
/* 1 · The signed pipeline                                           */
/* ---------------------------------------------------------------- */

/**
 * §41: the whole sequence, not each layer in isolation.
 *
 * Raw bytes → signature → envelope → event-id claim → domain. A forged or
 * altered request has to be refused by the first stage, before anything
 * downstream has a chance to be careful.
 */
async function verifySignedPipeline(
  env: Env,
  webhookSecret: string,
  fixtures: Fixtures,
): Promise<void> {
  section('The signed pipeline');

  const product = await makeProduct(fixtures, 'Pipeline');
  const order = await makeOrder(fixtures, { product });

  const body = {
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: 'pay_p15failed001',
          order_id: order.payment.razorpayOrderId,
          error_description: 'Customer cancelled the payment',
        },
      },
    },
  };

  const signed = signedEvent(webhookSecret, body);

  /* A forged signature must not reach the envelope, let alone the domain. */
  await refuses(
    'refuses a forged signature',
    () =>
      handleWebhookEvent(env, {
        ...signed,
        signature: createHmac('sha256', 'not-the-secret').update(signed.rawBody).digest('hex'),
      }),
    { status: 400, match: /signature/i },
  );

  await refuses(
    'refuses an absent signature',
    () => handleWebhookEvent(env, { ...signed, signature: '' }),
    { status: 400 },
  );

  /**
   * The body altered after signing. This is the case the whole design turns on:
   * the raw bytes are kept precisely so this cannot be accepted.
   */
  await refuses(
    'refuses a body modified after signing',
    () =>
      handleWebhookEvent(env, {
        ...signed,
        rawBody: Buffer.from(JSON.stringify({ ...body, event: 'payment.captured' })),
      }),
    { status: 400, match: /signature/i },
  );

  check(
    'none of the refused requests was recorded as handled',
    (await WebhookEvent.countDocuments({ eventId: signed.eventId })) === 0,
  );

  check(
    'and the order was not touched',
    (await Order.findById(order._id))?.payment.status === 'PENDING',
  );

  /* A correctly signed body whose shape is wrong is refused after the HMAC. */
  const malformed = signedEvent(webhookSecret, { payload: {} });

  await refuses(
    'refuses a correctly signed envelope with no event name',
    () => handleWebhookEvent(env, malformed),
    { status: 400, match: /payload/i },
  );

  check(
    'a malformed envelope is not claimed as an event either',
    (await WebhookEvent.countDocuments({ eventId: malformed.eventId })) === 0,
  );

  /* Now the genuine article. */
  const result = await handleWebhookEvent(env, signed);

  check('a correctly signed payment.failed is handled', result.outcome === 'PAYMENT_FAILED');

  const afterFailure = await Order.findById(order._id);

  check('the order payment is marked failed', afterFailure?.payment.status === 'FAILED');
  check('the order itself stays pending so it can be retried', afterFailure?.status === 'PENDING');
  check('and no stock was committed', afterFailure?.stockCommitted === false);
  check('stock is untouched', (await stockOf(product._id)) === 20);
}

/* ---------------------------------------------------------------- */
/* 2 · Event-id deduplication                                        */
/* ---------------------------------------------------------------- */

/**
 * §33/§34: the same event twice, sequentially and concurrently.
 */
async function verifyDeduplication(
  env: Env,
  webhookSecret: string,
  fixtures: Fixtures,
): Promise<void> {
  section('Event-id deduplication');

  const product = await makeProduct(fixtures, 'Dedup');
  const order = await makeOrder(fixtures, { product });

  const signed = signedEvent(webhookSecret, {
    event: 'payment.failed',
    payload: {
      payment: {
        entity: { id: 'pay_p15dedup001', order_id: order.payment.razorpayOrderId },
      },
    },
  });

  const first = await handleWebhookEvent(env, signed);
  const second = await handleWebhookEvent(env, signed);

  check('the first delivery is processed', first.duplicate === false);
  check('the second is recognised as a duplicate', second.duplicate === true);
  check('and reports it as such', second.outcome === 'DUPLICATE');
  check('exactly one ledger row exists', (await WebhookEvent.countDocuments({ eventId: signed.eventId })) === 1);

  /**
   * §34 · the same event id arriving on two connections at once.
   *
   * The unique index on `eventId` is what decides. One insert wins; the other
   * gets a duplicate-key error and is reported as the duplicate it is, without
   * ever reaching the dispatcher.
   */
  const raced = signedEvent(webhookSecret, {
    event: 'payment.failed',
    payload: {
      payment: { entity: { id: 'pay_p15race001', order_id: order.payment.razorpayOrderId } },
    },
  });

  const outcomes = await Promise.all([
    handleWebhookEvent(env, raced),
    handleWebhookEvent(env, raced),
  ]);

  const duplicates = outcomes.filter((outcome) => outcome.duplicate).length;

  check('exactly one of two concurrent deliveries processed', duplicates === 1);
  check('and exactly one ledger row exists', (await WebhookEvent.countDocuments({ eventId: raced.eventId })) === 1);

  /**
   * §45 · a duplicate is acknowledged, not errored. Razorpay must not be told
   * to retry an event that has already been dealt with.
   */
  check('a duplicate is acknowledged rather than rejected', second.event === 'payment.failed');
}

/* ---------------------------------------------------------------- */
/* 3 · Events with nothing to do                                     */
/* ---------------------------------------------------------------- */

async function verifyIgnoredEvents(
  env: Env,
  webhookSecret: string,
): Promise<void> {
  section('Events ZyCart has no use for');

  const unknownOrder = await handleWebhookEvent(
    env,
    signedEvent(webhookSecret, {
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_p15unknown1', order_id: 'order_p15doesnotexist' } },
      },
    }),
  );

  /**
   * Another application sharing the Razorpay account, or a dashboard test
   * event. Acknowledged and ignored — and note this never reaches
   * `finalizeSuccessfulPayment`, which is why driving `payment.captured` here
   * makes no gateway call.
   */
  check('a payment for an unknown gateway order is ignored', unknownOrder.outcome === 'UNKNOWN_ORDER');

  const unhandled = await handleWebhookEvent(
    env,
    signedEvent(webhookSecret, {
      event: 'subscription.charged',
      payload: { payment: { entity: { id: 'pay_p15sub0001', order_id: 'order_p15doesnotexist' } } },
    }),
  );

  check('an event ZyCart does not act on is acknowledged', unhandled.outcome === 'UNKNOWN_ORDER');

  const noReference = await handleWebhookEvent(
    env,
    signedEvent(webhookSecret, { event: 'payment.captured', payload: {} }),
  );

  check('an event with no order reference is ignored', noReference.outcome === 'NO_ORDER_REFERENCE');

  const noRefundId = await handleWebhookEvent(
    env,
    signedEvent(webhookSecret, { event: 'refund.processed', payload: { refund: { entity: { id: '' } } } }),
  );

  check('a refund event with no refund id is ignored', noRefundId.outcome === 'NO_REFUND_ID');

  const unknownRefund = await handleWebhookEvent(
    env,
    signedEvent(webhookSecret, {
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_p15unknown', status: 'processed' } } },
    }),
  );

  check('a refund ZyCart never issued is ignored', unknownRefund.outcome === 'UNKNOWN_REFUND');
}

/* ---------------------------------------------------------------- */
/* 4 · Payment finalisation                                          */
/* ---------------------------------------------------------------- */

/**
 * §35/§36/§37: the real transaction, with a stubbed gateway.
 */
async function verifyFinalization(env: Env, fixtures: Fixtures): Promise<void> {
  section('Payment finalisation');

  const product = await makeProduct(fixtures, 'Finalize');
  const order = await makeOrder(fixtures, { product, quantity: 2 });

  const state: StubState = {
    payment: capturedPayment(order.payment.razorpayOrderId ?? '', order.pricing.total),
    refund: { id: 'rfnd_p15stub0001', status: 'processed', amountInPaise: 0 },
    fetchCalls: 0,
    refundCalls: 0,
    refundThrows: false,
  };

  const gateway = stubGateway(state);

  const result = await finalizeSuccessfulPayment(env, order, state.payment.id, gateway);

  check('a captured payment finalises the order', result.outcome === 'FINALIZED');

  const confirmed = await Order.findById(order._id);

  check('the order is confirmed', confirmed?.status === 'CONFIRMED');
  check('the payment is paid', confirmed?.payment.status === 'PAID');
  check('with the gateway payment id recorded', confirmed?.payment.razorpayPaymentId === state.payment.id);
  check('and when it was paid', confirmed?.payment.paidAt !== null);
  check('stock is marked committed', confirmed?.stockCommitted === true);
  check('and the stock was actually taken', (await stockOf(product._id)) === 18);

  check(
    'a SALE movement explains the decrement',
    (await InventoryMovement.countDocuments({ product: product._id, type: 'SALE' })) === 1,
  );

  /**
   * §33 · the duplicate that matters most. A second call with the same payment
   * must not take stock again — and must not even reach the gateway, which the
   * call counter proves.
   */
  const fetchesBefore = state.fetchCalls;
  const again = await finalizeSuccessfulPayment(env, confirmed ?? order, state.payment.id, gateway);

  check('a second finalisation reports it was already done', again.outcome === 'ALREADY_FINALIZED');
  check('without asking the gateway again', state.fetchCalls === fetchesBefore);
  check('and without taking stock twice', (await stockOf(product._id)) === 18);
  check(
    'and without writing a second movement',
    (await InventoryMovement.countDocuments({ product: product._id, type: 'SALE' })) === 1,
  );

  /* §34 · two requests racing for one unpaid order. */
  const raceProduct = await makeProduct(fixtures, 'Race');
  const raceOrder = await makeOrder(fixtures, { product: raceProduct, quantity: 3 });

  const raceState: StubState = {
    payment: capturedPayment(raceOrder.payment.razorpayOrderId ?? '', raceOrder.pricing.total),
    refund: { id: 'rfnd_p15stub0002', status: 'processed', amountInPaise: 0 },
    fetchCalls: 0,
    refundCalls: 0,
    refundThrows: false,
  };

  const raceGateway = stubGateway(raceState);

  const [a, b] = await Promise.all([
    finalizeSuccessfulPayment(env, raceOrder, raceState.payment.id, raceGateway),
    finalizeSuccessfulPayment(
      env,
      (await Order.findById(raceOrder._id))!,
      raceState.payment.id,
      raceGateway,
    ),
  ]);

  const finalized = [a, b].filter((outcome) => outcome.outcome === 'FINALIZED').length;

  check('exactly one of two concurrent finalisations wins', finalized === 1);
  check('and stock moved exactly once', (await stockOf(raceProduct._id)) === 17);
  check(
    'with exactly one movement',
    (await InventoryMovement.countDocuments({ product: raceProduct._id, type: 'SALE' })) === 1,
  );
}

/**
 * §36 and the guards that run before the gateway is ever consulted.
 */
async function verifyFinalizationGuards(env: Env, fixtures: Fixtures): Promise<void> {
  section('Finalisation refuses what it should');

  const product = await makeProduct(fixtures, 'Guards');

  /* A gateway that reports the payment failed. */
  const failedOrder = await makeOrder(fixtures, { product });
  const failedState: StubState = {
    payment: {
      ...capturedPayment(failedOrder.payment.razorpayOrderId ?? '', failedOrder.pricing.total),
      status: 'failed',
      captured: false,
      errorDescription: 'Insufficient funds',
    },
    refund: { id: 'x', status: 'processed', amountInPaise: 0 },
    fetchCalls: 0,
    refundCalls: 0,
    refundThrows: false,
  };

  const failed = await finalizeSuccessfulPayment(
    env,
    failedOrder,
    failedState.payment.id,
    stubGateway(failedState),
  );

  const afterFailed = await Order.findById(failedOrder._id);

  check('a failed payment does not confirm the order', failed.outcome === 'PAYMENT_FAILED');
  check('the order stays pending', afterFailed?.status === 'PENDING');
  check('the payment is marked failed', afterFailed?.payment.status === 'FAILED');
  check('with the reason the gateway gave', afterFailed?.payment.failureReason === 'Insufficient funds');
  check('and no stock was committed', afterFailed?.stockCommitted === false);

  /* Authorised but not captured: nothing is confirmed on the strength of it. */
  const authOrder = await makeOrder(fixtures, { product });
  const authState: StubState = {
    payment: {
      ...capturedPayment(authOrder.payment.razorpayOrderId ?? '', authOrder.pricing.total),
      status: 'authorized',
      captured: false,
    },
    refund: { id: 'x', status: 'processed', amountInPaise: 0 },
    fetchCalls: 0,
    refundCalls: 0,
    refundThrows: false,
  };

  const authorised = await finalizeSuccessfulPayment(
    env,
    authOrder,
    authState.payment.id,
    stubGateway(authState),
  );

  const afterAuth = await Order.findById(authOrder._id);

  check('an authorised payment is not a confirmed order', authorised.outcome === 'AWAITING_CAPTURE');
  check('the payment is recorded as authorised', afterAuth?.payment.status === 'AUTHORIZED');
  check('and no stock was taken on an authorisation', afterAuth?.stockCommitted === false);

  /* An amount that does not match the order. */
  const amountOrder = await makeOrder(fixtures, { product });
  const amountState: StubState = {
    payment: {
      ...capturedPayment(amountOrder.payment.razorpayOrderId ?? '', 1),
      amountInPaise: 100,
    },
    refund: { id: 'x', status: 'processed', amountInPaise: 0 },
    fetchCalls: 0,
    refundCalls: 0,
    refundThrows: false,
  };

  await refuses(
    'refuses a payment for the wrong amount',
    () =>
      finalizeSuccessfulPayment(env, amountOrder, amountState.payment.id, stubGateway(amountState)),
    { status: 409 },
  );

  check(
    'and leaves that order unpaid',
    (await Order.findById(amountOrder._id))?.payment.status === 'PENDING',
  );

  /* A payment issued against somebody else's gateway order. */
  const foreignOrder = await makeOrder(fixtures, { product });
  const foreignState: StubState = {
    payment: capturedPayment('order_p15somebodyelse', foreignOrder.pricing.total),
    refund: { id: 'x', status: 'processed', amountInPaise: 0 },
    fetchCalls: 0,
    refundCalls: 0,
    refundThrows: false,
  };

  await refuses(
    'refuses a payment that belongs to another gateway order',
    () =>
      finalizeSuccessfulPayment(
        env,
        foreignOrder,
        foreignState.payment.id,
        stubGateway(foreignState),
      ),
    { status: 409, match: /match/i },
  );

  /* A currency that is not INR. */
  const currencyOrder = await makeOrder(fixtures, { product });
  const currencyState: StubState = {
    payment: {
      ...capturedPayment(currencyOrder.payment.razorpayOrderId ?? '', currencyOrder.pricing.total),
      currency: 'USD',
    },
    refund: { id: 'x', status: 'processed', amountInPaise: 0 },
    fetchCalls: 0,
    refundCalls: 0,
    refundThrows: false,
  };

  await refuses(
    'refuses a payment in another currency',
    () =>
      finalizeSuccessfulPayment(
        env,
        currencyOrder,
        currencyState.payment.id,
        stubGateway(currencyState),
      ),
    { status: 409 },
  );

  /**
   * A tampered order — the lines no longer add up to the stored total. Refused
   * before the gateway is consulted at all, which the fetch counter proves.
   */
  const tamperedOrder = await makeOrder(fixtures, { product });
  await Order.updateOne({ _id: tamperedOrder._id }, { $set: { 'pricing.total': 1 } });

  const tamperedState: StubState = {
    payment: capturedPayment(tamperedOrder.payment.razorpayOrderId ?? '', 1),
    refund: { id: 'x', status: 'processed', amountInPaise: 0 },
    fetchCalls: 0,
    refundCalls: 0,
    refundThrows: false,
  };

  const reloadedTampered = await Order.findById(tamperedOrder._id);

  await refuses(
    'refuses an order whose total no longer matches its lines',
    () =>
      finalizeSuccessfulPayment(
        env,
        reloadedTampered!,
        tamperedState.payment.id,
        stubGateway(tamperedState),
      ),
    { status: 409 },
  );

  check('without consulting the gateway at all', tamperedState.fetchCalls === 0);

  /* A cancelled order cannot be paid into. */
  const cancelledOrder = await makeOrder(fixtures, { product, status: 'CANCELLED' });
  const cancelledState: StubState = {
    payment: capturedPayment(cancelledOrder.payment.razorpayOrderId ?? '', cancelledOrder.pricing.total),
    refund: { id: 'x', status: 'processed', amountInPaise: 0 },
    fetchCalls: 0,
    refundCalls: 0,
    refundThrows: false,
  };

  const cancelled = await finalizeSuccessfulPayment(
    env,
    cancelledOrder,
    cancelledState.payment.id,
    stubGateway(cancelledState),
  );

  check('a cancelled order is not payable', cancelled.outcome === 'NOT_PAYABLE');
  check('and the gateway was not consulted', cancelledState.fetchCalls === 0);
}

/**
 * §37: money in, nothing to ship.
 */
async function verifyUnfulfillableRefund(env: Env, fixtures: Fixtures): Promise<void> {
  section('Captured but unfulfillable');

  const product = await makeProduct(fixtures, 'Unfulfillable', 1);
  const order = await makeOrder(fixtures, { product, quantity: 1 });

  // Somebody else bought the last unit between Checkout opening and the payment
  // landing. This is the exact race the refund path exists for.
  await Product.updateOne({ _id: product._id }, { $set: { stock: 0 } });

  const state: StubState = {
    payment: capturedPayment(order.payment.razorpayOrderId ?? '', order.pricing.total),
    refund: { id: 'rfnd_p15unfulfil', status: 'processed', amountInPaise: order.pricing.total * 100 },
    fetchCalls: 0,
    refundCalls: 0,
    refundThrows: false,
  };

  const result = await finalizeSuccessfulPayment(env, order, state.payment.id, stubGateway(state));

  const after = await Order.findById(order._id);

  check('the payment is refunded rather than confirmed', result.outcome === 'REFUNDED_UNFULFILLABLE');
  check('exactly one refund was issued', state.refundCalls === 1);
  check('the order is cancelled', after?.status === 'CANCELLED');
  check('the payment is refunded', after?.payment.status === 'REFUNDED');
  check('the refund id is recorded', after?.payment.refundId === state.refund.id);
  check('the refunded total matches the order', after?.payment.refundedAmount === order.pricing.total);
  check('the customer is told why', (after?.cancellationReason ?? '').length > 0);
  check('no stock was taken', (await stockOf(product._id)) === 0);
  check(
    'and no SALE movement was written',
    (await InventoryMovement.countDocuments({ product: product._id, type: 'SALE' })) === 0,
  );

  /* A duplicate arriving mid-refund must not start a second one. */
  const duplicate = await finalizeSuccessfulPayment(
    env,
    (await Order.findById(order._id))!,
    state.payment.id,
    stubGateway(state),
  );

  check('a duplicate does not refund twice', state.refundCalls === 1);
  check('and reports the existing outcome', duplicate.outcome === 'REFUNDED_UNFULFILLABLE');
}

/* ---------------------------------------------------------------- */
/* 5 · Refund webhooks                                               */
/* ---------------------------------------------------------------- */

/**
 * §40/§85: `refund.processed`, `refund.failed`, and duplicates of both.
 */
async function verifyRefundWebhooks(
  env: Env,
  webhookSecret: string,
  fixtures: Fixtures,
): Promise<void> {
  section('Refund webhooks');

  const product = await makeProduct(fixtures, 'Refund');
  const order = await makeOrder(fixtures, {
    product,
    status: 'DELIVERED',
    paymentStatus: 'PAID',
    stockCommitted: true,
  });

  const refundId = 'rfnd_p15webhook1';

  const request = await ReturnRequest.create({
    returnNumber: `ZYR-P15-${String(sequence).padStart(4, '0')}`,
    order: order._id,
    orderNumber: order.orderNumber,
    user: fixtures.customerId,
    status: 'REFUND_PENDING',
    items: [
      {
        orderItemId: order.items[0]?._id,
        product: product._id,
        productName: product.name,
        unitPrice: product.price,
        purchasedQuantity: 2,
        requestedQuantity: 1,
        approvedQuantity: 1,
        reason: 'DAMAGED',
      },
    ],
    requestedAt: new Date(),
    refund: {
      amount: product.price,
      claimedAt: new Date(),
      razorpayRefundId: refundId,
      initiatedAt: new Date(),
    },
  });

  await Order.updateOne({ _id: order._id }, { $inc: { 'payment.refundedAmount': product.price } });

  const processed = signedEvent(webhookSecret, {
    event: 'refund.processed',
    payload: { refund: { entity: { id: refundId, status: 'processed', payment_id: 'pay_p15r' } } },
  });

  const first = await handleWebhookEvent(env, processed);

  check('a settled refund is handled', first.outcome === 'RETURN_REFUND_SETTLED');

  const settled = await ReturnRequest.findById(request._id);

  check('the return is refunded', settled?.status === 'REFUNDED');
  check('with a completion time', settled?.refund?.completedAt !== null);

  check(
    'and exactly one refund-completed message was raised',
    (await NotificationDelivery.countDocuments({
      entityId: request._id,
      event: 'REFUND_COMPLETED',
    })) === 1,
  );

  /* §85 · the same event again. */
  const repeat = await handleWebhookEvent(env, processed);

  check('a redelivered refund event is a duplicate', repeat.duplicate === true);
  check(
    'and raises no second message',
    (await NotificationDelivery.countDocuments({
      entityId: request._id,
      event: 'REFUND_COMPLETED',
    })) === 1,
  );

  /**
   * A *different* event id carrying the same refund. The event-id ledger cannot
   * catch this one — Razorpay could legitimately send `refund.processed` twice
   * with different ids — so the conditional update on `status: REFUND_PENDING`
   * is what has to.
   */
  const reissued = signedEvent(webhookSecret, {
    event: 'refund.processed',
    payload: { refund: { entity: { id: refundId, status: 'processed' } } },
  });

  const again = await handleWebhookEvent(env, reissued);

  check('the same refund under a new event id changes nothing', again.outcome === 'RETURN_REFUND_UNCHANGED');
  check(
    'and still raises no second message',
    (await NotificationDelivery.countDocuments({
      entityId: request._id,
      event: 'REFUND_COMPLETED',
    })) === 1,
  );

  const orderAfter = await Order.findById(order._id);

  check(
    'the refunded total was not counted twice',
    orderAfter?.payment.refundedAmount === product.price,
  );

  /* §40 · a refund the gateway reports as failed. */
  const failedRefundId = 'rfnd_p15webhook2';

  const failing = await ReturnRequest.create({
    returnNumber: `ZYR-P15-${String(sequence + 1).padStart(4, '0')}`,
    order: order._id,
    orderNumber: order.orderNumber,
    user: fixtures.customerId,
    status: 'REFUND_PENDING',
    items: [
      {
        orderItemId: order.items[0]?._id,
        product: product._id,
        productName: product.name,
        unitPrice: product.price,
        purchasedQuantity: 2,
        requestedQuantity: 1,
        approvedQuantity: 1,
        reason: 'DAMAGED',
      },
    ],
    requestedAt: new Date(),
    refund: {
      amount: product.price,
      claimedAt: new Date(),
      razorpayRefundId: failedRefundId,
      initiatedAt: new Date(),
    },
  });

  await Order.updateOne({ _id: order._id }, { $inc: { 'payment.refundedAmount': product.price } });

  const failedEvent = await handleWebhookEvent(
    env,
    signedEvent(webhookSecret, {
      event: 'refund.failed',
      payload: { refund: { entity: { id: failedRefundId, status: 'failed' } } },
    }),
  );

  check('a failed refund is handled', failedEvent.outcome === 'RETURN_REFUND_FAILED');

  const reverted = await ReturnRequest.findById(failing._id);

  check('the return goes back so it can be retried', reverted?.status === 'RECEIVED');
  check('the gateway refund id is cleared', reverted?.refund?.razorpayRefundId === null);
  check('and the reason is recorded', (reverted?.refund?.failureReason ?? '').length > 0);

  check(
    'no refund-completed message was raised for a failed refund',
    (await NotificationDelivery.countDocuments({
      entityId: failing._id,
      event: 'REFUND_COMPLETED',
    })) === 0,
  );

  check(
    'and the refunded total was taken back off the order',
    (await Order.findById(order._id))?.payment.refundedAmount === product.price,
  );

  /**
   * §63 · two `refund.processed` events for one refund, concurrently, with
   * different event ids. Only the conditional update stands between this and a
   * second customer email.
   */
  const raceRefundId = 'rfnd_p15webhook3';

  const racing = await ReturnRequest.create({
    returnNumber: `ZYR-P15-${String(sequence + 2).padStart(4, '0')}`,
    order: order._id,
    orderNumber: order.orderNumber,
    user: fixtures.customerId,
    status: 'REFUND_PENDING',
    items: [
      {
        orderItemId: order.items[0]?._id,
        product: product._id,
        productName: product.name,
        unitPrice: product.price,
        purchasedQuantity: 2,
        requestedQuantity: 1,
        approvedQuantity: 1,
        reason: 'DAMAGED',
      },
    ],
    requestedAt: new Date(),
    refund: {
      amount: product.price,
      claimedAt: new Date(),
      razorpayRefundId: raceRefundId,
      initiatedAt: new Date(),
    },
  });

  const results = await Promise.all([
    applyRefundOutcome({ env, returnId: racing._id, refundId: raceRefundId, status: 'processed', actor: null }),
    applyRefundOutcome({ env, returnId: racing._id, refundId: raceRefundId, status: 'processed', actor: null }),
  ]);

  const settledCount = results.filter((outcome) => outcome === 'SETTLED').length;

  check('exactly one of two concurrent settlements takes effect', settledCount === 1);
  check(
    'and exactly one refund-completed message exists',
    (await NotificationDelivery.countDocuments({
      entityId: racing._id,
      event: 'REFUND_COMPLETED',
    })) === 1,
  );
}

/* ---------------------------------------------------------------- */
/* 6 · Hostile payloads                                              */
/* ---------------------------------------------------------------- */

/**
 * §42/§43: a correctly signed payload is still untrusted input.
 *
 * A valid signature proves the bytes came from Razorpay. It proves nothing
 * about whether the fields inside them are ones ZyCart should act on, and the
 * protection is that every consumer names what it reads rather than spreading
 * the payload into an update.
 */
async function verifyHostilePayloads(
  env: Env,
  webhookSecret: string,
  fixtures: Fixtures,
): Promise<void> {
  section('Signed but hostile payloads');

  const product = await makeProduct(fixtures, 'Hostile');
  const order = await makeOrder(fixtures, { product });

  const before = await Order.findById(order._id);

  const outcome = await handleWebhookEvent(
    env,
    signedEvent(webhookSecret, {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_p15hostile1',
            order_id: order.payment.razorpayOrderId,
            // Everything below is an attempt to reach the document directly.
            $set: { 'payment.status': 'PAID', status: 'CONFIRMED' },
            $inc: { 'pricing.total': -100000 },
            $unset: { stockCommitted: '' },
            status: 'PAID',
            pricing: { total: 1 },
            stockCommitted: true,
            user: new Types.ObjectId(),
          },
        },
      },
    }),
  );

  const after = await Order.findById(order._id);

  check('the event is handled on its merits', outcome.outcome === 'PAYMENT_FAILED');
  check('the smuggled status did not apply', after?.status === 'PENDING');
  check('the payment is failed, not paid', after?.payment.status === 'FAILED');
  check('the total is untouched', after?.pricing.total === before?.pricing.total);
  check('stockCommitted is untouched', after?.stockCommitted === false);
  check('the owner is untouched', String(after?.user) === String(before?.user));

  /* An oversized failure reason must be bounded rather than stored whole. */
  const longOrder = await makeOrder(fixtures, { product });

  await handleWebhookEvent(
    env,
    signedEvent(webhookSecret, {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_p15hostile2',
            order_id: longOrder.payment.razorpayOrderId,
            error_description: 'x'.repeat(10_000),
          },
        },
      },
    }),
  );

  const bounded = await Order.findById(longOrder._id);

  check(
    'an oversized gateway message is truncated',
    (bounded?.payment.failureReason ?? '').length <= 300,
  );

  /* A late failure must not undo a payment that succeeded. */
  const paidProduct = await makeProduct(fixtures, 'LateFail');
  const paidOrder = await makeOrder(fixtures, {
    product: paidProduct,
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    stockCommitted: true,
  });

  const late = await handleWebhookEvent(
    env,
    signedEvent(webhookSecret, {
      event: 'payment.failed',
      payload: {
        payment: { entity: { id: 'pay_p15late001', order_id: paidOrder.payment.razorpayOrderId } },
      },
    }),
  );

  const stillPaid = await Order.findById(paidOrder._id);

  check('a late failure for a paid order changes nothing', late.outcome === 'IGNORED_STALE_FAILURE');
  check('the order is still paid', stillPaid?.payment.status === 'PAID');
  check('and still confirmed', stillPaid?.status === 'CONFIRMED');
}

/* ---------------------------------------------------------------- */
/* 7 · Reconciliation                                                */
/* ---------------------------------------------------------------- */

/**
 * §65: invariants over everything this run created.
 */
async function verifyReconciliation(fixtures: Fixtures): Promise<void> {
  section('Payment invariants across the fixtures');

  const orders = await Order.find({ _id: { $in: fixtures.orderIds } });

  let paidWithoutId = 0;
  let overRefunded = 0;
  let paidWithoutTime = 0;
  let refundedWithoutRefundId = 0;

  for (const order of orders) {
    if (order.payment.status === 'PAID') {
      if (!order.payment.razorpayPaymentId) paidWithoutId += 1;
      if (!order.payment.paidAt) paidWithoutTime += 1;
    }

    if ((order.payment.refundedAmount ?? 0) > order.pricing.total) overRefunded += 1;

    if (order.payment.status === 'REFUNDED' && !order.payment.refundId) {
      refundedWithoutRefundId += 1;
    }
  }

  check('every paid order has a gateway payment id', paidWithoutId === 0);
  check('every paid order records when it was paid', paidWithoutTime === 0);
  check('no order was refunded beyond its total', overRefunded === 0);
  check('every refunded order has a refund id', refundedWithoutRefundId === 0);

  const returns = await ReturnRequest.find({ order: { $in: fixtures.orderIds } });

  const refundedWithoutCompletion = returns.filter(
    (request) => request.status === 'REFUNDED' && !request.refund?.completedAt,
  ).length;

  check('every refunded return records when it completed', refundedWithoutCompletion === 0);
}

/* ---------------------------------------------------------------- */

async function main(): Promise<void> {
  const { env, webhookSecret } = verificationEnv();

  /**
   * The same guard the notification script has, for the same reason: this drives
   * real domain transitions, and those raise customer notifications.
   */
  if (env.EMAIL_PROVIDER !== 'mock') {
    console.error(
      `Refusing to run: EMAIL_PROVIDER is "${env.EMAIL_PROVIDER}". This script drives real\n` +
        'domain transitions and must never be able to send mail. Set EMAIL_PROVIDER=mock.',
    );
    process.exitCode = 1;
    return;
  }

  await connectDatabase(env.MONGODB_URI);

  console.log('\nPhase 15 · payment and webhook verification');
  console.log(`Database: ${mongoose.connection.name}`);
  console.log('Gateway:  stubbed — no request is made to Razorpay');
  console.log('Secrets:  generated in this process, for signing payloads it then verifies');
  console.log('Email:    mock (nothing is delivered)');
  console.log('Creating temporary verification data…');

  const fixtures = await createFixtures();

  try {
    await verifySignedPipeline(env, webhookSecret, fixtures);
    await verifyDeduplication(env, webhookSecret, fixtures);
    await verifyIgnoredEvents(env, webhookSecret);
    await verifyFinalization(env, fixtures);
    await verifyFinalizationGuards(env, fixtures);
    await verifyUnfulfillableRefund(env, fixtures);
    await verifyRefundWebhooks(env, webhookSecret, fixtures);
    await verifyHostilePayloads(env, webhookSecret, fixtures);
    await verifyReconciliation(fixtures);
  } finally {
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
