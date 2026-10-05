import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import {
  assertVariantShape,
  defaultVariantSku,
  deriveSizeAvailability,
  findVariant,
  planNewVariants,
  planVariantEdit,
  sameOption,
  sellableQuantity,
  sizeAvailabilityChanged,
  stockCondition,
  stockWriteFilter,
  tracksVariants,
  variantLabel,
} from '../src/services/inventory/variant-stock';
import { adjustStockSchema } from '../src/validators/inventory.validator';
import { createProductSchema, updateProductSchema } from '../src/validators/product.validator';

/**
 * Stock per colour and size (Phase 20), tested where the rules live.
 *
 * As with the Phase 12 inventory tests, nothing here touches MongoDB. The
 * guarantee that two customers cannot both buy the last pair of size 9 lives
 * in the filter of one atomic update, so asserting the filter's shape asserts
 * the guarantee; the planners that decide what a product form may do to a
 * variant list are pure, so every refusal is asserted directly.
 */

const SHOE = {
  colors: ['Black', 'White'],
  sizes: ['8', '9'],
};

const id = () => new Types.ObjectId();

function shoe(stocks: { black8?: number; black9?: number; white9?: number } = {}) {
  const variants = [
    { _id: id(), color: 'Black', size: '8', sku: 'RUN-BLACK-8', stock: stocks.black8 ?? 3 },
    { _id: id(), color: 'Black', size: '9', sku: 'RUN-BLACK-9', stock: stocks.black9 ?? 0 },
    { _id: id(), color: 'White', size: '9', sku: 'RUN-WHITE-9', stock: stocks.white9 ?? 2 },
  ];

  return {
    stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
    variants,
  };
}

describe('matching a choice to a variant', () => {
  it('treats trimmed equal strings, and absent values, as the same option', () => {
    assert.ok(sameOption('Black', ' Black '));
    assert.ok(sameOption(null, undefined));
    assert.ok(sameOption('', null));
    assert.ok(!sameOption('Black', 'black'));
    assert.ok(!sameOption('Black', null));
  });

  it('finds the exact colour-and-size pair', () => {
    const { variants } = shoe();
    assert.equal(findVariant(variants, { color: 'White', size: '9' })?.sku, 'RUN-WHITE-9');
  });

  it('does not match a pair the product does not sell', () => {
    const { variants } = shoe();
    assert.equal(findVariant(variants, { color: 'White', size: '8' }), null);
  });

  it('does not let a request reach a variant by leaving an axis out', () => {
    const { variants } = shoe();
    assert.equal(findVariant(variants, { color: 'Black' }), null);
    assert.equal(findVariant(variants, { size: '9' }), null);
  });

  it('does not let a request name an axis the product does not have', () => {
    const sizesOnly = [{ color: null, size: 'M', sku: 'TEE-M', stock: 4 }];
    assert.equal(findVariant(sizesOnly, { size: 'M' })?.sku, 'TEE-M');
    assert.equal(findVariant(sizesOnly, { color: 'Red', size: 'M' }), null);
  });

  it('names a variant the way every screen does', () => {
    assert.equal(variantLabel({ color: 'Black', size: '9' }), 'Black · Size 9');
    assert.equal(variantLabel({ size: 'M' }), 'Size M');
    assert.equal(variantLabel({ color: 'Black' }), 'Black');
    assert.equal(variantLabel({}), '');
  });
});

describe('how many can be sold', () => {
  it('is the variant’s own count on a product that tracks variants', () => {
    const product = shoe({ black8: 3, white9: 2 });
    assert.ok(tracksVariants(product));
    assert.equal(sellableQuantity(product, { color: 'Black', size: '8' }), 3);
    assert.equal(sellableQuantity(product, { color: 'Black', size: '9' }), 0);
  });

  it('is zero for a combination the product does not sell, whatever the total says', () => {
    const product = shoe({ black8: 50 });
    assert.equal(sellableQuantity(product, { color: 'White', size: '8' }), 0);
  });

  it('is the product’s count on a product that holds one, as before Phase 20', () => {
    const product = { stock: 12, variants: [] };
    assert.ok(!tracksVariants(product));
    assert.equal(sellableQuantity(product, { color: 'Black', size: '9' }), 12);
    assert.equal(sellableQuantity({ stock: 12 }, null), 12);
  });
});

describe('size availability follows the variants', () => {
  const sizes = [
    { label: '8', inStock: false },
    { label: '9', inStock: true },
  ];

  it('marks a size in stock exactly when some variant of that size has units', () => {
    const derived = deriveSizeAvailability(
      sizes,
      shoe({ black8: 1, black9: 0, white9: 0 }).variants,
    );
    assert.deepEqual(
      derived.map((size) => [size.label, size.inStock]),
      [
        ['8', true],
        ['9', false],
      ],
    );
  });

  it('leaves an operator’s flags alone on a product that holds one count', () => {
    assert.deepEqual(deriveSizeAvailability(sizes, []), sizes);
    assert.ok(!sizeAvailabilityChanged(sizes, []));
  });

  it('returns plain entries, never copies of the ones it was given', () => {
    // A spread Mongoose subdocument carries its `_doc`, which Mongoose then
    // prefers over the new flag — the bug that once left a sold-out size
    // marked available after the last pair sold.
    const subdocLike = [{ label: '9', inStock: true, _doc: { label: '9', inStock: true } }];
    const derived = deriveSizeAvailability(subdocLike, shoe({ black9: 0, white9: 0 }).variants);
    assert.deepEqual(derived, [{ label: '9', inStock: false }]);
  });

  it('reports when a write is needed, and only then', () => {
    const variants = shoe({ black8: 1, white9: 1 }).variants;
    assert.ok(sizeAvailabilityChanged(sizes, variants));
    assert.ok(!sizeAvailabilityChanged(deriveSizeAvailability(sizes, variants), variants));
  });
});

describe('the atomic filter for a stock write', () => {
  const productId = id();
  const variantId = id();

  it('puts the floor on the variant’s own count, inside $elemMatch', () => {
    const filter = stockWriteFilter({ productId, variantId, quantityChange: -2 }) as {
      variants: { $elemMatch: { _id: Types.ObjectId; stock: { $gte: number } } };
    };

    assert.equal(filter.variants.$elemMatch._id, variantId);
    assert.equal(filter.variants.$elemMatch.stock.$gte, 2);
    // The floor is on the variant, not on the total: a total of 40 must not
    // let somebody buy a size that has none.
    assert.ok(!('stock' in filter));
  });

  it('carries a floor at least as large as every decrease, so no interleaving goes negative', () => {
    for (const change of [-1, -2, -7, -100]) {
      const condition = stockCondition(change);
      assert.ok(condition?.$gte !== undefined);
      assert.ok(condition.$gte + change >= 0);
    }
  });

  it('still requires the variant to exist for an increase, so the total cannot move alone', () => {
    const filter = stockWriteFilter({ productId, variantId, quantityChange: 5 }) as {
      variants: { $elemMatch: Record<string, unknown> };
    };
    assert.deepEqual(filter.variants.$elemMatch, { _id: variantId });
  });

  it('refuses a product-level write once the product has been split into variants', () => {
    const filter = stockWriteFilter({ productId, variantId: null, quantityChange: -1 });
    assert.deepEqual(filter, {
      _id: productId,
      'variants.0': { $exists: false },
      stock: { $gte: 1 },
    });
  });

  it('pins a recount to the exact current count', () => {
    assert.deepEqual(stockCondition(3, 17), { $eq: 17 });
    assert.deepEqual(stockCondition(-3, 17), { $gte: 3, $eq: 17 });
    assert.equal(stockCondition(4), null);
  });

  it('asks for an active product only when the caller does', () => {
    assert.equal(
      stockWriteFilter({ productId, variantId, quantityChange: -1, requireActive: true }).isActive,
      true,
    );
    assert.ok(!('isActive' in stockWriteFilter({ productId, variantId, quantityChange: 1 })));
  });
});

describe('the shape of a variant list', () => {
  it('accepts a list that fits the product’s options', () => {
    assert.doesNotThrow(() =>
      assertVariantShape(
        [
          { color: 'Black', size: '8' },
          { color: 'White', size: '9' },
        ],
        SHOE,
      ),
    );
  });

  it('requires every axis the product has', () => {
    assert.throws(() => assertVariantShape([{ color: 'Black' }], SHOE), /must name a size/);
    assert.throws(() => assertVariantShape([{ size: '8' }], SHOE), /must name a colour/);
  });

  it('refuses an axis the product does not have', () => {
    assert.throws(
      () => assertVariantShape([{ color: 'Black', size: 'M' }], { colors: [], sizes: ['M'] }),
      /not a colour/,
    );
  });

  it('refuses a colour or size the product does not list', () => {
    assert.throws(() => assertVariantShape([{ color: 'Red', size: '8' }], SHOE), /not a colour/);
    assert.throws(() => assertVariantShape([{ color: 'Black', size: '12' }], SHOE), /not a size/);
  });

  it('refuses the same combination twice', () => {
    assert.throws(
      () =>
        assertVariantShape(
          [
            { color: 'Black', size: '8' },
            { color: ' Black', size: '8 ' },
          ],
          SHOE,
        ),
      /listed twice/,
    );
  });
});

describe('creating a product with variants', () => {
  it('fills in SKUs from the product’s own', () => {
    const planned = planNewVariants(
      [
        { color: 'Black', size: '8', stock: 3 },
        { color: 'White', size: '9', sku: 'custom-w9' },
      ],
      'zy-run-01',
      SHOE,
    );

    assert.deepEqual(
      planned.map((variant) => [variant.sku, variant.stock]),
      [
        ['ZY-RUN-01-BLACK-8', 3],
        ['CUSTOM-W9', 0],
      ],
    );
  });

  it('keeps a derived SKU within bounds and free of punctuation', () => {
    assert.equal(
      defaultVariantSku('ZY-1', { color: 'Sail / Orange', size: '10.5' }),
      'ZY-1-SAIL-ORANGE-10-5',
    );
    assert.ok(defaultVariantSku('A', { color: 'x'.repeat(200) }).length <= 64);
  });

  it('refuses two variants that end up with the same SKU', () => {
    assert.throws(
      () =>
        planNewVariants(
          [
            { color: 'Black', size: '8', sku: 'SAME' },
            { color: 'Black', size: '9', sku: 'same' },
          ],
          'RUN',
          SHOE,
        ),
      /used twice/,
    );
  });
});

describe('editing a product’s variants never moves a unit', () => {
  const existing = () =>
    shoe({ black8: 3, black9: 0, white9: 2 }).variants.map((variant) => ({ ...variant }));

  it('splits a single count only when the shares add up to it exactly', () => {
    assert.throws(
      () =>
        planVariantEdit({
          existing: [],
          existingStock: 10,
          drafts: [
            { color: 'Black', size: '8', stock: 4 },
            { color: 'Black', size: '9', stock: 5 },
          ],
          productSku: 'RUN',
          axes: SHOE,
        }),
      /add up to 9, but the product holds 10/,
    );

    const plan = planVariantEdit({
      existing: [],
      existingStock: 9,
      drafts: [
        { color: 'Black', size: '8', stock: 4 },
        { color: 'Black', size: '9', stock: 5 },
      ],
      productSku: 'RUN',
      axes: SHOE,
    });

    assert.ok(plan.split);
    assert.equal(
      plan.variants.reduce((sum, variant) => sum + variant.stock, 0),
      9,
    );
  });

  it('keeps an existing combination’s count and id', () => {
    const before = existing();
    const plan = planVariantEdit({
      existing: before,
      existingStock: 5,
      drafts: before.map((variant) => ({ color: variant.color, size: variant.size })),
      productSku: 'RUN',
      axes: SHOE,
    });

    assert.deepEqual(
      plan.variants.map((variant) => [String(variant._id), variant.stock]),
      before.map((variant) => [String(variant._id), variant.stock]),
    );
    assert.deepEqual(plan.added, []);
    assert.deepEqual(plan.removed, []);
  });

  it('refuses a count typed into the form for an existing combination', () => {
    const before = existing();
    assert.throws(
      () =>
        planVariantEdit({
          existing: before,
          existingStock: 5,
          drafts: [{ color: 'Black', size: '8', stock: 30 }],
          productSku: 'RUN',
          axes: SHOE,
        }),
      /inventory console/,
    );
  });

  it('starts a new combination at zero, and refuses an opening count for it', () => {
    const before = existing();
    const drafts = [
      ...before.map((variant) => ({ color: variant.color, size: variant.size })),
      { color: 'White', size: '8' },
    ];

    const plan = planVariantEdit({
      existing: before,
      existingStock: 5,
      drafts,
      productSku: 'RUN',
      axes: SHOE,
    });

    assert.deepEqual(plan.added, ['White · Size 8']);
    assert.equal(plan.variants.at(-1)?.stock, 0);

    assert.throws(
      () =>
        planVariantEdit({
          existing: before,
          existingStock: 5,
          drafts: [...drafts.slice(0, -1), { color: 'White', size: '8', stock: 6 }],
          productSku: 'RUN',
          axes: SHOE,
        }),
      /starts at zero/,
    );
  });

  it('removes a combination only once it holds nothing', () => {
    const before = existing();

    // Black 9 holds nothing: removing it is fine.
    const plan = planVariantEdit({
      existing: before,
      existingStock: 5,
      drafts: [
        { color: 'Black', size: '8' },
        { color: 'White', size: '9' },
      ],
      productSku: 'RUN',
      axes: SHOE,
    });
    assert.deepEqual(plan.removed, ['Black · Size 9']);

    // White 9 holds two: removing it would lose them from the total.
    assert.throws(
      () =>
        planVariantEdit({
          existing: before,
          existingStock: 5,
          drafts: [{ color: 'Black', size: '8' }],
          productSku: 'RUN',
          axes: SHOE,
        }),
      /still holds 2/,
    );
  });

  it('merges every variant back into one count, keeping the total', () => {
    const plan = planVariantEdit({
      existing: existing(),
      existingStock: 5,
      drafts: [],
      productSku: 'RUN',
      axes: SHOE,
    });

    assert.ok(plan.merged);
    assert.deepEqual(plan.variants, []);
  });
});

describe('what the API accepts', () => {
  const base = {
    name: 'Runner',
    description: 'A running shoe for every day.',
    images: ['https://images.unsplash.com/photo-1'],
    price: 4999,
    category: '507f1f77bcf86cd799439011',
    brand: '507f1f77bcf86cd799439012',
    sku: 'RUN-01',
  };

  it('lets a product with variants leave its total out', () => {
    const parsed = createProductSchema.parse({
      ...base,
      variants: [{ color: 'Black', size: '9', stock: 4 }],
    });
    assert.equal(parsed.stock, undefined);
    assert.equal(parsed.variants?.[0]?.stock, 4);
  });

  it('accepts a variant list on an update, without a total', () => {
    const parsed = updateProductSchema.parse({ variants: [{ color: 'Black', size: '9' }] });
    assert.equal(parsed.variants?.length, 1);
    assert.ok(!('stock' in parsed));
  });

  it('accepts a variant on an adjustment, and refuses one that is not an id', () => {
    assert.ok(
      adjustStockSchema.safeParse({
        quantityChange: 3,
        reason: 'RESTOCK',
        variantId: '507f1f77bcf86cd799439011',
      }).success,
    );
    assert.ok(
      !adjustStockSchema.safeParse({ quantityChange: 3, reason: 'RESTOCK', variantId: 'black-9' })
        .success,
    );
  });
});
