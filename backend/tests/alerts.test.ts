import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  alertSatisfied,
  isAvailable,
  type AlertProduct,
} from '../src/services/alerts/alert.service';
import {
  AlertsUsageError,
  formatAlertsSummary,
  parseAlertsArgs,
} from '../src/services/alerts/alerts-cli';
import type { EmailBrand } from '../src/services/notifications/render';
import { renderNotification } from '../src/services/notifications/templates';
import { createAlertSchema } from '../src/validators/alert.validator';

/**
 * Back-in-stock and price-drop alerts (Phase 20).
 *
 * The rules for when an alert is answered are pure functions of an alert and a
 * product, so they are tested here without a database. What makes two sweeps
 * racing over one product send one email — the conditional claim and the
 * unique message key — is the same machinery the reminder job relies on and is
 * exercised by the notification suite.
 */

const BRAND: EmailBrand = {
  appOrigin: 'https://zycart.example',
  supportEmail: null,
  accountUrl: 'https://zycart.example/account/orders',
};

function shoe(overrides: Partial<AlertProduct> = {}): AlertProduct {
  return {
    price: 4999,
    stock: 2,
    isActive: true,
    sizes: [
      { label: '8', inStock: true },
      { label: '9', inStock: false },
    ],
    variants: [
      { color: 'Black', size: '8', stock: 2 },
      { color: 'Black', size: '9', stock: 0 },
      { color: 'White', size: '9', stock: 0 },
    ],
    ...overrides,
  };
}

describe('when something is available', () => {
  it('waits for the exact combination on a product that tracks variants', () => {
    const product = shoe();
    assert.ok(isAvailable(product, { color: 'Black', size: '8' }));
    assert.ok(!isAvailable(product, { color: 'Black', size: '9' }));
  });

  it('takes anything in the product when no combination was chosen', () => {
    assert.ok(isAvailable(shoe(), {}));
    assert.ok(!isAvailable(shoe({ stock: 0, variants: [] }), {}));
  });

  it('uses the size flag on a product that holds one count', () => {
    const product = shoe({ variants: [] });
    assert.ok(isAvailable(product, { size: '8' }));
    assert.ok(!isAvailable(product, { size: '9' }));
  });

  it('is never true for a product that has been switched off', () => {
    assert.ok(!isAvailable(shoe({ isActive: false }), { color: 'Black', size: '8' }));
  });
});

describe('when an alert is answered', () => {
  it('answers a restock alert once its combination has units', () => {
    const alert = { type: 'BACK_IN_STOCK' as const, selectedColor: 'Black', selectedSize: '9' };
    assert.ok(!alertSatisfied(alert, shoe()));

    const restocked = shoe({
      stock: 3,
      variants: [
        { color: 'Black', size: '8', stock: 2 },
        { color: 'Black', size: '9', stock: 1 },
      ],
    });
    assert.ok(alertSatisfied(alert, restocked));
  });

  it('answers a price alert only below the price the customer saw', () => {
    const alert = { type: 'PRICE_DROP' as const, priceAtCreation: 4999 };
    assert.ok(!alertSatisfied(alert, shoe({ price: 4999 })));
    assert.ok(!alertSatisfied(alert, shoe({ price: 5499 })));
    assert.ok(alertSatisfied(alert, shoe({ price: 4499 })));
  });

  it('holds a price alert while the product cannot be bought', () => {
    const alert = { type: 'PRICE_DROP' as const, priceAtCreation: 4999 };
    assert.ok(!alertSatisfied(alert, shoe({ price: 3999, stock: 0, variants: [] })));
  });

  it('never answers a price alert that has no reference price', () => {
    assert.ok(!alertSatisfied({ type: 'PRICE_DROP', priceAtCreation: null }, shoe({ price: 1 })));
  });
});

describe('what a customer may ask for', () => {
  const productId = '507f1f77bcf86cd799439011';

  it('accepts a restock alert for one combination', () => {
    assert.ok(
      createAlertSchema.safeParse({
        productId,
        type: 'BACK_IN_STOCK',
        selectedColor: 'Black',
        selectedSize: '9',
      }).success,
    );
  });

  it('refuses a price alert about one colour or size', () => {
    assert.ok(
      !createAlertSchema.safeParse({ productId, type: 'PRICE_DROP', selectedSize: '9' }).success,
    );
  });

  it('refuses a price the customer chose, or any other extra field', () => {
    assert.ok(
      !createAlertSchema.safeParse({ productId, type: 'PRICE_DROP', priceAtCreation: 1 }).success,
    );
    assert.ok(
      !createAlertSchema.safeParse({ productId, type: 'BACK_IN_STOCK', userId: productId }).success,
    );
  });
});

describe('the alert messages', () => {
  it('says what is back, and links to it', () => {
    const { subject, html, text } = renderNotification(
      'BACK_IN_STOCK',
      {
        customerName: 'Asha',
        productName: 'Pegasus 41',
        productSlug: 'pegasus-41',
        variant: 'Black · Size 9',
      },
      BRAND,
    );

    assert.equal(subject, 'Back in stock: Pegasus 41');
    assert.ok(text.includes('Pegasus 41 in Black · Size 9'));
    assert.ok(html.includes('https://zycart.example/products/pegasus-41'));
    assert.ok(html.includes('https://zycart.example/account/alerts'));
    assert.ok(!text.includes('undefined'));
  });

  it('prints both prices, because the price is the news', () => {
    const { text } = renderNotification(
      'PRICE_DROP',
      {
        customerName: '',
        productName: 'Pegasus 41',
        productSlug: 'pegasus-41',
        previousPrice: 12_995,
        currentPrice: 9_995,
      },
      BRAND,
    );

    assert.ok(text.includes('₹9,995'));
    assert.ok(text.includes('₹12,995'));
    assert.ok(text.includes('₹3,000 less'));
    assert.ok(text.startsWith('Hi there,') || text.includes('Hi there,'));
  });

  it('refuses to render a "drop" that is not one', () => {
    assert.throws(() =>
      renderNotification(
        'PRICE_DROP',
        {
          customerName: 'Asha',
          productName: 'Pegasus 41',
          productSlug: 'pegasus-41',
          previousPrice: 9_995,
          currentPrice: 9_995,
        },
        BRAND,
      ),
    );
  });
});

describe('the alerts command', () => {
  it('has safe defaults and accepts a limit and a dry run', () => {
    assert.deepEqual(parseAlertsArgs([]), { limit: 200, dryRun: false, help: false });
    assert.deepEqual(parseAlertsArgs(['--dry-run', '--limit', '5']), {
      limit: 5,
      dryRun: true,
      help: false,
    });
  });

  it('refuses a limit that is not a sensible whole number', () => {
    assert.throws(() => parseAlertsArgs(['--limit', '0']), AlertsUsageError);
    assert.throws(() => parseAlertsArgs(['--limit', '5000']), AlertsUsageError);
    assert.throws(() => parseAlertsArgs(['--limit']), AlertsUsageError);
    assert.throws(() => parseAlertsArgs(['--force']), AlertsUsageError);
  });

  it('says what a dry run would have done', () => {
    const report = formatAlertsSummary({ dryRun: true, products: 3, queued: 4, skipped: 1 });
    assert.ok(report.includes('Dry run'));
    assert.ok(report.includes('would queue 4'));
  });
});
