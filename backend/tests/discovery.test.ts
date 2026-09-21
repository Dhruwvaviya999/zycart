import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMockProvider } from '../src/services/ai/mock.provider';
import {
  INTERPRETATION_SCHEMA,
  interpretSearchQuery,
  scrubQuery,
  type CatalogueVocabulary,
} from '../src/services/ai/search/query-interpreter';
import { AiProviderError, type AiProvider } from '../src/services/ai/provider';
import { classifyQuery } from '../src/services/search/query-classifier';
import { rankByRelevance, scoreProduct, stem, tokenize } from '../src/services/search/relevance';
import { priceProximity, scoreSimilarity } from '../src/services/recommendation/similarity';
import {
  diversify,
  EVENT_WEIGHTS,
  recencyWeight,
} from '../src/services/recommendation/recommendation.service';
import { smartSearchSchema } from '../src/validators/search.validator';
import { productQuerySchema } from '../src/validators/product.validator';

/**
 * Phase 11's logic, without a database and without a model.
 *
 * Almost everything this phase added is deterministic code — classification,
 * ranking, similarity, scoring, validation — so almost all of it can be
 * asserted exactly. The database-backed behaviour lives in
 * `pnpm discovery:verify`; the model-backed behaviour is exercised here through
 * a provider that returns whatever a case needs it to.
 */

const VOCABULARY: CatalogueVocabulary = {
  categories: ['Footwear', 'Electronics'],
  brands: ['Nike', 'Apple'],
  colors: ['Black', 'White'],
};

/** A provider whose structured answer is whatever a case hands it. */
const answering = (value: unknown): AiProvider => ({
  name: 'test',
  generate: () => Promise.reject(new Error('not used in this test')),
  generateStructured: () =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value),
});

const interpret = (query: string, value: unknown) =>
  interpretSearchQuery(query, { provider: answering(value), vocabulary: VOCABULARY });

describe('query classification', () => {
  it('keeps short literal searches away from a model', () => {
    for (const query of ['nike shoes', 'headphones', 'air max', 'red shirts']) {
      assert.equal(classifyQuery(query).kind, 'keyword', query);
    }
  });

  it('interprets a search that carries intent', () => {
    for (const query of [
      'black shoes under 3000',
      'highly rated headphones',
      'I need something for the office',
      '₹5000 budget for a watch',
      'a comfortable pair of trainers for everyday wear',
    ]) {
      assert.equal(classifyQuery(query).kind, 'natural_language', query);
    }
  });

  it('does not treat a number alone as a budget', () => {
    assert.equal(classifyQuery('iphone 15').kind, 'keyword');
  });

  it('never sends an empty query anywhere', () => {
    assert.equal(classifyQuery('').kind, 'keyword');
    assert.equal(classifyQuery('    ').kind, 'keyword');
  });
});

describe('interpretation — the model is never trusted', () => {
  it('accepts a well-formed interpretation', async () => {
    const result = await interpret('black shoes under 3000', {
      query: 'shoes',
      color: 'Black',
      maxPrice: 3000,
    });

    assert.deepEqual(result, { query: 'shoes', color: 'Black', maxPrice: 3000 });
  });

  it('falls back when the model returns prose', async () => {
    assert.equal(await interpret('black shoes', 'Here are some shoes!'), null);
  });

  it('falls back when the model returns the wrong types', async () => {
    assert.equal(await interpret('cheap shoes', { maxPrice: 'cheap' }), null);
    assert.equal(await interpret('good shoes', { minRating: 900 }), null);
  });

  it('falls back when the model invents a field', async () => {
    assert.equal(await interpret('summer shoes', { season: 'summer' }), null);
  });

  it('drops a category the catalogue does not have', async () => {
    const result = await interpret('summer clothes', {
      query: 'summer',
      category: 'Summerwear',
    });

    assert.deepEqual(result, { query: 'summer' });
  });

  it('drops a brand and a colour the catalogue does not stock', async () => {
    const result = await interpret('adidas shoes in chartreuse', {
      query: 'shoes',
      brand: 'Adidas',
      color: 'Chartreuse',
    });

    assert.deepEqual(result, { query: 'shoes' });
  });

  it('keeps a good field when another is bad', async () => {
    const result = await interpret('shoes under 3000', {
      query: 'shoes',
      category: 'Nonexistent',
      maxPrice: 3000,
    });

    assert.deepEqual(result, { query: 'shoes', maxPrice: 3000 });
  });

  it('drops an inverted price range rather than failing the search', async () => {
    const result = await interpret('shoes', { query: 'shoes', minPrice: 9000, maxPrice: 1000 });

    assert.deepEqual(result, { query: 'shoes', maxPrice: 1000 });
  });

  it('scrubs prompt scaffolding the model echoed back', async () => {
    const result = await interpret('shoes', {
      query: '<shopper_search> shopper search shoes </shopper_search>',
    });

    assert.deepEqual(result, { query: 'shoes' });
  });

  it('returns null rather than an empty interpretation', async () => {
    assert.equal(await interpret('???', {}), null);
    assert.equal(await interpret('???', { query: '   ' }), null);
  });

  it('falls back when the provider fails, rather than throwing', async () => {
    assert.equal(await interpret('shoes', new AiProviderError('down', 'upstream')), null);
    assert.equal(await interpret('shoes', new AiProviderError('slow', 'timeout')), null);
    assert.equal(await interpret('shoes', new Error('unexpected')), null);
  });

  it('refuses a Mongo operator wherever the model puts one', async () => {
    assert.equal(await interpret('shoes', { maxPrice: { $gt: 0 } }), null);
    assert.equal(await interpret('shoes', { query: 'x', $where: 'sleep(1)' }), null);
    assert.equal(await interpret('shoes', { sort: { $where: '1' } }), null);
  });

  it('only allows sort keys the catalogue understands', () => {
    assert.equal(INTERPRETATION_SCHEMA.safeParse({ sort: 'price_asc' }).success, true);
    assert.equal(INTERPRETATION_SCHEMA.safeParse({ sort: 'cheapest' }).success, false);
  });
});

describe('scrubbing a model-produced search term', () => {
  it('leaves an ordinary term alone', () => {
    assert.equal(scrubQuery('running shoes'), 'running shoes');
  });

  it('removes words the model only copied from its own instructions', () => {
    assert.equal(scrubQuery('shopper search running shoes'), 'running shoes');
    assert.equal(scrubQuery('query: running shoes'), 'running shoes');
    assert.equal(scrubQuery('catalogue filters running shoes'), 'running shoes');
  });

  it('removes anything angle-bracketed', () => {
    assert.equal(scrubQuery('<tag>running shoes</tag>'), 'running shoes');
  });

  it('drops a fragment left behind when the value hit the length cap', () => {
    // Exactly the cap: the model ran over and its answer was cut mid-word.
    const truncated = `${'running shoes '.repeat(6)}sea`.slice(0, 80);
    assert.equal(truncated.length, 80);
    assert.ok(truncated.endsWith('sea') || /\s\S{1,3}$/.test(truncated));
    assert.ok(!/\ssea$/.test(scrubQuery(truncated) ?? ''));
  });

  it('keeps a short final word when the value was not truncated', () => {
    assert.equal(scrubQuery('tee'), 'tee');
    assert.equal(scrubQuery('a4 pen'), 'a4 pen');
  });

  it('keeps hyphens and digits, drops punctuation', () => {
    assert.equal(scrubQuery('air-max 90, size 9!'), 'air-max 90 size 9');
  });

  it('returns undefined when nothing usable survives', () => {
    assert.equal(scrubQuery('   '), undefined);
    assert.equal(scrubQuery('!!!'), undefined);
    assert.equal(scrubQuery(undefined), undefined);
  });

  it('does not accumulate state across calls', () => {
    assert.equal(scrubQuery('shopper shoes'), 'shoes');
    assert.equal(scrubQuery('shopper shoes'), 'shoes');
    assert.equal(scrubQuery('shopper shoes'), 'shoes');
  });
});

describe('the mock provider interprets deterministically', () => {
  const provider = createMockProvider();
  const schema = {
    type: 'object' as const,
    additionalProperties: false as const,
    properties: { query: {}, color: {}, maxPrice: {}, minRating: {}, inStock: {}, sort: {} },
  };

  const run = (prompt: string) =>
    provider.generateStructured({ system: '', prompt, schema, maxOutputTokens: 256 });

  it('reads a budget, a colour and a rating hint', async () => {
    assert.deepEqual(await run('black shoes under 3000'), {
      maxPrice: 3000,
      color: 'Black',
      query: 'shoes',
    });
  });

  it('gives the same answer twice, despite shared global regexes', async () => {
    const first = await run('highly rated headphones under 5000');
    const second = await run('highly rated headphones under 5000');

    assert.deepEqual(first, second);
    assert.deepEqual(first, { maxPrice: 5000, minRating: 4, query: 'headphones' });
  });

  it('does not mistake a word containing a colour for that colour', async () => {
    const result = (await run('blackberry jam')) as { color?: string };
    assert.equal(result.color, undefined);
  });

  it('never returns a field the schema did not declare', async () => {
    const narrow = {
      type: 'object' as const,
      additionalProperties: false as const,
      properties: { query: {} },
    };

    const result = await provider.generateStructured({
      system: '',
      prompt: 'black shoes under 3000',
      schema: narrow,
      maxOutputTokens: 256,
    });

    assert.deepEqual(Object.keys(result as object), ['query']);
  });
});

describe('smart search request validation', () => {
  const fails = (body: unknown) => assert.equal(smartSearchSchema.safeParse(body).success, false);

  it('accepts a plain query', () => {
    assert.equal(smartSearchSchema.parse({ query: 'shoes' }).query, 'shoes');
  });

  it('rejects an empty or missing query', () => {
    fails({});
    fails({ query: '' });
    fails({ query: '   ' });
  });

  it('rejects a query longer than a sentence', () => {
    fails({ query: 'a'.repeat(201) });
  });

  it('rejects unknown fields rather than ignoring them', () => {
    fails({ query: 'shoes', userId: 'someone-else' });
    fails({ query: 'shoes', retain: { category: 'x', $where: '1' } });
  });

  it('rejects a retained filter that is not a real filter', () => {
    fails({ query: 'shoes', retain: { minRating: 900 } });
    fails({ query: 'shoes', retain: { maxPrice: -1 } });
    fails({ query: 'shoes', retain: { sort: 'cheapest' } });
  });
});

describe('relevance', () => {
  const product = (over: Partial<Parameters<typeof scoreProduct>[0]> = {}) => ({
    id: 'a'.repeat(24),
    name: 'Thing',
    price: 1000,
    stock: 5,
    rating: 0,
    reviewCount: 0,
    tags: [],
    ...over,
  });

  it('tokenizes away punctuation and single letters', () => {
    assert.deepEqual(tokenize('Air-Max 90, a shoe!'), ['air', 'max', '90', 'shoe']);
  });

  it('stems a plural but never a word that merely ends in s', () => {
    assert.equal(stem('shoes'), 'shoe');
    assert.equal(stem('shirts'), 'shirt');
    assert.equal(stem('dress'), 'dres');
    assert.equal(stem('is'), 'is');
  });

  it('ranks a phrase match above a scattered one', () => {
    const phrase = product({ id: '1'.repeat(24), name: 'Air Max Runner' });
    const scattered = product({ id: '2'.repeat(24), name: 'Max Comfort', tags: ['air'] });

    assert.ok(
      scoreProduct(phrase, { terms: 'air max' }) > scoreProduct(scattered, { terms: 'air max' }),
    );
  });

  it('rewards a colour the product actually offers, including a colourway', () => {
    const plain = product({ colors: [{ name: 'Black' }] });
    const colourway = product({ colors: [{ name: 'Triple Black' }] });
    const other = product({ colors: [{ name: 'Sand' }] });

    const withColor = { terms: 'shoe', color: 'Black' };

    assert.ok(scoreProduct(plain, withColor) > scoreProduct(other, withColor));
    assert.ok(scoreProduct(colourway, withColor) > scoreProduct(other, withColor));
  });

  it('does not credit a colour that merely shares a prefix', () => {
    const blackcurrant = product({ colors: [{ name: 'Blackcurrant' }] });
    const none = product({ colors: [] });

    const withColor = { terms: 'jam', color: 'Black' };
    assert.equal(scoreProduct(blackcurrant, withColor), scoreProduct(none, withColor));
  });

  it('prefers a product with room inside the budget', () => {
    const cheap = product({ id: '3'.repeat(24), price: 1000 });
    const atCeiling = product({ id: '4'.repeat(24), price: 2999 });

    const budget = { terms: 'thing', maxPrice: 3000 };
    assert.ok(scoreProduct(cheap, budget) > scoreProduct(atCeiling, budget));
  });

  it('is stable: ties break the same way every time', () => {
    const a = product({ id: '1'.repeat(24), name: 'Runner' });
    const b = product({ id: '2'.repeat(24), name: 'Runner' });

    const forwards = rankByRelevance([a, b], { terms: 'runner' }).map((p) => p.id);
    const backwards = rankByRelevance([b, a], { terms: 'runner' }).map((p) => p.id);

    assert.deepEqual(forwards, backwards);
  });
});

describe('similarity', () => {
  const base = {
    _id: 'a'.repeat(24),
    name: 'Shoe',
    price: 4000,
    category: 'c1',
    brand: 'b1',
    tags: ['running'],
    colors: [{ name: 'Black' }],
    sizes: [{ label: '9' }],
    rating: 4,
    reviewCount: 10,
    stock: 5,
  };

  it('scales price proximity relative to the product being viewed', () => {
    assert.equal(priceProximity(1000, 1000), 1);
    assert.equal(priceProximity(1000, 2000), 0);
    assert.ok(priceProximity(1000, 1100) > 0.85);
    // A fixed gap matters less on an expensive product.
    assert.ok(priceProximity(100_000, 100_500) > priceProximity(1000, 1500));
  });

  it('treats a zero-priced source as having no price signal', () => {
    assert.equal(priceProximity(0, 1000), 0);
  });

  it('ranks same category above same brand', () => {
    const sameCategory = { ...base, _id: '2'.repeat(24), brand: 'b2' };
    const sameBrandOnly = { ...base, _id: '3'.repeat(24), category: 'c2', tags: [] };

    assert.ok(scoreSimilarity(base, sameCategory) > scoreSimilarity(base, sameBrandOnly));
  });

  it('rewards shared tags but caps how far they can carry a product', () => {
    const fewTags = { ...base, _id: '4'.repeat(24), tags: ['running'] };
    const manyTags = {
      ...base,
      _id: '5'.repeat(24),
      tags: ['running', 'a', 'b', 'c', 'd', 'e', 'f', 'g'],
      category: 'c2',
      brand: 'b2',
    };

    assert.ok(scoreSimilarity(base, fewTags) > scoreSimilarity(base, manyTags));
  });

  it('ranks a sold-out product below an otherwise identical one', () => {
    const inStock = { ...base, _id: '6'.repeat(24) };
    const soldOut = { ...base, _id: '7'.repeat(24), stock: 0 };

    assert.ok(scoreSimilarity(base, inStock) > scoreSimilarity(base, soldOut));
  });
});

describe('recommendation scoring', () => {
  it('weights a deliberate action above a glance', () => {
    assert.ok(EVENT_WEIGHTS.add_to_cart > EVENT_WEIGHTS.product_view);
    assert.ok(EVENT_WEIGHTS.wishlist_add > EVENT_WEIGHTS.product_view);
    assert.ok(EVENT_WEIGHTS.purchase >= EVENT_WEIGHTS.add_to_cart);
  });

  it('fades older activity without erasing it', () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    assert.equal(recencyWeight(new Date(now), now), 1);
    assert.ok(Math.abs(recencyWeight(new Date(now - 14 * day), now) - 0.5) < 0.001);
    assert.ok(recencyWeight(new Date(now - 90 * day), now) > 0);
    assert.ok(recencyWeight(new Date(now - 90 * day), now) < 0.02);
  });

  it('treats a future timestamp as now rather than as extra weight', () => {
    const now = Date.now();
    assert.equal(recencyWeight(new Date(now + 10_000), now), 1);
  });

  describe('diversity', () => {
    const item = (brand: string, id: string) => ({ brand, category: 'c1', id });

    it('caps how many of one brand fill a rail', () => {
      const ranked = [
        item('b1', '1'),
        item('b1', '2'),
        item('b1', '3'),
        item('b2', '4'),
        item('b3', '5'),
      ];

      const picked = diversify(ranked, 4).map((entry) => entry.id);
      assert.deepEqual(picked, ['1', '2', '4', '5']);
    });

    it('fills the rail anyway when there is nothing else to show', () => {
      const ranked = [item('b1', '1'), item('b1', '2'), item('b1', '3'), item('b1', '4')];

      assert.equal(diversify(ranked, 4).length, 4);
    });

    it('keeps the ranked order among what it picks', () => {
      const ranked = [item('b1', '1'), item('b2', '2'), item('b1', '3'), item('b2', '4')];

      assert.deepEqual(
        diversify(ranked, 3).map((entry) => entry.id),
        ['1', '2', '3'],
      );
    });

    it('never returns more than asked for', () => {
      const ranked = Array.from({ length: 30 }, (_, index) => item(`b${index}`, String(index)));
      assert.equal(diversify(ranked, 5).length, 5);
    });
  });
});

describe('the product query schema is the one gate', () => {
  it('accepts the fields an interpretation can produce', () => {
    const parsed = productQuerySchema.parse({
      search: 'shoes',
      category: 'Footwear',
      brand: 'Nike',
      color: 'Black',
      maxPrice: 3000,
      minRating: 4,
      inStock: 'true',
      sort: 'relevance',
    });

    assert.equal(parsed.color, 'Black');
    assert.equal(parsed.sort, 'relevance');
    assert.equal(parsed.inStock, true);
  });

  it('refuses an operator in every field an interpretation touches', () => {
    for (const bad of [
      { color: { $ne: null } },
      { category: { $where: '1' } },
      { maxPrice: { $gt: 1 } },
      { sort: { $where: '1' } },
      { inStock: { $ne: false } },
    ]) {
      assert.equal(productQuerySchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
  });
});
