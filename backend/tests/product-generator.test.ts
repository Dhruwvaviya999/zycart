import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { parseArgs } from '../scripts/seed-products/cli';
import { redactUri } from '../scripts/seed-products/db';
import {
  allocate,
  apportion,
  charmPrice,
  generateProducts,
  GENERATED_SKU_PREFIX,
  starDistribution,
  type GeneratedProduct,
} from '../scripts/seed-products/generate';
import { IMAGE_HOST, IMAGE_POOLS } from '../scripts/seed-products/images';
import { validateProducts } from '../scripts/seed-products/validate';

/**
 * The synthetic catalogue generator (`pnpm seed:products`), tested without a
 * database: generation is a pure function of seed, count and date, and the
 * validator is the same gate the script runs before it writes anything.
 */

const ANCHOR = new Date('2026-10-05T00:00:00Z');
const generate = (
  count: number,
  seed = 'test',
  extra: Partial<Parameters<typeof generateProducts>[0]> = {},
) => generateProducts({ count, seed, anchor: ANCHOR, withRatings: true, ...extra }).products;

function withIds(products: GeneratedProduct[]) {
  const ids = new Map<string, Types.ObjectId>();
  const idFor = (key: string) => ids.get(key) ?? ids.set(key, new Types.ObjectId()).get(key)!;
  return products.map(({ categorySlug, brandName, subcategory: _subcategory, ...rest }) => ({
    ...rest,
    category: idFor(`c:${categorySlug}`),
    brand: idFor(`b:${brandName}`),
  }));
}

describe('generateProducts', () => {
  it('is deterministic for a seed, count and date', () => {
    assert.deepEqual(generate(120, 'same'), generate(120, 'same'));
  });

  it('produces a different catalogue for a different seed', () => {
    const a = generate(60, 'one').map((p) => p.name);
    const b = generate(60, 'two').map((p) => p.name);
    assert.notDeepEqual(a, b);
  });

  it('produces exactly the requested count with unique names, slugs and SKUs', () => {
    const products = generate(1500, 'unique');
    assert.equal(products.length, 1500);
    assert.equal(new Set(products.map((p) => p.name.toLowerCase())).size, 1500);
    assert.equal(new Set(products.map((p) => p.slug)).size, 1500);
    assert.equal(new Set(products.map((p) => p.sku)).size, 1500);
    assert.ok(products.every((p) => p.sku.startsWith(GENERATED_SKU_PREFIX)));
  });

  it('spreads products across every category and subcategory', () => {
    const products = generate(1000, 'spread');
    assert.equal(new Set(products.map((p) => p.categorySlug)).size, 8);
    assert.equal(
      new Set(products.map((p) => p.subcategory)).size,
      new Set(allocate(1000).map((s) => s.sub.key)).size,
    );
  });

  it('never reuses a reserved name, slug or SKU', () => {
    const first = generate(80, 'reserve');
    const second = generate(80, 'reserve', {
      reserved: {
        names: first.map((p) => p.name),
        slugs: first.map((p) => p.slug),
        skus: first.map((p) => p.sku),
      },
    });
    const taken = new Set(first.map((p) => p.name.toLowerCase()));
    assert.ok(second.every((p) => !taken.has(p.name.toLowerCase())));
    assert.ok(second.every((p) => !first.some((f) => f.slug === p.slug || f.sku === p.sku)));
  });

  it('passes the same validation the script runs before inserting', async () => {
    const issues = await validateProducts(
      withIds(generate(400, 'valid')),
      new Date('2026-10-06T00:00:00Z'),
    );
    assert.deepEqual(issues, []);
  });

  it('keeps rating aggregates consistent with each other', () => {
    for (const p of generate(300, 'ratings')) {
      const b = p.ratingBreakdown;
      assert.equal(b[1] + b[2] + b[3] + b[4] + b[5], p.reviewCount);
      assert.equal(b[1] + 2 * b[2] + 3 * b[3] + 4 * b[4] + 5 * b[5], p.ratingSum);
      assert.equal(
        p.rating,
        p.reviewCount ? Math.round((p.ratingSum / p.reviewCount) * 10) / 10 : 0,
      );
    }
  });

  it('leaves every product unrated with --no-ratings', () => {
    assert.ok(
      generate(100, 'unrated', { withRatings: false }).every(
        (p) => p.rating === 0 && p.reviewCount === 0 && p.ratingSum === 0,
      ),
    );
  });

  it('holds variant stock that adds up to the product total', () => {
    const tracked = generate(300, 'variants').filter((p) => p.variants.length > 0);
    assert.ok(tracked.length > 0);
    for (const p of tracked)
      assert.equal(
        p.variants.reduce((sum, v) => sum + v.stock, 0),
        p.stock,
      );
  });

  it('prices below the MRP whenever an MRP is shown, and only in whole rupees', () => {
    for (const p of generate(300, 'prices')) {
      assert.ok(Number.isInteger(p.price) && p.price > 0);
      if (p.compareAtPrice !== null) assert.ok(p.compareAtPrice > p.price);
    }
  });

  it('marks new arrivals by age and never dates anything after the anchor', () => {
    for (const p of generate(300, 'dates')) {
      assert.ok(p.createdAt <= p.updatedAt && p.updatedAt <= ANCHOR);
      assert.equal(p.isNewArrival, ANCHOR.getTime() - p.createdAt.getTime() < 31 * 86_400_000);
    }
  });

  it('uses only images from the verified pool', () => {
    const known = new Set<string>(Object.values(IMAGE_POOLS).flat());
    for (const p of generate(200, 'images')) {
      assert.ok(p.images.length >= 2);
      for (const url of p.images) {
        assert.ok(url.startsWith(IMAGE_HOST));
        assert.ok(known.has(url.match(/photo-([0-9a-f-]+)\?/)![1]!));
      }
    }
  });
});

describe('generator helpers', () => {
  it('rounds to Indian shelf prices', () => {
    assert.equal(charmPrice(352), 349);
    assert.equal(charmPrice(1310), 1299);
    assert.equal(charmPrice(24_960), 24_999);
    assert.equal(charmPrice(119_800), 119_999);
    assert.equal(charmPrice(12), 99);
  });

  it('apportions a total exactly', () => {
    assert.deepEqual(apportion(10, [1, 1, 1]), [4, 3, 3]);
    assert.equal(
      apportion(997, [3, 7, 11, 0.5]).reduce((a, b) => a + b, 0),
      997,
    );
    assert.deepEqual(apportion(0, [1, 2]), [0, 0]);
  });

  it('builds a star distribution with the requested mean', () => {
    for (const mean of [3.2, 3.9, 4.3, 4.7]) {
      const p = starDistribution(mean);
      assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
      assert.ok(Math.abs(p.reduce((sum, v, i) => sum + v * (i + 1), 0) - mean) < 0.01);
    }
  });

  it('allocates exactly the requested count', () => {
    assert.equal(allocate(777).length, 777);
  });

  it('redacts credentials from connection strings', () => {
    assert.equal(
      redactUri('failed for mongodb+srv://user:secret@cluster.example.net/db'),
      'failed for mongodb+srv://***@cluster.example.net/db',
    );
  });
});

describe('parseArgs', () => {
  it('accepts npm-style and equals-style flags', () => {
    const options = parseArgs([
      '--',
      '--count',
      '1000',
      '--seed=demo',
      '--clear',
      '--date',
      '2026-01-01',
    ]);
    assert.equal(options.count, 1000);
    assert.equal(options.seed, 'demo');
    assert.equal(options.clear, true);
    assert.equal(options.anchor.toISOString(), '2026-01-01T00:00:00.000Z');
  });

  it('chooses a seed when none is given', () => {
    const options = parseArgs([]);
    assert.equal(options.seedGiven, false);
    assert.ok(options.seed.length > 0);
  });

  it('refuses bad input', () => {
    assert.throws(() => parseArgs(['--count', 'lots']), /--count/);
    assert.throws(() => parseArgs(['--count', '0']), /--count 0/);
    assert.throws(() => parseArgs(['--append', '--clear']), /--append/);
    assert.throws(() => parseArgs(['--date', '3000-01-01']), /future/);
    assert.throws(() => parseArgs(['--frobnicate']), /Unknown option/);
  });
});
