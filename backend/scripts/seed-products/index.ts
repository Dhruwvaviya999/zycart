import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { Types } from 'mongoose';
import { parseArgs, USAGE, type CliOptions } from './cli';
import {
  clearProducts,
  connect,
  countProducts,
  disconnect,
  ensureBrands,
  ensureCategories,
  explainConnectionError,
  insertProducts,
  redactUri,
  reservedIdentities,
  rollback,
} from './db';
import { generateProducts, type GeneratedProduct } from './generate';
import { createProgress } from './progress';
import { validateProducts, type ProductInsert } from './validate';

/**
 * `pnpm seed:products` — the synthetic catalogue generator.
 *
 * Lives under `backend/scripts/`, outside `src/`, so it is never compiled into
 * `dist` or shipped with the API. It imports the application's models and
 * validators rather than copying them, so a generated product is held to
 * exactly the rules a real one is.
 *
 * The order of work is chosen so that nothing destructive happens until the
 * new dataset is known to be valid:
 *
 *   connect → pre-flight → generate → validate → clear → references → insert
 */

class UsageError extends Error {}

function resolve(
  products: readonly GeneratedProduct[],
  categories: Map<string, Types.ObjectId>,
  brands: Map<string, Types.ObjectId>,
): ProductInsert[] {
  return products.map(({ categorySlug, brandName, subcategory: _subcategory, ...rest }) => {
    const category = categories.get(categorySlug);
    const brand = brands.get(brandName);
    if (!category) throw new Error(`No id for category "${categorySlug}"`);
    if (!brand) throw new Error(`No id for brand "${brandName}"`);
    return { ...rest, category, brand };
  });
}

/** Stand-in ids for validating before any reference documents are written. */
function placeholderIds(products: readonly GeneratedProduct[]) {
  const categories = new Map<string, Types.ObjectId>();
  const brands = new Map<string, Types.ObjectId>();
  for (const p of products) {
    if (!categories.has(p.categorySlug)) categories.set(p.categorySlug, new Types.ObjectId());
    if (!brands.has(p.brandName)) brands.set(p.brandName, new Types.ObjectId());
  }
  return { categories, brands };
}

function generate(options: CliOptions, reserved?: Awaited<ReturnType<typeof reservedIdentities>>) {
  const progress = createProgress('Generating', options.count);
  const result = generateProducts({
    count: options.count,
    seed: options.seed,
    anchor: options.anchor,
    withRatings: options.withRatings,
    reserved,
    onProgress: (done) => progress.update(done),
  });
  progress.finish(result.products.length);
  if (result.products.length < options.count) {
    throw new Error(
      `Only ${result.products.length} unique products could be generated (asked for ${options.count}).`,
    );
  }
  if (result.refilled > 0)
    console.log(
      `  ${result.refilled} slot(s) refilled from other subcategories after running out of unique names`,
    );
  return result.products;
}

async function validateOrThrow(products: readonly ProductInsert[]): Promise<void> {
  const issues = await validateProducts(products);
  if (issues.length === 0) {
    console.log(
      `  Validation   ${products.length} products passed (API schema, Mongoose schema, invariants)`,
    );
    return;
  }
  const shown = issues.slice(0, 25).map((issue) => `    ${issue.sku}: ${issue.problem}`);
  throw new Error(
    `Validation failed with ${issues.length} issue(s); nothing was written.\n${shown.join('\n')}${issues.length > 25 ? '\n    …' : ''}`,
  );
}

function writeOut(path: string, products: readonly GeneratedProduct[]): void {
  writeFileSync(path, JSON.stringify(products, null, 2));
  console.log(`  Wrote ${products.length} products to ${path}`);
}

function summarise(products: readonly GeneratedProduct[]): void {
  const by = new Map<string, number>();
  for (const p of products) by.set(p.categorySlug, (by.get(p.categorySlug) ?? 0) + 1);
  const prices = products.map((p) => p.price).sort((a, b) => a - b);
  const rated = products.filter((p) => p.reviewCount > 0);
  const avg = rated.length ? rated.reduce((s, p) => s + p.rating, 0) / rated.length : 0;
  const median = prices[Math.floor(prices.length / 2)] ?? 0;
  const count = (fn: (p: GeneratedProduct) => boolean) => products.filter(fn).length;
  const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  console.log('\nSummary');
  console.log(`  Categories   ${[...by.entries()].map(([slug, n]) => `${slug} ${n}`).join(' · ')}`);
  console.log(
    `  Subcategories ${new Set(products.map((p) => p.subcategory)).size}   Brands ${new Set(products.map((p) => p.brandName)).size}`,
  );
  console.log(
    `  Prices       ${inr(prices[0] ?? 0)} – ${inr(prices.at(-1) ?? 0)} (median ${inr(median)}), ${count((p) => p.compareAtPrice !== null)} discounted`,
  );
  console.log(
    `  Stock        ${count((p) => p.stock === 0)} out of stock · ${count((p) => p.variants.length > 0)} with per-variant stock`,
  );
  console.log(
    `  Ratings      ${rated.length} rated, average ${avg.toFixed(2)}, ${products.reduce((s, p) => s + p.reviewCount, 0).toLocaleString('en-IN')} reviews in total`,
  );
  console.log(
    `  Flags        featured ${count((p) => p.isFeatured)} · best sellers ${count((p) => p.isBestSeller)} · new arrivals ${count((p) => p.isNewArrival)} · inactive ${count((p) => !p.isActive)}`,
  );
}

async function run(options: CliOptions): Promise<void> {
  const date = options.anchor.toISOString().slice(0, 10);
  console.log(
    `seed:products — count ${options.count}, seed "${options.seed}", date ${date}${options.dryRun ? ', dry run' : ''}`,
  );

  if (process.env.NODE_ENV === 'production' && !options.allowProduction) {
    throw new UsageError(
      'NODE_ENV is production. Synthetic data does not belong in a production catalogue; pass --allow-production if you really mean it.',
    );
  }

  if (options.dryRun) {
    const products = generate(options);
    const ids = placeholderIds(products);
    await validateOrThrow(resolve(products, ids.categories, ids.brands));
    if (options.out) writeOut(options.out, products);
    summarise(products);
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new UsageError('MONGODB_URI is not set. Add it to backend/.env.');

  try {
    await connect(uri);
  } catch (error) {
    throw new Error(`Could not connect to MongoDB.\n  ${explainConnectionError(error)}`, {
      cause: error,
    });
  }
  console.log('  Connected to MongoDB');

  // Pre-flight: refuse anything that would duplicate or destroy without being asked to.
  const before = await countProducts();
  console.log(`  Found ${before.total} product(s), ${before.generated} of them generated`);

  if (options.replaceAll && !options.yes) {
    throw new UsageError(
      `--replace-all would delete all ${before.total} products, with their reviews, alerts, ledger rows and ` +
        'cart/wishlist entries. Orders keep their snapshots. Re-run with --yes to confirm.',
    );
  }
  if (before.generated > 0 && !options.clear && !options.replaceAll && !options.append) {
    throw new UsageError(
      `${before.generated} generated products already exist. Use --clear to replace them, or --append to add more.`,
    );
  }

  // Generate and validate against what will remain after the clear — before deleting anything.
  let products: GeneratedProduct[] = [];
  if (options.count > 0) {
    const reserved = await reservedIdentities(
      options.replaceAll ? 'none' : options.clear ? 'non-generated' : 'all',
    );
    products = generate(options, reserved);
    const ids = placeholderIds(products);
    await validateOrThrow(resolve(products, ids.categories, ids.brands));
    if (options.out) writeOut(options.out, products);
  }

  if (options.clear || options.replaceAll) {
    const cleared = await clearProducts(options.replaceAll ? 'all' : 'generated');
    console.log(
      `  Cleared      ${cleared.products} products, ${cleared.movements} ledger rows, ${cleared.reviews} reviews, ` +
        `${cleared.alerts} alerts, ${cleared.activity} activity rows; ${cleared.cartsTouched} carts and ` +
        `${cleared.wishlistsTouched} wishlists updated${options.replaceAll ? `; ${cleared.brands} unused brands removed` : ''}`,
    );
  }

  if (products.length === 0) return;

  const categories = await ensureCategories();
  const brands = await ensureBrands(products.map((p) => p.brandName));
  console.log(
    `  References   ${categories.ids.size} categories (${categories.created.length ? `created ${categories.created.join(', ')}` : 'all existed'}), ` +
      `${brands.ids.size} brands (${brands.created} created)`,
  );

  const documents = resolve(products, categories.ids, brands.ids).map((product) => ({
    ...product,
    _id: new Types.ObjectId(),
  }));
  const productBar = createProgress('Inserting', documents.length);
  let ledgerBar: ReturnType<typeof createProgress> | null = null;

  try {
    const result = await insertProducts(documents, options.batchSize, (stage, done, total) => {
      if (stage === 'products') {
        productBar.update(done);
        if (done === total) productBar.finish(done);
      } else {
        ledgerBar ??= createProgress('Ledger', total);
        ledgerBar.update(done);
        if (done === total) ledgerBar.finish(done);
      }
    });
    console.log(
      `  Inserted     ${result.inserted} products and ${result.movements} opening-stock ledger rows`,
    );
  } catch (error) {
    console.error('\n  Insert failed — rolling back this run…');
    const removed = await rollback(documents.map((d) => d._id)).catch(() => -1);
    console.error(
      removed >= 0
        ? `  Rolled back ${removed} product(s) from this run.`
        : '  Rollback failed; remove products with SKU prefix ZG- manually or re-run with --clear.',
    );
    throw error;
  }

  summarise(products);
  console.log(
    `\nReproduce this dataset: pnpm seed:products --count ${options.count} --seed ${options.seed} --date ${date} --clear`,
  );
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }

  if (options.help) {
    console.log(USAGE);
    return;
  }

  const started = Date.now();
  try {
    await run(options);
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
  } catch (error) {
    console.error(
      `\nseed:products failed: ${redactUri(error instanceof Error ? error.message : String(error))}`,
    );
    process.exitCode = error instanceof UsageError ? 2 : 1;
  } finally {
    await disconnect().catch(() => undefined);
  }
}

void main();
