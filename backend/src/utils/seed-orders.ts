import 'dotenv/config';
import { randomInt } from 'node:crypto';
import mongoose from 'mongoose';
import { gstRateOf } from '../config/commerce';
import { connectDatabase } from '../config/database';
// Registered for the category populate below; nothing else in this script loads it.
import '../models/category.model';
import { Order } from '../models/order.model';
import { Product } from '../models/product.model';
import { Review } from '../models/review.model';
import { User } from '../models/user.model';
import { priceOrder } from '../services/pricing/pricing';
import { generateOrderNumber } from './orderNumber';

/**
 * Populates the development database with orders in the states the admin
 * screens actually have to handle:
 *
 *  - DELIVERED, paid (a mix of COD and Razorpay) — history the returns and
 *    review flows can stand on, with `deliveredAt` set.
 *  - Paid but not yet delivered — CONFIRMED / PROCESSING / SHIPPED with a
 *    settled Razorpay payment, the middle of the fulfilment pipeline.
 *  - Awaiting payment — PENDING orders whose Razorpay payment never happened,
 *    some with an abandoned gateway order attached, some that never reached
 *    Checkout at all.
 *
 * Every order is a genuine snapshot in the shape checkout writes: line items
 * copied from real products (name, SKU, image, price, a colour and size the
 * product actually offers), totals that add up, and payment fields that match
 * how `payment.service` records them.
 *
 * Safety:
 *
 *  - Demo customers use the same `@zycart.demo` addresses as `seed:reviews`,
 *    so the two scripts share people instead of inventing two casts.
 *  - Orders are marked `stockCommitted: false` and **do not decrement stock**;
 *    they stand in for history, and cancellation cannot "restore" inventory
 *    they never held.
 *  - Gateway ids carry a `zyseed` marker, so they can never be mistaken for a
 *    real Razorpay order and `--clean` can find them again.
 *  - Re-running adds a fresh batch; `--clean` removes every order this script
 *    created and nothing else (review-backed orders belong to `seed:reviews`).
 *
 *   pnpm seed:orders
 *   pnpm seed:orders --clean
 */

const DEMO_EMAIL_DOMAIN = 'zycart.demo';

/** A bcrypt-shaped placeholder. These accounts are not sign-in-able by design. */
const UNUSABLE_PASSWORD = '$2b$10$seedreviewsdemoaccountnotusableforsigninxxxxxxxxxxxxx';

/** Marks every gateway id this script writes, so `--clean` can find them. */
const SEED_MARKER = 'zyseed';

/** Same cast as seed-reviews, with a home city each so addresses vary. */
const PEOPLE: readonly [string, string, string, string, string][] = [
  ['Ananya', 'Rao', 'Bengaluru', 'Karnataka', '560038'],
  ['Karthik', 'Menon', 'Kochi', 'Kerala', '682016'],
  ['Priya', 'Sharma', 'Jaipur', 'Rajasthan', '302012'],
  ['Devan', 'Iyer', 'Chennai', 'Tamil Nadu', '600040'],
  ['Meera', 'Nair', 'Thiruvananthapuram', 'Kerala', '695010'],
  ['Rohan', 'Kulkarni', 'Pune', 'Maharashtra', '411038'],
  ['Sneha', 'Reddy', 'Hyderabad', 'Telangana', '500081'],
  ['Arjun', 'Desai', 'Ahmedabad', 'Gujarat', '380015'],
  ['Fatima', 'Sheikh', 'Mumbai', 'Maharashtra', '400050'],
  ['Vikram', 'Patel', 'Surat', 'Gujarat', '395007'],
  ['Neha', 'Joshi', 'Indore', 'Madhya Pradesh', '452010'],
  ['Aditya', 'Bose', 'Kolkata', 'West Bengal', '700019'],
];

const STREETS = [
  '14 Lakeview Residency',
  '2nd Floor, Prestige Meadows',
  '88 MG Road',
  '7 Green Park Colony',
  'B-304 Shanti Heights',
  '21 Rosewood Lane',
];

const pick = <T>(items: readonly T[]): T => items[randomInt(items.length)] as T;

const daysAgo = (days: number, jitterMinutes = 12 * 60): Date =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000 - randomInt(jitterMinutes) * 60 * 1000);

const minutesAfter = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60 * 1000);

/** `order_zyseedAB12CD34` — obviously fake, uniquely ours, unique per call. */
function gatewayId(prefix: 'order' | 'pay'): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let suffix = '';
  for (let index = 0; index < 8; index += 1) suffix += alphabet[randomInt(alphabet.length)];
  return `${prefix}_${SEED_MARKER}${suffix}`;
}

async function ensureDemoCustomers() {
  const customers = [];

  for (const [index, [firstName, lastName, city, state, postalCode]] of PEOPLE.entries()) {
    const email = `${firstName}.${lastName}.${index + 1}@${DEMO_EMAIL_DOMAIN}`.toLowerCase();

    const user =
      (await User.findOne({ email })) ??
      (await User.create({
        firstName,
        lastName,
        email,
        password: UNUSABLE_PASSWORD,
        isActive: true,
        addresses: [
          {
            label: 'Home',
            fullName: `${firstName} ${lastName}`,
            phone: `98765${String(10000 + index * 731).slice(0, 5)}`,
            addressLine1: pick(STREETS),
            city,
            state,
            postalCode,
            country: 'India',
            isDefault: true,
          },
        ],
      }));

    customers.push(user);
  }

  return customers;
}

type ProductDoc = InstanceType<typeof Product>;
type UserDoc = InstanceType<typeof User>;

/** A line the way checkout snapshots it, with a colour/size the product offers. */
function buildItem(product: ProductDoc, quantity: number) {
  const colors = product.colors ?? [];
  const sizes = (product.sizes ?? []).filter((size) => size.inStock);
  // A product with stock per variant sells only the pairs it lists (Phase 20),
  // so a demo line names one of those rather than an arbitrary combination.
  const variant = product.variants.length > 0 ? pick(product.variants) : null;
  // Populated by the query below. The rate is copied onto the line exactly as
  // checkout copies it, so a demo order's invoice reads like a real one's.
  const category = product.category as unknown as {
    gstRate?: number | null;
    hsnCode?: string;
  } | null;

  return {
    product: product._id,
    productName: product.name,
    productSlug: product.slug,
    productImage: product.images[0] ?? '',
    sku: product.sku,
    brand: '',
    quantity,
    unitPrice: product.price,
    lineTotal: product.price * quantity,
    selectedColor: variant ? (variant.color ?? null) : colors.length > 0 ? pick(colors).name : null,
    selectedSize: variant ? (variant.size ?? null) : sizes.length > 0 ? pick(sizes).label : null,
    returnedQuantity: 0,
    gstRate: gstRateOf(category),
    hsnCode: category?.hsnCode ?? '',
  };
}

interface OrderSpec {
  status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED';
  method: 'COD' | 'RAZORPAY';
  paymentStatus: 'PENDING' | 'PAID';
  /** Days ago the order was placed. */
  placedDaysAgo: number;
  /** For PENDING payments: whether Checkout was opened before abandoning. */
  gatewayOrderOpened?: boolean;
  /** For DELIVERED: days between placing and delivery. */
  deliveryLagDays?: number;
}

/**
 * The batch. Deliveries are oldest, the fulfilment pipeline is recent, and
 * unpaid orders are hours-to-a-day old — the ages those states really have.
 */
const ORDER_SPECS: OrderSpec[] = [
  // Delivered and paid — three COD, two Razorpay.
  {
    status: 'DELIVERED',
    method: 'COD',
    paymentStatus: 'PAID',
    placedDaysAgo: 28,
    deliveryLagDays: 4,
  },
  {
    status: 'DELIVERED',
    method: 'COD',
    paymentStatus: 'PAID',
    placedDaysAgo: 21,
    deliveryLagDays: 3,
  },
  {
    status: 'DELIVERED',
    method: 'COD',
    paymentStatus: 'PAID',
    placedDaysAgo: 16,
    deliveryLagDays: 5,
  },
  {
    status: 'DELIVERED',
    method: 'RAZORPAY',
    paymentStatus: 'PAID',
    placedDaysAgo: 12,
    deliveryLagDays: 3,
  },
  {
    status: 'DELIVERED',
    method: 'RAZORPAY',
    paymentStatus: 'PAID',
    placedDaysAgo: 9,
    deliveryLagDays: 4,
  },

  // Paid online, still moving through fulfilment.
  { status: 'CONFIRMED', method: 'RAZORPAY', paymentStatus: 'PAID', placedDaysAgo: 1 },
  { status: 'CONFIRMED', method: 'RAZORPAY', paymentStatus: 'PAID', placedDaysAgo: 2 },
  { status: 'PROCESSING', method: 'RAZORPAY', paymentStatus: 'PAID', placedDaysAgo: 3 },
  { status: 'PROCESSING', method: 'RAZORPAY', paymentStatus: 'PAID', placedDaysAgo: 2 },
  { status: 'SHIPPED', method: 'RAZORPAY', paymentStatus: 'PAID', placedDaysAgo: 4 },

  // Awaiting payment — two abandoned at Checkout, two that never opened it.
  {
    status: 'PENDING',
    method: 'RAZORPAY',
    paymentStatus: 'PENDING',
    placedDaysAgo: 0,
    gatewayOrderOpened: true,
  },
  {
    status: 'PENDING',
    method: 'RAZORPAY',
    paymentStatus: 'PENDING',
    placedDaysAgo: 1,
    gatewayOrderOpened: true,
  },
  { status: 'PENDING', method: 'RAZORPAY', paymentStatus: 'PENDING', placedDaysAgo: 0 },
  { status: 'PENDING', method: 'RAZORPAY', paymentStatus: 'PENDING', placedDaysAgo: 1 },
];

async function createOrder(spec: OrderSpec, customer: UserDoc, products: ProductDoc[]) {
  const address = customer.addresses[0];
  if (!address) throw new Error(`demo customer ${customer.email} has no address`);

  // One to three distinct products per order, one or two units each.
  const lineCount = 1 + randomInt(3);
  const chosen = [...products].sort(() => Math.random() - 0.5).slice(0, lineCount);
  const built = chosen.map((product) => buildItem(product, 1 + randomInt(2)));

  // Priced by the same function checkout uses, so delivery, GST and the total
  // obey the rules a real order does (Phase 18). No coupon on demo orders.
  const priced = priceOrder(
    built.map((item) => ({ lineTotal: item.lineTotal, gstRate: item.gstRate })),
  );
  const items = built.map((item, index) => ({ ...item, ...priced.lines[index] }));

  const placedAt = daysAgo(spec.placedDaysAgo);

  const deliveredAt =
    spec.status === 'DELIVERED'
      ? minutesAfter(placedAt, (spec.deliveryLagDays ?? 3) * 24 * 60 + randomInt(10 * 60))
      : null;

  // COD money moves at the doorstep; online money moves minutes after placing.
  const paidAt =
    spec.paymentStatus === 'PAID'
      ? spec.method === 'COD'
        ? deliveredAt
        : minutesAfter(placedAt, 2 + randomInt(9))
      : null;

  const gatewayInvolved =
    spec.method === 'RAZORPAY' &&
    (spec.paymentStatus === 'PAID' || spec.gatewayOrderOpened === true);

  const payment = {
    method: spec.method,
    status: spec.paymentStatus,
    provider: gatewayInvolved ? 'razorpay' : null,
    razorpayOrderId: gatewayInvolved ? gatewayId('order') : null,
    razorpayPaymentId:
      spec.method === 'RAZORPAY' && spec.paymentStatus === 'PAID' ? gatewayId('pay') : null,
    supersededRazorpayOrderIds: [],
    paidAt,
    failureReason: null,
    refundId: null,
    refundedAt: null,
    refundReason: null,
    refundedAmount: 0,
  };

  const [order] = await Order.create([
    {
      orderNumber: generateOrderNumber(placedAt),
      user: customer._id,
      items,
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country,
      },
      pricing: priced.pricing,
      payment,
      status: spec.status,
      // Standing in for history: no stock was taken, so none can come back.
      stockCommitted: false,
      sourceCartItemIds: [],
      deliveredAt,
    },
  ]);

  if (!order) throw new Error(`could not create a demo ${spec.status} order`);

  // Backdate the document itself so lists sort the way real history would.
  await Order.updateOne(
    { _id: order._id },
    { $set: { createdAt: placedAt, updatedAt: deliveredAt ?? paidAt ?? placedAt } },
    { timestamps: false },
  );

  return order;
}

async function seed(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await connectDatabase(uri);
  console.log(`Database: ${mongoose.connection.name}`);

  const customers = await ensureDemoCustomers();
  console.log(`${customers.length} demo customer(s) ready (@${DEMO_EMAIL_DOMAIN})`);

  const products = await Product.find({ isActive: true, stock: { $gt: 0 } }).populate(
    'category',
    'gstRate hsnCode',
  );
  if (products.length === 0) throw new Error('No active products — run `pnpm seed` first');
  console.log(`${products.length} active product(s) to order from\n`);

  // Spread the batch across the cast so no one customer owns the pipeline.
  const shuffled = [...customers].sort(() => Math.random() - 0.5);

  let created = 0;
  for (const [index, spec] of ORDER_SPECS.entries()) {
    const customer = shuffled[index % shuffled.length] as UserDoc;
    const order = await createOrder(spec, customer, products);

    const paymentLabel = `${spec.method} ${spec.paymentStatus}`;
    console.log(
      `  ${order.orderNumber}  ${spec.status.padEnd(10)} ${paymentLabel.padEnd(17)} ` +
        `₹${order.pricing.total.toLocaleString('en-IN').padStart(9)}  ${customer.firstName} ${customer.lastName}`,
    );
    created += 1;
  }

  const byStatus = await Order.aggregate([
    { $group: { _id: { status: '$status', payment: '$payment.status' }, count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  console.log(`\nCreated ${created} order(s). Orders now in the database:`);
  for (const row of byStatus) {
    console.log(
      `  ${String(row._id.status).padEnd(10)} / payment ${String(row._id.payment).padEnd(8)} × ${row.count}`,
    );
  }

  await mongoose.disconnect();
}

/**
 * Removes exactly what this script creates, and nothing else.
 *
 * Two nets, both scoped to demo customers: gateway ids carrying the seed
 * marker catch every Razorpay-shaped order, and COD orders are removed only
 * when no review points at them — review-backed COD orders belong to
 * `seed:reviews` and are its `--clean`'s to remove.
 */
async function clean(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await connectDatabase(uri);
  console.log(`Database: ${mongoose.connection.name}`);

  const demoUsers = await User.find({
    email: new RegExp(`@${DEMO_EMAIL_DOMAIN.replace('.', '\\.')}$`),
  }).select('_id');
  const ids = demoUsers.map((user) => user._id);

  if (ids.length === 0) {
    console.log('No demo customers found; nothing to remove.');
    await mongoose.disconnect();
    return;
  }

  const reviewedOrderIds = await Review.distinct('order', { user: { $in: ids } });

  const marked = await Order.deleteMany({
    user: { $in: ids },
    'payment.razorpayOrderId': new RegExp(`^order_${SEED_MARKER}`),
  });

  const codOrders = await Order.deleteMany({
    user: { $in: ids },
    'payment.method': 'COD',
    _id: { $nin: reviewedOrderIds },
  });

  console.log(
    `Removed ${marked.deletedCount} gateway order(s) and ${codOrders.deletedCount} COD order(s) ` +
      'created by seed:orders',
  );

  await mongoose.disconnect();
}

const run = process.argv.includes('--clean') ? clean : seed;

run()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
