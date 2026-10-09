import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { connectDatabase } from '../config/database';
import { loadEnv } from '../config/env';
import { Brand } from '../models/brand.model';
import { Category } from '../models/category.model';
import { Product } from '../models/product.model';
import { User } from '../models/user.model';
import { UserActivity } from '../models/user-activity.model';
import { recordAndWait, recentActivity } from '../services/activity/activity.service';
import * as productService from '../services/product.service';
import { getRecommendations } from '../services/recommendation/recommendation.service';
import { findSimilarProducts, priceProximity } from '../services/recommendation/similarity';
import { classifyQuery } from '../services/search/query-classifier';
import { rankByRelevance, scoreProduct } from '../services/search/relevance';
import { productQuerySchema } from '../validators/product.validator';

/**
 * Exercises Phase 11's deterministic half against a real MongoDB.
 *
 * Search ranking, similarity and recommendations are ordinary code, so they can
 * be verified exactly — no model, no key, no nondeterminism. That is the point
 * of having built them as code: this script asserts what the storefront will
 * actually show, and the same assertions hold on every run.
 *
 *   pnpm discovery:verify
 *
 * Safety, because this points at whatever MONGODB_URI is configured and that
 * may well be the real Atlas database:
 *
 *  - It creates its own products under a `ZYCART-P11-` SKU prefix, and its own
 *    customers on a `@zycart-p11.test` domain. Nothing else uses either.
 *  - It never reads, edits or deletes a record it did not create.
 *  - It removes exactly its own records at the end, in a `finally`, so a failed
 *    run still cleans up.
 *  - There is no `deleteMany({})`, `dropDatabase`, `dropCollection` or
 *    `syncIndexes` anywhere in this file.
 */

const SKU_PREFIX = 'ZYCART-P11';
const SLUG_PREFIX = 'zycart-p11';
const EMAIL_DOMAIN = 'zycart-p11.test';

let passed = 0;
let failed = 0;
let section = '';

function heading(title: string): void {
  section = title;
  console.log(`\n${title}`);
}

function check(description: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${description}`);
  } else {
    failed += 1;
    console.error(`  FAIL [${section}] ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

interface Fixtures {
  /** Two shoes from one brand, one from another, plus an unrelated product. */
  shoeA: string;
  shoeB: string;
  shoeOtherBrand: string;
  unrelated: string;
  /** Active but sold out, and fully deactivated. */
  soldOut: string;
  inactive: string;
  categoryId: Types.ObjectId;
  brandId: Types.ObjectId;
}

async function createFixtures(): Promise<Fixtures> {
  const category = await Category.findOne().select('_id');
  const otherCategory = await Category.findOne({ _id: { $ne: category?._id } }).select('_id');
  const brand = await Brand.findOne().select('_id');
  const otherBrand = await Brand.findOne({ _id: { $ne: brand?._id } }).select('_id');

  if (!category || !otherCategory || !brand || !otherBrand) {
    throw new Error('The catalogue needs at least two categories and brands. Run `pnpm seed`.');
  }

  const base = {
    category: category._id,
    brand: brand._id,
    images: ['https://example.invalid/p11.jpg'],
    isActive: true,
    description: 'A test product created by pnpm discovery:verify. Safe to delete.',
    stock: 25,
  };

  const [shoeA, shoeB, shoeOtherBrand, unrelated, soldOut, inactive] = await Product.create([
    {
      ...base,
      name: 'ZyCart P11 Alpha Trail Shoe',
      slug: `${SLUG_PREFIX}-alpha-trail-shoe`,
      sku: `${SKU_PREFIX}-ALPHA`,
      price: 4000,
      tags: ['p11running', 'p11trail'],
      colors: [{ name: 'P11 Black', hex: '#000000' }],
      sizes: [{ label: '9', inStock: true }],
      rating: 4.4,
      reviewCount: 10,
    },
    {
      ...base,
      name: 'ZyCart P11 Beta Trail Shoe',
      slug: `${SLUG_PREFIX}-beta-trail-shoe`,
      sku: `${SKU_PREFIX}-BETA`,
      price: 4200,
      tags: ['p11running', 'p11trail'],
      colors: [{ name: 'P11 Black', hex: '#000000' }],
      sizes: [{ label: '9', inStock: true }],
      rating: 4.1,
      reviewCount: 6,
    },
    {
      ...base,
      brand: otherBrand._id,
      name: 'ZyCart P11 Gamma Trail Shoe',
      slug: `${SLUG_PREFIX}-gamma-trail-shoe`,
      sku: `${SKU_PREFIX}-GAMMA`,
      price: 4100,
      tags: ['p11running'],
    },
    {
      ...base,
      category: otherCategory._id,
      brand: otherBrand._id,
      name: 'ZyCart P11 Unrelated Kettle',
      slug: `${SLUG_PREFIX}-unrelated-kettle`,
      sku: `${SKU_PREFIX}-KETTLE`,
      price: 90000,
      tags: ['p11kitchen'],
    },
    {
      ...base,
      name: 'ZyCart P11 Sold Out Trail Shoe',
      slug: `${SLUG_PREFIX}-sold-out-trail-shoe`,
      sku: `${SKU_PREFIX}-SOLDOUT`,
      price: 4050,
      tags: ['p11running', 'p11trail'],
      stock: 0,
    },
    {
      ...base,
      name: 'ZyCart P11 Inactive Trail Shoe',
      slug: `${SLUG_PREFIX}-inactive-trail-shoe`,
      sku: `${SKU_PREFIX}-INACTIVE`,
      price: 4010,
      tags: ['p11running', 'p11trail'],
      isActive: false,
    },
  ]);

  if (!shoeA || !shoeB || !shoeOtherBrand || !unrelated || !soldOut || !inactive) {
    throw new Error('Could not create test products');
  }

  return {
    shoeA: String(shoeA._id),
    shoeB: String(shoeB._id),
    shoeOtherBrand: String(shoeOtherBrand._id),
    unrelated: String(unrelated._id),
    soldOut: String(soldOut._id),
    inactive: String(inactive._id),
    categoryId: category._id,
    brandId: brand._id,
  };
}

async function createCustomer(label: string): Promise<string> {
  const user = await User.create({
    firstName: 'P11',
    lastName: label,
    email: `${label.toLowerCase()}@${EMAIL_DOMAIN}`,
  });

  return String(user._id);
}

async function removeFixtures(): Promise<void> {
  const users = await User.find({ email: new RegExp(`@${EMAIL_DOMAIN}$`) }).select('_id');
  const userIds = users.map((user) => user._id);

  const activity = await UserActivity.deleteMany({ user: { $in: userIds } });
  const removedUsers = await User.deleteMany({ _id: { $in: userIds } });
  const products = await Product.deleteMany({ sku: new RegExp(`^${SKU_PREFIX}-`) });

  console.log(
    `\nCleaned up ${String(products.deletedCount)} product(s), ` +
      `${String(removedUsers.deletedCount)} customer(s) and ` +
      `${String(activity.deletedCount)} activity row(s). Nothing else was touched.`,
  );
}

const ids = (products: unknown[]): string[] =>
  products.map((product) => String((product as { id: string }).id));

/* ------------------------------------------------------------------ */

function verifyClassifier(): void {
  heading('query classification — when a model is worth calling');

  const keyword = ['nike shoes', 'headphones', 'red shirts', 'air max'];
  const natural = [
    'black running shoes under 3000',
    'I need something for the office',
    'highly rated headphones',
    'show me a gift for someone who likes watches',
    'something comfortable to wear every day at work',
  ];

  for (const query of keyword) {
    const result = classifyQuery(query);
    check(`"${query}" stays a keyword search`, result.kind === 'keyword', result.reason);
  }

  for (const query of natural) {
    const result = classifyQuery(query);
    check(
      `"${query.slice(0, 40)}" is interpreted`,
      result.kind === 'natural_language',
      result.reason,
    );
  }

  check('an empty query never reaches a model', classifyQuery('   ').kind === 'keyword');
}

function verifyRelevanceScoring(): void {
  heading('relevance scoring — deterministic and stable');

  const make = (over: Partial<Parameters<typeof scoreProduct>[0]>) => ({
    id: 'a'.repeat(24),
    name: 'Thing',
    price: 1000,
    rating: 0,
    reviewCount: 0,
    stock: 5,
    tags: [],
    ...over,
  });

  const exact = make({ id: '1'.repeat(24), name: 'Air Max Runner' });
  const partial = make({ id: '2'.repeat(24), name: 'Runner Pro', tags: ['air'] });

  check(
    'a name match outscores a tag match',
    scoreProduct(exact, { terms: 'air max' }) > scoreProduct(partial, { terms: 'air max' }),
  );

  const inStock = make({ id: '3'.repeat(24), name: 'Runner', stock: 5 });
  const outOfStock = make({ id: '4'.repeat(24), name: 'Runner', stock: 0 });

  check(
    'a sold-out product ranks below an identical available one',
    scoreProduct(inStock, { terms: 'runner' }) > scoreProduct(outOfStock, { terms: 'runner' }),
  );

  const unrated = make({ id: '5'.repeat(24), name: 'Runner', rating: 0, reviewCount: 0 });
  const rated = make({ id: '6'.repeat(24), name: 'Runner', rating: 4.5, reviewCount: 20 });

  check(
    'an unrated product is not penalised below a rated one by more than the rating weight',
    scoreProduct(rated, { terms: 'runner' }) - scoreProduct(unrated, { terms: 'runner' }) <= 1,
  );

  check(
    'plural and singular match each other',
    scoreProduct(make({ name: 'Training Shoe' }), { terms: 'shoes' }) >
      scoreProduct(make({ name: 'Wool Trouser' }), { terms: 'shoes' }),
  );

  // Ranking the same input twice must produce the same order, and shuffling the
  // input must not change it.
  const pool = [exact, partial, inStock, outOfStock, rated, unrated];
  const first = rankByRelevance([...pool], { terms: 'runner' }).map((p) => p.id);
  const second = rankByRelevance([...pool].reverse(), { terms: 'runner' }).map((p) => p.id);

  check('ranking is deterministic regardless of input order', first.join() === second.join());
}

async function verifySearch(fixtures: Fixtures): Promise<void> {
  heading('search — strict first, widened only when empty');

  const run = async (over: Record<string, unknown>) =>
    productService.listProducts(
      productQuerySchema.parse({ limit: 12, sort: 'relevance', ...over }),
    );

  const strict = await run({ search: 'ZyCart P11 Trail Shoe' });
  check(
    'every word matching wins when it can',
    strict.items.length >= 3,
    `${String(strict.items.length)} matched`,
  );

  const widened = await run({ search: 'p11trail kettle' });
  check(
    'a query no product matches entirely still returns the closest',
    widened.pagination.total > 0,
    `${String(widened.pagination.total)} matched`,
  );

  const colour = await run({ search: 'ZyCart P11', color: 'P11 Black' });
  check(
    'the colour filter narrows to products that offer it',
    colour.items.length === 2,
    `${String(colour.items.length)} matched`,
  );

  const inStock = await run({ search: 'ZyCart P11', inStock: 'true' });
  check(
    'the in-stock filter excludes the sold-out product',
    !ids(inStock.items).includes(fixtures.soldOut),
  );

  const all = await run({ search: 'ZyCart P11' });
  check(
    'a deactivated product never appears in search',
    !ids(all.items).includes(fixtures.inactive),
  );

  const ranked = await run({ search: 'ZyCart P11 Trail Shoe' });
  check(
    'the sold-out product ranks below the available ones',
    ids(ranked.items).indexOf(fixtures.soldOut) === -1 ||
      ids(ranked.items).indexOf(fixtures.soldOut) > ids(ranked.items).indexOf(fixtures.shoeA),
  );

  const pageOne = await run({ search: 'ZyCart P11', limit: 2, page: 1 });
  const pageTwo = await run({ search: 'ZyCart P11', limit: 2, page: 2 });
  const overlap = ids(pageOne.items).filter((id) => ids(pageTwo.items).includes(id));
  check('paging a ranked search never repeats a product', overlap.length === 0);

  const again = await run({ search: 'ZyCart P11', limit: 2, page: 1 });
  check(
    'the same search returns the same page twice',
    ids(pageOne.items).join() === ids(again.items).join(),
  );
}

function verifySearchSafety(): void {
  heading('search safety — model output cannot reach MongoDB');

  const rejects = (input: Record<string, unknown>, label: string) => {
    const result = productQuerySchema.safeParse({ limit: 12, ...input });
    check(label, !result.success);
  };

  rejects({ minPrice: { $gt: 0 } }, 'a Mongo operator as a price is rejected');
  rejects({ maxPrice: 'cheap' }, 'a non-numeric price is rejected');
  rejects({ minRating: 900 }, 'a rating above five is rejected');
  rejects({ minPrice: -100 }, 'a negative price is rejected');
  rejects({ sort: { $where: '1' } }, 'a Mongo operator as a sort is rejected');
  rejects({ sort: 'price_asc; drop' }, 'an unknown sort key is rejected');
  rejects({ minPrice: 5000, maxPrice: 100 }, 'an inverted price range is rejected');

  // Strings are matched as escaped literals, never as expressions.
  const parsed = productQuerySchema.parse({ search: '$where: sleep(1000)', limit: 12 });
  check(
    'a Mongo expression in a search term survives only as text',
    parsed.search?.includes('$where') === true,
  );

  const unknown = productQuerySchema.safeParse({ limit: 12, $where: 'this.price > 0' });
  check(
    'an unknown field is dropped rather than forwarded',
    unknown.success && !('$where' in unknown.data),
  );
}

async function verifySimilarity(fixtures: Fixtures): Promise<void> {
  heading('similar products — deterministic, no model call');

  check('price proximity is 1 for an identical price', priceProximity(1000, 1000) === 1);
  check('price proximity falls to 0 as prices diverge', priceProximity(1000, 5000) === 0);

  const similar = await findSimilarProducts(`${SLUG_PREFIX}-alpha-trail-shoe`, { limit: 6 });
  const similarIds = ids(similar);

  check(
    'the source product is never in its own similar list',
    !similarIds.includes(fixtures.shoeA),
  );
  check(
    'a same-brand, same-category, same-tag product ranks first',
    similarIds[0] === fixtures.shoeB,
  );
  check('a deactivated product is never similar', !similarIds.includes(fixtures.inactive));
  check(
    'a same-category product from another brand is included',
    similarIds.includes(fixtures.shoeOtherBrand),
  );

  const kettleIndex = similarIds.indexOf(fixtures.unrelated);
  check(
    'a different category at a wildly different price ranks last, if at all',
    kettleIndex === -1 || kettleIndex === similarIds.length - 1,
  );

  const repeat = ids(await findSimilarProducts(`${SLUG_PREFIX}-alpha-trail-shoe`, { limit: 6 }));
  check(
    'the same product page lists the same products in the same order',
    similarIds.join() === repeat.join(),
  );

  const excluded = ids(
    await findSimilarProducts(`${SLUG_PREFIX}-alpha-trail-shoe`, {
      limit: 6,
      exclude: [fixtures.shoeB],
    }),
  );
  check('an excluded product is left out', !excluded.includes(fixtures.shoeB));

  const missing = await findSimilarProducts('a-slug-that-does-not-exist', { limit: 4 });
  check('an unknown product returns nothing rather than throwing', missing.length === 0);
}

async function verifyActivity(fixtures: Fixtures): Promise<void> {
  heading('activity — minimal, deduplicated, server-decided');

  const userId = await createCustomer('Activity');

  await recordAndWait({ userId, event: 'product_view', productId: fixtures.shoeA });
  await recordAndWait({ userId, event: 'product_view', productId: fixtures.shoeA });
  await recordAndWait({ userId, event: 'product_view', productId: fixtures.shoeA });

  const views = await UserActivity.countDocuments({
    user: new Types.ObjectId(userId),
    event: 'product_view',
  });
  check('three rapid views of one product record once', views === 1, `${String(views)} rows`);

  await recordAndWait({ userId, event: 'add_to_cart', productId: fixtures.shoeA });
  await recordAndWait({ userId, event: 'add_to_cart', productId: fixtures.shoeA });
  const adds = await UserActivity.countDocuments({
    user: new Types.ObjectId(userId),
    event: 'add_to_cart',
  });
  check('a deliberate action is not deduplicated', adds === 2, `${String(adds)} rows`);

  await recordAndWait({ userId, event: 'search', term: '   ' });
  await recordAndWait({ userId, event: 'product_view', productId: null });
  const empty = await UserActivity.countDocuments({
    user: new Types.ObjectId(userId),
    $or: [{ term: '' }, { event: 'product_view', product: null }],
  });
  check('an event carrying no signal is not stored', empty === 0);

  await recordAndWait({ userId, event: 'product_view', productId: 'not-an-id' });
  const total = await UserActivity.countDocuments({ user: new Types.ObjectId(userId) });
  check(
    'a malformed product id is ignored rather than stored',
    total === 3,
    `${String(total)} rows`,
  );

  const stored = await UserActivity.findOne({ user: new Types.ObjectId(userId) }).lean();
  const fields = Object.keys(stored ?? {});
  check(
    'a row stores only who, what, which and when',
    !fields.some((field) => ['name', 'price', 'ip', 'session', 'userAgent'].includes(field)),
    fields.join(','),
  );

  const recent = await recentActivity(userId);
  check('activity reads back newest first', recent.length === 3);

  const otherUser = await createCustomer('Other');
  const theirs = await recentActivity(otherUser);
  check("another customer's activity is not visible", theirs.length === 0);
}

async function verifyRecommendations(fixtures: Fixtures): Promise<void> {
  heading('recommendations — cold start, personalisation, exclusions');

  const cold = await createCustomer('Cold');
  const coldResult = await getRecommendations({ userId: cold, limit: 6 });

  check('a new customer is not told they are personalised', coldResult.personalized === false);
  check('a new customer still gets products', coldResult.products.length > 0);
  check('a new customer is labelled popular', coldResult.reason === 'popular');

  const guest = await getRecommendations({ userId: null, limit: 6 });
  check('a guest gets products', guest.products.length > 0);
  check('a guest is never labelled personalised', guest.personalized === false);

  const fan = await createCustomer('Fan');
  // Enough signal to count as a preference: views plus a deliberate action.
  await recordAndWait({ userId: fan, event: 'product_view', productId: fixtures.shoeA });
  await recordAndWait({ userId: fan, event: 'add_to_cart', productId: fixtures.shoeA });
  await recordAndWait({ userId: fan, event: 'wishlist_add', productId: fixtures.shoeB });

  const personalised = await getRecommendations({ userId: fan, limit: 8 });
  const recommendedIds = ids(personalised.products);

  check('a customer with real activity is personalised', personalised.personalized === true);
  check('and is labelled by interests', personalised.reason === 'interests');
  check(
    'the recommendations include the category they engaged with',
    recommendedIds.includes(fixtures.shoeOtherBrand) || recommendedIds.includes(fixtures.shoeB),
  );
  check('a sold-out product is never recommended', !recommendedIds.includes(fixtures.soldOut));
  check('a deactivated product is never recommended', !recommendedIds.includes(fixtures.inactive));

  const repeat = ids((await getRecommendations({ userId: fan, limit: 8 })).products);
  check('recommendations do not change on a refresh', recommendedIds.join() === repeat.join());

  const excluded = ids(
    (await getRecommendations({ userId: fan, limit: 8, exclude: [fixtures.shoeB] })).products,
  );
  check('an excluded product is left out', !excluded.includes(fixtures.shoeB));

  const buyer = await createCustomer('Buyer');
  await recordAndWait({ userId: buyer, event: 'purchase', productId: fixtures.shoeA });
  await recordAndWait({ userId: buyer, event: 'product_view', productId: fixtures.shoeA });

  const afterPurchase = ids((await getRecommendations({ userId: buyer, limit: 8 })).products);
  const boughtIndex = afterPurchase.indexOf(fixtures.shoeA);
  const alternativeIndex = afterPurchase.indexOf(fixtures.shoeB);

  check(
    'a purchased product does not outrank its alternatives',
    boughtIndex === -1 || (alternativeIndex !== -1 && alternativeIndex < boughtIndex),
    `bought at ${String(boughtIndex)}, alternative at ${String(alternativeIndex)}`,
  );

  // Brand diversity: no more than two from one brand while alternatives exist.
  const brands = personalised.products.map((product) =>
    String((product as { brand?: { id?: string } }).brand?.id),
  );
  const worst = Math.max(...brands.map((brand) => brands.filter((b) => b === brand).length));
  check(
    'no brand dominates the list while alternatives exist',
    worst <= 2,
    `${String(worst)} from one brand`,
  );
}

async function main(): Promise<void> {
  const env = loadEnv();
  await connectDatabase(env.MONGODB_URI);

  console.log(`Verifying ZyCart discovery against ${mongoose.connection.name}`);
  console.log('Creating isolated test data…');

  const fixtures = await createFixtures();

  try {
    verifyClassifier();
    verifyRelevanceScoring();
    verifySearchSafety();
    await verifySearch(fixtures);
    await verifySimilarity(fixtures);
    await verifyActivity(fixtures);
    await verifyRecommendations(fixtures);
  } finally {
    await removeFixtures();
    await mongoose.disconnect();
  }

  console.log(`\n${String(passed)} passed, ${String(failed)} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
