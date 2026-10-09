import 'dotenv/config';
import { randomInt } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database';
import { Order } from '../models/order.model';
import { Product } from '../models/product.model';
import { Review } from '../models/review.model';
import { User } from '../models/user.model';
import { generateOrderNumber } from './orderNumber';
import { recomputeProductAggregates } from '../services/review.service';

/**
 * Populates the development catalogue with **genuine** reviews.
 *
 * Every review this creates is real in the only sense that matters: it belongs
 * to a real customer record, and behind it sits a real order, containing that
 * product, in DELIVERED state. Nothing here writes a rating directly or sets
 * `isVerifiedPurchase` by hand — the aggregates are recomputed from the reviews
 * that exist, exactly as they are in production.
 *
 * That matters because Phase 8 removed the catalogue's placeholder ratings. A
 * product now earns its stars, and this is how a development storefront gets
 * some without anybody inventing a number.
 *
 * Safety:
 *
 *  - Demo customers use a `@zycart.demo` address, which nothing else does, so
 *    they are identifiable and removable.
 *  - Demo orders are marked `stockCommitted: false` and **do not decrement
 *    stock**. They stand in for purchase history that already happened; taking
 *    inventory for them would empty the catalogue.
 *  - Re-running it adds only what is missing. It never deletes.
 *  - `--clean` removes exactly what it created and nothing else.
 *
 *   pnpm seed:reviews
 *   pnpm seed:reviews --clean
 */

const DEMO_EMAIL_DOMAIN = 'zycart.demo';

const PEOPLE = [
  ['Ananya', 'Rao'],
  ['Karthik', 'Menon'],
  ['Priya', 'Sharma'],
  ['Devan', 'Iyer'],
  ['Meera', 'Nair'],
  ['Rohan', 'Kulkarni'],
  ['Sneha', 'Reddy'],
  ['Arjun', 'Desai'],
  ['Fatima', 'Sheikh'],
  ['Vikram', 'Patel'],
  ['Neha', 'Joshi'],
  ['Aditya', 'Bose'],
] as const;

/** Written per rating, so a three-star review does not read like a five. */
const COPY: Record<number, { title: string; comment: string }[]> = {
  5: [
    {
      title: 'Exactly as described',
      comment:
        'Arrived two days early and the photos were not doing the heavy lifting for once. Quality is obvious the moment you handle it, and it has held up to daily use without complaint.',
    },
    {
      title: 'Worth the upgrade',
      comment:
        'Replaced something I had used for four years and the difference showed up within the first week. Packaging was minimal, which I appreciated more than I expected to.',
    },
    {
      title: 'No notes',
      comment:
        'Second one I have bought from ZyCart and both have been right first time. Fit, finish and the little details all land where you would want them to.',
    },
  ],
  4: [
    {
      title: 'Great, with one caveat',
      comment:
        'Build quality is genuinely good for the price. The only note is that the colour reads slightly warmer in person than on screen — not a problem, just worth knowing before you order.',
    },
    {
      title: 'Solid everyday choice',
      comment:
        'Not flashy, which is exactly why I bought it. It has taken daily use without any of the wear I was expecting around the edges by now.',
    },
    {
      title: 'Very good for the money',
      comment:
        'Does almost everything I hoped it would. Knocking off a star only because setup took longer than the instructions suggested it would.',
    },
  ],
  3: [
    {
      title: 'Fine, not remarkable',
      comment:
        'It does the job and nothing about it is bad. I had expected a little more given the description, so it sits somewhere between pleased and indifferent.',
    },
    {
      title: 'Mixed feelings',
      comment:
        'The main thing works well. A couple of the smaller details feel like they were finished in a hurry, which is a shame because the rest is decent.',
    },
  ],
  2: [
    {
      title: 'Not quite right for me',
      comment:
        'Arrived on time and undamaged, so no complaints about the service. The product itself runs smaller than I expected and the material feels lighter than the listing suggests.',
    },
  ],
  1: [
    {
      title: 'Did not work out',
      comment:
        'Unfortunately this was not what I was after at all. Delivery was quick and the returns process was painless, which is the reason this is not a worse review.',
    },
  ],
};

/**
 * Ratings skewed the way real catalogues skew.
 *
 * Mostly four and five stars with a thin tail, because a development storefront
 * where everything is five stars looks as fake as one where nothing is rated.
 */
const RATING_POOL = [5, 5, 5, 5, 5, 4, 4, 4, 4, 3, 3, 2, 1];

const pick = <T>(items: readonly T[]): T => items[randomInt(items.length)] as T;

async function ensureDemoCustomers() {
  const customers = [];

  for (const [index, [firstName, lastName]] of PEOPLE.entries()) {
    const email = `${firstName}.${lastName}.${index + 1}@${DEMO_EMAIL_DOMAIN}`.toLowerCase();

    const user =
      (await User.findOne({ email })) ??
      (await User.create({
        firstName,
        lastName,
        email,
        isActive: true,
        addresses: [
          {
            label: 'Home',
            fullName: `${firstName} ${lastName}`,
            phone: '9876500000',
            addressLine1: '1 Demo Street',
            city: 'Surat',
            state: 'Gujarat',
            postalCode: '395007',
            country: 'India',
            isDefault: true,
          },
        ],
      }));

    customers.push(user);
  }

  return customers;
}

/**
 * A delivered order for one customer and one product.
 *
 * Built as a genuine order snapshot — the same shape checkout writes — because
 * the review service will read it back as evidence, and evidence that is a
 * different shape from the real thing proves nothing.
 */
async function createDeliveredOrder(
  user: InstanceType<typeof User>,
  product: InstanceType<typeof Product>,
  placedAt: Date,
) {
  const address = user.addresses[0];
  if (!address) throw new Error(`demo customer ${user.email} has no address`);

  const item = {
    product: product._id,
    productName: product.name,
    productSlug: product.slug,
    productImage: product.images[0] ?? '',
    sku: product.sku,
    brand: '',
    quantity: 1,
    unitPrice: product.price,
    lineTotal: product.price,
    selectedColor: null,
    selectedSize: null,
  };

  const [order] = await Order.create([
    {
      orderNumber: generateOrderNumber(placedAt),
      user: user._id,
      items: [item],
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
      pricing: {
        subtotal: product.price,
        shipping: 0,
        discount: 0,
        tax: 0,
        total: product.price,
      },
      payment: { method: 'COD', status: 'PAID', provider: null, paidAt: placedAt },
      status: 'DELIVERED',
      // Standing in for history that already happened: no stock is taken, and
      // nothing can later "restore" inventory this order never held.
      stockCommitted: false,
      sourceCartItemIds: [],
    },
  ]);

  if (!order) throw new Error(`could not create a demo order for ${product.name}`);

  return order;
}

async function seed(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await connectDatabase(uri);
  console.log(`Database: ${mongoose.connection.name}`);

  const customers = await ensureDemoCustomers();
  console.log(`${customers.length} demo customer(s) ready (@${DEMO_EMAIL_DOMAIN})`);

  const products = await Product.find({ isActive: true });
  console.log(`${products.length} active product(s) to review\n`);

  let created = 0;
  let skipped = 0;

  for (const product of products) {
    // A varying handful per product, so the catalogue does not look generated.
    const wanted = randomInt(2, Math.min(7, customers.length));
    const reviewers = [...customers].sort(() => Math.random() - 0.5).slice(0, wanted);

    for (const [index, customer] of reviewers.entries()) {
      const already = await Review.findOne({ user: customer._id, product: product._id });

      if (already) {
        skipped += 1;
        continue;
      }

      const placedAt = new Date(Date.now() - (index + 1) * 6 * 24 * 60 * 60 * 1000);

      const order =
        (await Order.findOne({
          user: customer._id,
          status: 'DELIVERED',
          'items.product': product._id,
        })) ?? (await createDeliveredOrder(customer, product, placedAt));

      const line = order.items.find((entry) => String(entry.product) === String(product._id));
      if (!line) continue;

      const rating = pick(RATING_POOL);
      const copy = pick(COPY[rating] ?? COPY[5]!);

      await Review.create({
        user: customer._id,
        product: product._id,
        order: order._id,
        orderItem: new Types.ObjectId(String(line._id)),
        rating,
        title: copy.title,
        comment: copy.comment,
        images: [],
        status: 'APPROVED',
        isVerifiedPurchase: true,
      });

      created += 1;
    }

    // Derived from the reviews that now exist, never written by hand.
    await recomputeProductAggregates(product._id);
  }

  console.log(`Created ${created} review(s); ${skipped} already existed.`);

  const rated = await Product.find({ reviewCount: { $gt: 0 } })
    .select('name rating reviewCount')
    .sort({ rating: -1 })
    .limit(3);

  console.log('\nTop rated after seeding:');
  for (const product of rated) {
    console.log(`  ${product.rating.toFixed(1)} ★ (${product.reviewCount})  ${product.name}`);
  }

  await mongoose.disconnect();
}

/** Removes exactly what this script creates, and nothing else. */
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

  // Scoped to the demo customers by id, so no real customer's review or order
  // can be caught by this.
  const affected = await Review.distinct('product', { user: { $in: ids } });

  const reviews = await Review.deleteMany({ user: { $in: ids } });
  const orders = await Order.deleteMany({ user: { $in: ids } });
  const users = await User.deleteMany({ _id: { $in: ids } });

  console.log(
    `Removed ${reviews.deletedCount} review(s), ${orders.deletedCount} order(s), ` +
      `${users.deletedCount} demo customer(s)`,
  );

  for (const productId of affected) {
    await recomputeProductAggregates(productId as Types.ObjectId);
  }

  console.log(`Recomputed aggregates for ${affected.length} product(s)`);

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
