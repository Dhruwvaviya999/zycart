import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrderStatus, PaymentStatus } from '../src/models/order.model';
import { changed } from '../src/services/admin/audit.service';
import {
  ATTENTION_KEYS,
  ATTENTION_RULES,
  attentionFilter,
  attentionFlags,
  BULK_LIMIT,
  type AttentionOrder,
} from '../src/services/admin/operations.service';
import {
  adminAuditQuerySchema,
  adminOrderQuerySchema,
  bulkOrderStatusSchema,
} from '../src/validators/admin.validator';

/**
 * The operations rules.
 *
 * Each rule exists twice — once as a Mongo filter that counts and pages, once
 * as a JavaScript predicate that labels a row — and the two cannot be derived
 * from each other. So this file evaluates both over the same orders and asserts
 * they agree. The matcher below understands exactly the operators the rules
 * use and **throws on anything else**, so a rule written with an operator it
 * has not seen fails loudly here rather than passing quietly and drifting.
 */

/* ---------------------------------------------------------------- */
/* A minimal Mongo matcher, for the agreement test only              */
/* ---------------------------------------------------------------- */

function readPath(document: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (typeof value !== 'object' || value === null) return undefined;
    return (value as Record<string, unknown>)[key];
  }, document);
}

function matchesClause(actual: unknown, expected: unknown): boolean {
  if (typeof expected !== 'object' || expected === null || expected instanceof Date) {
    return actual === expected;
  }

  return Object.entries(expected as Record<string, unknown>).every(([operator, operand]) => {
    switch (operator) {
      case '$ne':
        return actual !== operand;
      case '$in':
        return (operand as unknown[]).includes(actual);
      case '$nin':
        return !(operand as unknown[]).includes(actual);
      case '$lt':
        return (actual as Date) < (operand as Date);
      case '$gte':
        return (actual as Date) >= (operand as Date);
      default:
        throw new Error(
          `The attention-rule agreement test does not understand "${operator}". ` +
            'Teach the matcher about it, or the two halves of that rule are no longer checked.',
        );
    }
  });
}

function matchesFilter(
  document: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') {
      return (expected as Record<string, unknown>[]).some((clause) =>
        matchesFilter(document, clause),
      );
    }

    return matchesClause(readPath(document, key), expected);
  });
}

/* ---------------------------------------------------------------- */
/* Sample orders                                                     */
/* ---------------------------------------------------------------- */

const NOW = new Date('2026-09-20T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

function order(overrides: Partial<AttentionOrder> = {}): AttentionOrder {
  return {
    status: 'CONFIRMED',
    stockCommitted: true,
    createdAt: hoursAgo(1),
    payment: { method: 'COD', status: 'PENDING' },
    ...overrides,
  };
}

/** Enough shapes to exercise every rule, and several that trip none. */
const SAMPLES: { name: string; order: AttentionOrder }[] = [
  { name: 'healthy cash order', order: order() },
  {
    name: 'healthy paid order',
    order: order({ payment: { method: 'RAZORPAY', status: 'PAID' } }),
  },
  { name: 'fresh pending order', order: order({ status: 'PENDING' }) },
  {
    name: 'failed online payment',
    order: order({ status: 'PENDING', payment: { method: 'RAZORPAY', status: 'FAILED' } }),
  },
  {
    name: 'failed payment on a cancelled order',
    order: order({
      status: 'CANCELLED',
      stockCommitted: false,
      payment: { method: 'RAZORPAY', status: 'FAILED' },
    }),
  },
  {
    name: 'online payment stalled overnight',
    order: order({
      status: 'PENDING',
      stockCommitted: false,
      createdAt: hoursAgo(30),
      payment: { method: 'RAZORPAY', status: 'PENDING' },
    }),
  },
  {
    name: 'online payment unfinished but recent',
    order: order({
      status: 'PENDING',
      stockCommitted: false,
      createdAt: hoursAgo(2),
      payment: { method: 'RAZORPAY', status: 'PENDING' },
    }),
  },
  {
    name: 'refund owed',
    order: order({
      status: 'CANCELLED',
      payment: { method: 'RAZORPAY', status: 'REFUND_PENDING' },
    }),
  },
  {
    name: 'paid but never confirmed',
    order: order({ status: 'PENDING', payment: { method: 'RAZORPAY', status: 'PAID' } }),
  },
  {
    name: 'in progress without holding stock',
    order: order({ status: 'PROCESSING', stockCommitted: false }),
  },
  {
    name: 'confirmed a week ago, still not shipped',
    order: order({ createdAt: hoursAgo(24 * 7) }),
  },
  {
    name: 'shipped long ago',
    order: order({ status: 'SHIPPED', createdAt: hoursAgo(24 * 30) }),
  },
  {
    name: 'delivered cash order',
    order: order({ status: 'DELIVERED', createdAt: hoursAgo(24 * 30) }),
  },
];

const asDocument = (value: AttentionOrder): Record<string, unknown> => ({
  status: value.status,
  stockCommitted: value.stockCommitted,
  createdAt: value.createdAt,
  payment: value.payment,
});

describe('attention rules agree with their database filters', () => {
  for (const rule of ATTENTION_RULES) {
    it(`${rule.key} matches the same orders both ways`, () => {
      for (const sample of SAMPLES) {
        const viaFilter = matchesFilter(asDocument(sample.order), rule.filter(NOW));
        const viaPredicate = rule.matches(sample.order, NOW);

        assert.equal(
          viaFilter,
          viaPredicate,
          `${rule.key} disagrees about "${sample.name}": filter says ${viaFilter}, predicate says ${viaPredicate}`,
        );
      }
    });
  }

  it('the combined queue filter matches exactly the orders that carry a flag', () => {
    const filter = attentionFilter(NOW);

    for (const sample of SAMPLES) {
      assert.equal(
        matchesFilter(asDocument(sample.order), filter),
        attentionFlags(sample.order, NOW).length > 0,
        `the queue and the row labels disagree about "${sample.name}"`,
      );
    }
  });
});

describe('attention rules', () => {
  const flagKeys = (value: AttentionOrder) => attentionFlags(value, NOW).map((flag) => flag.key);

  it('leaves a healthy order alone', () => {
    assert.deepEqual(flagKeys(order()), []);
    assert.deepEqual(flagKeys(order({ status: 'PENDING' })), []);
  });

  it('flags a failed online payment, but not once the order is cancelled', () => {
    assert.ok(
      flagKeys(
        order({ status: 'PENDING', payment: { method: 'RAZORPAY', status: 'FAILED' } }),
      ).includes('PAYMENT_FAILED'),
    );
    assert.ok(
      !flagKeys(
        order({ status: 'CANCELLED', payment: { method: 'RAZORPAY', status: 'FAILED' } }),
      ).includes('PAYMENT_FAILED'),
    );
  });

  it('waits a day before calling an online payment stalled', () => {
    const unfinished = (hours: number) =>
      order({
        status: 'PENDING',
        createdAt: hoursAgo(hours),
        payment: { method: 'RAZORPAY', status: 'PENDING' },
      });

    assert.ok(!flagKeys(unfinished(2)).includes('PAYMENT_STALLED'));
    assert.ok(flagKeys(unfinished(30)).includes('PAYMENT_STALLED'));
  });

  it('never calls a cash-on-delivery order unpaid, whatever its age', () => {
    // A COD order's payment stays PENDING for its whole life by design. Treating
    // that as an exception would put every cash order in the queue forever.
    const old = order({ status: 'PENDING', createdAt: hoursAgo(24 * 30) });

    assert.ok(!flagKeys(old).includes('PAYMENT_STALLED'));
    assert.deepEqual(flagKeys(old), []);
  });

  it('flags an order in progress that never took stock', () => {
    assert.ok(
      flagKeys(order({ status: 'PROCESSING', stockCommitted: false })).includes('STOCK_NOT_HELD'),
    );
    assert.ok(
      !flagKeys(order({ status: 'PENDING', stockCommitted: false })).includes('STOCK_NOT_HELD'),
    );
  });

  it('flags the state finalisation should make unreachable', () => {
    assert.ok(
      flagKeys(
        order({ status: 'PENDING', payment: { method: 'RAZORPAY', status: 'PAID' } }),
      ).includes('PAID_NOT_CONFIRMED'),
    );
  });

  it('stops chasing dispatch once an order has shipped', () => {
    assert.ok(flagKeys(order({ createdAt: hoursAgo(24 * 7) })).includes('FULFILMENT_OVERDUE'));
    assert.ok(
      !flagKeys(order({ status: 'SHIPPED', createdAt: hoursAgo(24 * 7) })).includes(
        'FULFILMENT_OVERDUE',
      ),
    );
    assert.deepEqual(flagKeys(order({ status: 'DELIVERED', createdAt: hoursAgo(24 * 30) })), []);
  });

  it('can flag one order for several reasons at once', () => {
    const keys = flagKeys(
      order({ status: 'CONFIRMED', stockCommitted: false, createdAt: hoursAgo(24 * 7) }),
    );

    assert.ok(keys.includes('STOCK_NOT_HELD'));
    assert.ok(keys.includes('FULFILMENT_OVERDUE'));
  });

  it('gives every rule a label, an action and a severity', () => {
    for (const rule of ATTENTION_RULES) {
      assert.ok(rule.label.length > 0, `${rule.key} has no label`);
      assert.ok(rule.action.length > 0, `${rule.key} tells an operator nothing to do`);
      assert.ok(['critical', 'warning'].includes(rule.severity));
    }
  });

  it('declares every key exactly once', () => {
    const keys = ATTENTION_RULES.map((rule) => rule.key);

    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual([...keys].sort(), [...ATTENTION_KEYS].sort());
  });
});

describe('bulk fulfilment input', () => {
  const valid = { orderNumbers: ['ZY10482'], status: 'PROCESSING' as const };

  it('accepts a list of order numbers and a reachable status', () => {
    assert.equal(bulkOrderStatusSchema.parse(valid).orderNumbers.length, 1);
  });

  it('refuses an empty selection', () => {
    assert.equal(bulkOrderStatusSchema.safeParse({ ...valid, orderNumbers: [] }).success, false);
  });

  it('refuses more than one page of orders at a time', () => {
    const many = Array.from({ length: BULK_LIMIT + 1 }, (_, index) => `ZY${index}`);

    assert.equal(bulkOrderStatusSchema.safeParse({ ...valid, orderNumbers: many }).success, false);
  });

  it('has no bulk cancellation', () => {
    // Cancelling restores stock and may owe a refund. It stays a single-order,
    // confirmed decision, and the schema is what guarantees that.
    assert.equal(bulkOrderStatusSchema.safeParse({ ...valid, status: 'CANCELLED' }).success, false);
    assert.equal(bulkOrderStatusSchema.safeParse({ ...valid, status: 'PENDING' }).success, false);
  });

  it('refuses anything else in the body', () => {
    assert.equal(
      bulkOrderStatusSchema.safeParse({ ...valid, payment: { status: 'PAID' } }).success,
      false,
    );
  });
});

describe('admin query state', () => {
  it('reads the attention queue as a filter that composes with the others', () => {
    const parsed = adminOrderQuerySchema.parse({
      attention: 'true',
      paymentStatus: 'FAILED' satisfies PaymentStatus,
      period: '7d',
    });

    assert.equal(parsed.attention, true);
    assert.equal(parsed.paymentStatus, 'FAILED');
  });

  it('leaves attention undefined rather than false when it is absent', () => {
    // Absent means "no filter", which is not the same as "orders that are fine".
    assert.equal(adminOrderQuerySchema.parse({}).attention, undefined);
  });

  it('refuses an unrecognised order status', () => {
    assert.equal(
      adminOrderQuerySchema.safeParse({ status: 'REFUNDED' as OrderStatus }).success,
      false,
    );
  });

  it('refuses a stray query parameter rather than passing it to a Mongo filter', () => {
    assert.equal(adminOrderQuerySchema.safeParse({ user: 'someone' }).success, false);
    assert.equal(adminAuditQuerySchema.safeParse({ actorEmail: 'a@b.c' }).success, false);
  });

  it('defaults the audit trail to a bounded window rather than all time', () => {
    assert.equal(adminAuditQuerySchema.parse({}).period, '30d');
  });

  it('refuses an actor filter that is not an id', () => {
    assert.equal(adminAuditQuerySchema.safeParse({ actor: 'admin' }).success, false);
  });
});

describe('audit change list', () => {
  it('records a change as strings the interface can render', () => {
    assert.deepEqual(changed('stock', 24, 34), [{ field: 'stock', from: '24', to: '34' }]);
    assert.deepEqual(changed('isActive', true, false), [
      { field: 'isActive', from: 'true', to: 'false' },
    ]);
  });

  it('records nothing when nothing moved', () => {
    assert.deepEqual(changed('price', 4999, 4999), []);
    assert.deepEqual(changed('name', undefined, undefined), []);
  });

  it('treats null and an empty string as the same absence', () => {
    assert.deepEqual(changed('compareAtPrice', null, ''), []);
  });
});
