import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ADJUSTMENT_REASONS,
  LARGE_ADJUSTMENT,
  MAX_ADJUSTMENT,
  MOVEMENT_DIRECTION,
  MOVEMENT_TYPES,
  REASON_DIRECTION,
} from '../src/models/inventory-movement.model';
import {
  LOW_STOCK_THRESHOLD,
  STOCK_FILTERS,
  stockStateOf,
  thresholdOf,
} from '../src/models/product.model';
import {
  adjustmentFilter,
  assertAdjustmentDirection,
  assertMovementSign,
  movementSummary,
  planMovement,
} from '../src/services/inventory/inventory.service';
import { adjustStockSchema, setThresholdSchema } from '../src/validators/inventory.validator';

/**
 * The inventory rules, tested where they actually live.
 *
 * None of this touches MongoDB, which is the same choice the AI tests make and
 * for the same reason: what is under test is ZyCart's own logic, and a database
 * round trip would only add ways for the test to fail for reasons that have
 * nothing to do with it.
 *
 * That does mean a *true* concurrency test — two clients racing for the last
 * unit — is not here, because it cannot be without a replica set to race
 * against. What is tested instead is the thing that makes the race safe: the
 * guard lives entirely in the filter of a single atomic `findOneAndUpdate`, so
 * asserting the filter's shape asserts the guarantee. The property below holds
 * for every decrease, and no interleaving of updates can produce negative stock
 * while it does.
 */

const ID = '507f1f77bcf86cd799439011';

describe('stock state', () => {
  it('reads out of stock, low stock and healthy against the default threshold', () => {
    assert.equal(stockStateOf(0), 'out_of_stock');
    assert.equal(stockStateOf(LOW_STOCK_THRESHOLD), 'low_stock');
    assert.equal(stockStateOf(LOW_STOCK_THRESHOLD + 1), 'in_stock');
  });

  it('honours a product-level threshold', () => {
    // 20 units is healthy by the store default and low for this product.
    assert.equal(stockStateOf(20), 'in_stock');
    assert.equal(stockStateOf(20, 50), 'low_stock');
  });

  it('treats out of stock as stronger than low stock, even at a zero threshold', () => {
    assert.equal(stockStateOf(0, 0), 'out_of_stock');
    assert.equal(stockStateOf(1, 0), 'in_stock');
  });

  it('never reports negative stock as anything but out of stock', () => {
    assert.equal(stockStateOf(-3), 'out_of_stock');
  });

  it('falls back to the store default for a product written before the field existed', () => {
    assert.equal(thresholdOf({}), LOW_STOCK_THRESHOLD);
    assert.equal(thresholdOf({ lowStockThreshold: null }), LOW_STOCK_THRESHOLD);
    assert.equal(thresholdOf({ lowStockThreshold: 0 }), 0);
    assert.equal(thresholdOf({ lowStockThreshold: 12 }), 12);
  });

  it('compares against the same fallback in the database filters', () => {
    // The `$ifNull` is what makes a pre-Phase-12 document classify at all; a
    // plain `$lte: ['$stock', '$lowStockThreshold']` would compare a number
    // against a missing field.
    assert.match(JSON.stringify(STOCK_FILTERS.low_stock), /ifNull/);
    assert.match(JSON.stringify(STOCK_FILTERS.in_stock), /ifNull/);
  });

  it('partitions every quantity into exactly one state', () => {
    for (const threshold of [0, 1, 5, 40]) {
      for (const stock of [0, 1, 2, 5, 6, 40, 41, 1000]) {
        const states = (['out_of_stock', 'low_stock', 'in_stock'] as const).filter(
          (state) => stockStateOf(stock, threshold) === state,
        );
        assert.equal(states.length, 1, `stock ${stock} at threshold ${threshold}`);
      }
    }
  });
});

describe('movement sign', () => {
  it('refuses a sale that increases stock and a cancellation that decreases it', () => {
    assert.throws(() => assertMovementSign('SALE', 5), /cannot increase/);
    assert.throws(() => assertMovementSign('CANCELLATION', -5), /cannot decrease/);
    assert.throws(() => assertMovementSign('INITIAL_STOCK', -1), /cannot decrease/);
  });

  it('lets a manual adjustment go either way', () => {
    assert.doesNotThrow(() => assertMovementSign('MANUAL_ADJUSTMENT', 20));
    assert.doesNotThrow(() => assertMovementSign('MANUAL_ADJUSTMENT', -20));
  });

  it('refuses a movement that moves nothing, or a fraction of a unit', () => {
    for (const type of MOVEMENT_TYPES) {
      assert.throws(() => assertMovementSign(type, 0), /non-zero/);
    }
    assert.throws(() => assertMovementSign('MANUAL_ADJUSTMENT', 1.5), /whole/);
    assert.throws(() => assertMovementSign('MANUAL_ADJUSTMENT', Number.NaN), /whole/);
  });

  it('has a declared direction for every movement type', () => {
    for (const type of MOVEMENT_TYPES) {
      assert.ok(MOVEMENT_DIRECTION[type], `${type} has no declared direction`);
    }
  });
});

describe('movement arithmetic', () => {
  it('stores an after that is exactly before plus change', () => {
    for (const [before, change] of [
      [0, 10],
      [46, -12],
      [5, -5],
      [1000, 1],
    ] as const) {
      assert.equal(
        planMovement('MANUAL_ADJUSTMENT', before, change).quantityAfter,
        before + change,
      );
    }
  });

  it('refuses a movement that would leave stock below zero', () => {
    assert.throws(() => planMovement('MANUAL_ADJUSTMENT', 4, -5), /below zero/);
    assert.throws(() => planMovement('SALE', 0, -1), /below zero/);
  });

  it('allows a movement that lands exactly on zero', () => {
    assert.equal(planMovement('SALE', 5, -5).quantityAfter, 0);
  });
});

describe('adjustment concurrency guard', () => {
  it('carries a stock floor at least as large as every decrease', () => {
    for (const change of [-1, -2, -7, -99, -MAX_ADJUSTMENT]) {
      const filter = adjustmentFilter(ID, change) as { stock?: { $gte?: number } };

      assert.ok(filter.stock, `no floor for a decrease of ${change}`);
      assert.equal(filter.stock.$gte, -change);

      // The property that matters: any document the filter matches has enough
      // stock for the decrement, so the result of `$inc` cannot be negative.
      const smallestMatch = filter.stock.$gte;
      assert.ok(smallestMatch + change >= 0);
    }
  });

  it('adds no floor to an increase, where every quantity is already valid', () => {
    assert.deepEqual(adjustmentFilter(ID, 20), { _id: ID });
  });

  it('puts a counted total into the same atomic filter rather than checking it separately', () => {
    assert.deepEqual(adjustmentFilter(ID, -3, 17), { _id: ID, stock: { $gte: 3, $eq: 17 } });
    assert.deepEqual(adjustmentFilter(ID, 3, 17), { _id: ID, stock: { $eq: 17 } });
  });

  it('never matches a product other than the one named', () => {
    const filter = adjustmentFilter(ID, -1, 4) as { _id: string };
    assert.equal(filter._id, ID);
  });
});

describe('adjustment reasons', () => {
  it('refuses a restock that removes stock and damage that adds it', () => {
    assert.throws(() => assertAdjustmentDirection('RESTOCK', -5), /cannot be used for a decrease/);
    assert.throws(() => assertAdjustmentDirection('RETURN', -5), /cannot be used for a decrease/);
    assert.throws(() => assertAdjustmentDirection('DAMAGED', 5), /cannot be used for an increase/);
    assert.throws(() => assertAdjustmentDirection('LOST', 5), /cannot be used for an increase/);
  });

  it('lets a recount go either way, which is the point of a recount', () => {
    assert.doesNotThrow(() => assertAdjustmentDirection('COUNT_CORRECTION', 5));
    assert.doesNotThrow(() => assertAdjustmentDirection('COUNT_CORRECTION', -5));
    assert.doesNotThrow(() => assertAdjustmentDirection('OTHER', -5));
  });

  it('has a declared direction for every reason the API accepts', () => {
    for (const reason of ADJUSTMENT_REASONS) {
      assert.ok(REASON_DIRECTION[reason], `${reason} has no declared direction`);
    }
  });
});

describe('adjustment input', () => {
  const valid = { quantityChange: 10, reason: 'RESTOCK' as const };

  it('accepts a signed whole number with a reason', () => {
    assert.equal(adjustStockSchema.parse(valid).quantityChange, 10);
    assert.equal(
      adjustStockSchema.parse({ ...valid, quantityChange: -4, reason: 'DAMAGED' }).quantityChange,
      -4,
    );
  });

  it('refuses an adjustment of zero', () => {
    assert.equal(adjustStockSchema.safeParse({ ...valid, quantityChange: 0 }).success, false);
  });

  it('refuses a fraction of a unit', () => {
    assert.equal(adjustStockSchema.safeParse({ ...valid, quantityChange: 2.5 }).success, false);
  });

  it('refuses an adjustment beyond the bound, in both directions', () => {
    assert.equal(
      adjustStockSchema.safeParse({ ...valid, quantityChange: MAX_ADJUSTMENT + 1 }).success,
      false,
    );
    assert.equal(
      adjustStockSchema.safeParse({ ...valid, quantityChange: -MAX_ADJUSTMENT - 1 }).success,
      false,
    );
  });

  it('requires a reason, and only a reason the ledger knows', () => {
    assert.equal(adjustStockSchema.safeParse({ quantityChange: 5 }).success, false);
    assert.equal(
      adjustStockSchema.safeParse({ quantityChange: 5, reason: 'BECAUSE' }).success,
      false,
    );
  });

  it('refuses a body that tries to set a total instead of a change', () => {
    // The whole point of the endpoint. `.strict()` is what enforces it, so a
    // regression here would be silent without this test.
    assert.equal(adjustStockSchema.safeParse({ ...valid, stock: 150 }).success, false);
    assert.equal(adjustStockSchema.safeParse({ ...valid, quantityAfter: 150 }).success, false);
  });

  it('refuses a body that tries to reach anything else on the product', () => {
    for (const field of ['price', 'isActive', 'sku', 'rating', 'actor']) {
      assert.equal(
        adjustStockSchema.safeParse({ ...valid, [field]: 1 }).success,
        false,
        `${field} was accepted`,
      );
    }
  });

  it('accepts a counted total as an optional precondition', () => {
    const parsed = adjustStockSchema.parse({ ...valid, expectedStock: 17, shownStock: 17 });

    assert.equal(parsed.expectedStock, 17);
    assert.equal(parsed.shownStock, 17);
  });

  it('refuses a negative stock reading', () => {
    assert.equal(adjustStockSchema.safeParse({ ...valid, expectedStock: -1 }).success, false);
  });
});

describe('threshold input', () => {
  it('accepts a number, and null to restore the store default', () => {
    assert.equal(setThresholdSchema.parse({ lowStockThreshold: 25 }).lowStockThreshold, 25);
    assert.equal(setThresholdSchema.parse({ lowStockThreshold: null }).lowStockThreshold, null);
  });

  it('refuses a negative or absurd threshold', () => {
    assert.equal(setThresholdSchema.safeParse({ lowStockThreshold: -1 }).success, false);
    assert.equal(setThresholdSchema.safeParse({ lowStockThreshold: 10_000 }).success, false);
  });

  it('refuses anything else in the body', () => {
    assert.equal(setThresholdSchema.safeParse({ lowStockThreshold: 5, stock: 100 }).success, false);
  });
});

describe('movement summaries', () => {
  it('names the order behind a sale or a cancellation', () => {
    assert.equal(movementSummary('SALE', 'ZY10482', null), 'Sold on ZY10482');
    assert.equal(movementSummary('CANCELLATION', 'ZY10482', null), 'Returned from ZY10482');
  });

  it('falls back to a plain description when there is no reference', () => {
    assert.equal(movementSummary('SALE', '', null), 'Sold');
    assert.equal(movementSummary('CANCELLATION', '', null), 'Order cancelled');
  });

  it('reads an adjustment by its reason', () => {
    assert.equal(movementSummary('MANUAL_ADJUSTMENT', '', 'COUNT_CORRECTION'), 'Count correction');
    assert.equal(movementSummary('MANUAL_ADJUSTMENT', '', null), 'Manual adjustment');
  });

  it('has a summary for every movement type', () => {
    for (const type of MOVEMENT_TYPES) {
      assert.ok(movementSummary(type, 'ZY1', 'RESTOCK').length > 0, `${type} has no summary`);
    }
  });
});

describe('adjustment bounds', () => {
  it('warns well below the point at which it refuses', () => {
    // A confirmation an operator meets routinely would stop being read; a bound
    // they meet routinely would stop them working.
    assert.ok(LARGE_ADJUSTMENT < MAX_ADJUSTMENT);
  });
});
