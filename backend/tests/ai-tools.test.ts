import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { AI_LIMITS } from '../src/config/ai';
import { executeTool, toolsFor, toolDefinitions } from '../src/services/ai/tools';
import { defineTool, ToolError, type ToolContext } from '../src/services/ai/tools/types';
import {
  remember,
  toProductDetailView,
  toProductView,
  truncate,
  type AiProductView,
} from '../src/services/ai/tools/product-view';

/**
 * The tool layer is the whole security boundary, so these tests are about what
 * cannot happen: a tool that was never offered, a tool a guest may not call,
 * arguments that do not validate, and a product document leaking fields the
 * shopper never sees.
 *
 * None of this touches MongoDB. That is the point of the split — the rules
 * being tested are ZyCart's, and a database round trip would only add a way for
 * the test to fail for reasons that have nothing to do with them.
 */

const context = (userId: string | null): ToolContext => ({ userId, shown: new Map() });

const GUEST_TOOLS = ['search_products', 'get_product', 'compare_products'];
const ACCOUNT_ONLY = ['get_cart', 'add_to_cart'];

describe('tool permissions', () => {
  it('offers a guest only the read-only catalogue tools', () => {
    const names = toolsFor(false).map((tool) => tool.name);

    assert.deepEqual(names.sort(), [...GUEST_TOOLS].sort());
    for (const name of ACCOUNT_ONLY) assert.ok(!names.includes(name));
  });

  it('offers a signed-in customer the cart tools as well', () => {
    const names = toolsFor(true).map((tool) => tool.name);

    for (const name of [...GUEST_TOOLS, ...ACCOUNT_ONLY]) assert.ok(names.includes(name));
  });

  it('declares its own auth requirement rather than inferring one', () => {
    for (const tool of toolsFor(true)) {
      assert.equal(tool.requiresAuth, ACCOUNT_ONLY.includes(tool.name));
    }
  });

  it('has no tool that could run a query, place an order or take a payment', () => {
    const names = toolsFor(true).map((tool) => tool.name);

    for (const forbidden of [
      'run_mongodb_query',
      'execute_query',
      'search_database',
      'run_js',
      'checkout',
      'place_order',
      'pay',
      'buy_now',
      'cancel_order',
      'refund',
      'get_customer',
      'get_orders',
      'get_addresses',
      'get_profile',
      'add_to_wishlist',
    ]) {
      assert.ok(!names.includes(forbidden), `${forbidden} must not exist`);
    }
  });

  it('refuses a tool that was never offered, without running anything', async () => {
    const outcome = await executeTool(
      'run_mongodb_query',
      { q: '{}' },
      context('user-1'),
      toolsFor(true),
    );

    assert.equal(outcome.isError, true);
    assert.match(JSON.stringify(outcome.payload), /no tool called/i);
  });

  it('refuses an account-only tool for a guest even if it is handed the list', async () => {
    // The guest is offered three tools; asking for a fourth is refused on the
    // name. Passing the full list proves the auth check is what stops it.
    const outcome = await executeTool('get_cart', {}, context(null), toolsFor(true));

    assert.equal(outcome.isError, true);
    assert.match(JSON.stringify(outcome.payload), /signed in/i);
  });

  it('exposes every tool to the model with a closed schema', () => {
    for (const definition of toolDefinitions(toolsFor(true))) {
      assert.equal(definition.schema.type, 'object');
      assert.equal(definition.schema.additionalProperties, false);
      assert.ok(definition.description.length > 40, `${definition.name} needs a real description`);
    }
  });
});

describe('tool argument validation', () => {
  const probe = defineTool({
    name: 'probe',
    description: 'A tool used only by the tests.',
    requiresAuth: false,
    input: z.object({ quantity: z.number().int().min(1).max(10) }).strict(),
    execute: (args) => Promise.resolve({ quantity: args.quantity }),
  });

  it('rejects a quantity beyond the business ceiling', async () => {
    const outcome = await executeTool('probe', { quantity: 999_999 }, context(null), [probe]);

    assert.equal(outcome.isError, true);
    assert.match(JSON.stringify(outcome.payload), /Invalid arguments/);
  });

  it('rejects an argument of the wrong type', async () => {
    const outcome = await executeTool('probe', { quantity: 'two' }, context(null), [probe]);
    assert.equal(outcome.isError, true);
  });

  it('rejects arguments the schema never declared', async () => {
    const outcome = await executeTool(
      'probe',
      { quantity: 1, userId: 'someone-else' },
      context(null),
      [probe],
    );

    assert.equal(outcome.isError, true);
  });

  it('passes valid arguments through', async () => {
    const outcome = await executeTool('probe', { quantity: 3 }, context(null), [probe]);

    assert.equal(outcome.isError, false);
    assert.deepEqual(outcome.payload, { quantity: 3 });
  });

  it('relays a business refusal to the assistant, with its details', async () => {
    const refuses = defineTool({
      name: 'refuses',
      description: 'A tool used only by the tests.',
      requiresAuth: false,
      input: z.object({}).strict(),
      execute: () =>
        Promise.reject(new ToolError('Choose a size.', { availableSizes: ['8', '9'] })),
    });

    const outcome = await executeTool('refuses', {}, context(null), [refuses]);

    assert.equal(outcome.isError, true);
    assert.deepEqual(outcome.payload, { error: 'Choose a size.', availableSizes: ['8', '9'] });
  });

  it('lets a real fault escape rather than describing it to a customer', async () => {
    const broken = defineTool({
      name: 'broken',
      description: 'A tool used only by the tests.',
      requiresAuth: false,
      input: z.object({}).strict(),
      execute: () => Promise.reject(new Error('connection to db-primary refused at 10.0.0.4')),
    });

    await assert.rejects(() => executeTool('broken', {}, context(null), [broken]), /db-primary/);
  });
});

describe('product projection', () => {
  const document = {
    _id: 'ignored',
    id: 'a'.repeat(24),
    name: 'Air Max Runner',
    slug: 'air-max-runner',
    description: 'd'.repeat(4_000),
    shortDescription: 'Cushioned everyday runner',
    images: ['one.jpg', 'two.jpg', 'three.jpg', 'four.jpg'],
    price: 2_999,
    compareAtPrice: 3_999,
    brand: { name: 'Nike', slug: 'nike' },
    category: { name: 'Footwear', slug: 'footwear' },
    stock: 3,
    colors: [{ name: 'Black' }, { name: 'White' }],
    sizes: [
      { label: '8', inStock: true },
      { label: '9', inStock: false },
    ],
    highlights: Array.from({ length: 20 }, (_, index) => `highlight ${String(index)}`),
    specifications: Array.from({ length: 40 }, (_, index) => ({
      label: `spec ${String(index)}`,
      value: 'v'.repeat(400),
    })),
    rating: 4.6,
    reviewCount: 128,
    // Fields the assistant must never see.
    sku: 'SECRET-SKU',
    isActive: true,
    ratingSum: 589,
    ratingBreakdown: { 5: 100 },
    createdAt: '2026-01-01',
  };

  it('keeps only what a shopper sees', () => {
    const view = toProductView(document);
    const serialised = JSON.stringify(view);

    for (const leak of ['SECRET-SKU', 'ratingSum', 'ratingBreakdown', 'isActive', '_id']) {
      assert.ok(!serialised.includes(leak), `${leak} must not reach the model`);
    }

    assert.equal(view.price, 2_999);
    assert.equal(view.brand, 'Nike');
    assert.deepEqual(view.colors, ['Black', 'White']);
  });

  it('derives availability from the catalogue rule rather than the raw number', () => {
    assert.equal(toProductView({ ...document, stock: 3 }).availability, 'low_stock');
    assert.equal(toProductView({ ...document, stock: 0 }).availability, 'out_of_stock');
    assert.equal(toProductView({ ...document, stock: 50 }).availability, 'in_stock');
  });

  it('caps the images, specifications, highlights and description it forwards', () => {
    const view = toProductDetailView(document);

    assert.equal(view.images.length, AI_LIMITS.maxImagesPerProduct);
    assert.equal(view.specifications.length, AI_LIMITS.maxSpecifications);
    assert.equal(view.highlights.length, AI_LIMITS.maxHighlights);
    assert.ok(view.description.length <= AI_LIMITS.maxDescriptionLength);
  });

  it('survives a document with nothing populated', () => {
    const view = toProductView({});

    assert.equal(view.brand, '');
    assert.equal(view.price, 0);
    assert.equal(view.availability, 'out_of_stock');
  });

  it('truncates without cutting a string that already fits', () => {
    assert.equal(truncate('short', 50), 'short');
    assert.equal(truncate('a'.repeat(10), 5).length, 5);
  });
});

describe('what the customer has been shown', () => {
  const view = (id: string): AiProductView => ({ ...toProductView({ id, name: id }) });

  it('keeps the order products were shown in, so "the second one" resolves', () => {
    const shown = new Map<string, AiProductView>();

    remember(shown, [view('a'.repeat(24)), view('b'.repeat(24))]);
    remember(shown, [view('c'.repeat(24))]);

    assert.deepEqual([...shown.keys()], ['a'.repeat(24), 'b'.repeat(24), 'c'.repeat(24)]);
  });

  it('does not show the same product twice when two tools return it', () => {
    const shown = new Map<string, AiProductView>();

    remember(shown, [view('a'.repeat(24))]);
    remember(shown, [view('a'.repeat(24)), view('b'.repeat(24))]);

    assert.equal(shown.size, 2);
  });
});
