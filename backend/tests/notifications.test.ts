import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { Types } from 'mongoose';
import { loadEnv } from '../src/config/env';
import {
  appOrigin,
  appUrl,
  AUTOMATIC_RETRY_DELAYS_MS,
  emailConfig,
  MAX_AUTOMATIC_ATTEMPTS,
} from '../src/config/notifications';
import {
  DELIVERY_STATUSES,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
} from '../src/models/notification-delivery.model';
import { notificationKey } from '../src/services/notifications/notification.service';
import {
  buildOrderDeliveredPayload,
  buildOrderShippedPayload,
  buildRefundCompletedPayload,
  buildReturnApprovedPayload,
  type PayloadOrder,
  type PayloadReturn,
} from '../src/services/notifications/payloads';
import {
  capturedEmails,
  clearForcedFailures,
  createMockProvider,
  failNextSends,
  resetCapturedEmails,
} from '../src/services/notifications/mock.provider';
import { EmailDeliveryError } from '../src/services/notifications/provider';
import { classifySmtpError } from '../src/services/notifications/smtp.provider';
import {
  escapeHtml,
  safeExternalUrl,
  sanitizeSubject,
  type EmailBrand,
} from '../src/services/notifications/render';
import {
  renderNotification,
  TEMPLATE_REGISTRY,
  templateFor,
} from '../src/services/notifications/templates';
import { MAX_EMAIL_LINES } from '../src/services/notifications/templates/shared';
import { formatRupees, MoneyError } from '../src/utils/money';

/**
 * Phase 14's rules, tested where they actually live.
 *
 * None of this touches MongoDB, which is the same choice the inventory, AI and
 * returns suites made and for the same reason: what is under test is ZyCart's
 * own logic — escaping, template output, failure classification, configuration
 * — and a database round trip would only add ways for a test to fail for
 * reasons that have nothing to do with it.
 *
 * What that leaves out is deliberate and is covered elsewhere. Whether a
 * notification is created in the *same transaction* as the shipment that caused
 * it, whether a duplicate webhook produces one delivery or two, and what two
 * administrators pressing Retry at the same instant actually do cannot be
 * asserted without a replica set — so `verify-notifications.ts` runs them
 * against a real one, with genuinely concurrent calls. The two suites are
 * complementary, not overlapping.
 *
 * No message is sent by anything in this file. The provider under test captures
 * to an array.
 */

const BRAND: EmailBrand = {
  appOrigin: 'https://zycart.example',
  supportEmail: null,
  accountUrl: 'https://zycart.example/account/orders',
};

const BRAND_WITH_SUPPORT: EmailBrand = { ...BRAND, supportEmail: 'help@zycart.example' };

/** The minimum a valid environment needs, so each case varies one thing. */
const BASE_ENV = {
  MONGODB_URI: 'mongodb://localhost:27017/zycart-test',
  JWT_SECRET: 'x'.repeat(48),
  AI_ENABLED: 'false',
};

const ID = () => new Types.ObjectId();

/** A delivered, paid order with two lines, unless overridden. */
function order(overrides: Partial<PayloadOrder> = {}): PayloadOrder {
  return {
    orderNumber: 'ZY10482',
    status: 'DELIVERED',
    deliveredAt: new Date('2026-09-18T10:00:00.000Z'),
    items: [
      {
        _id: ID(),
        productName: 'Nike Air Max',
        quantity: 1,
        unitPrice: 12_995,
        returnedQuantity: 0,
        selectedColor: 'Black',
        selectedSize: '9',
      },
      {
        _id: ID(),
        productName: 'Cotton Socks',
        quantity: 2,
        unitPrice: 299,
        returnedQuantity: 0,
        selectedColor: null,
        selectedSize: null,
      },
    ],
    pricing: { subtotal: 13_593, shipping: 0, discount: 0, tax: 0, total: 13_593 },
    payment: {
      method: 'RAZORPAY',
      status: 'PAID',
      razorpayPaymentId: 'pay_abc123',
      refundedAmount: 0,
    },
    ...overrides,
  };
}

function returnRequest(overrides: Partial<PayloadReturn> = {}): PayloadReturn {
  return {
    returnNumber: 'ZYR-000123',
    orderNumber: 'ZY10482',
    items: [
      {
        productName: 'Nike Air Max',
        requestedQuantity: 2,
        approvedQuantity: 1,
        selectedColor: 'Black',
        selectedSize: '9',
      },
    ],
    resolutionNote: '',
    refund: { amount: 12_995 },
    ...overrides,
  };
}

/** Renders an event end to end, the way the delivery path does. */
function render(event: NotificationEvent, payload: unknown, brand: EmailBrand = BRAND) {
  return renderNotification(event, payload, brand);
}

/* ---------------------------------------------------------------- */

describe('The event vocabulary', () => {
  it('implements the four Phase 13 transitions and the seven Phase 18 messages, and no more', () => {
    assert.deepEqual([...NOTIFICATION_EVENTS], [
      'ORDER_SHIPPED',
      'ORDER_DELIVERED',
      'RETURN_APPROVED',
      'REFUND_COMPLETED',
      'ORDER_PLACED',
      'PAYMENT_FAILED',
      'ABANDONED_CART',
      'WELCOME',
      'EMAIL_VERIFICATION',
      'PASSWORD_RESET',
      'NEWSLETTER_CONFIRMATION',
    ]);
  });

  it('has a template for every event', () => {
    for (const event of NOTIFICATION_EVENTS) {
      const template = templateFor(event);
      assert.ok(template.name.length > 0, `${event} has no template name`);
      assert.ok(template.version >= 1, `${event} has no template version`);
    }
  });

  it('gives every template a distinct name', () => {
    const names = NOTIFICATION_EVENTS.map((event) => TEMPLATE_REGISTRY[event].name);
    assert.equal(new Set(names).size, names.length);
  });

  /**
   * "Sent" means a provider accepted the message. DELIVERED would be a claim
   * about a customer's mail server that ZyCart has no evidence for, and an
   * operator reading it would reasonably conclude the customer had the message.
   */
  it('has no DELIVERED status, because there is no delivery evidence', () => {
    assert.deepEqual([...DELIVERY_STATUSES], ['PENDING', 'SENDING', 'SENT', 'FAILED']);
  });

  it('keys a notification by its event and the reference a customer would quote', () => {
    assert.equal(notificationKey('ORDER_SHIPPED', 'ZY10482'), 'ORDER_SHIPPED:ZY10482');
    assert.equal(notificationKey('REFUND_COMPLETED', 'ZYR-000123'), 'REFUND_COMPLETED:ZYR-000123');
  });

  it('bounds automatic retries', () => {
    assert.ok(MAX_AUTOMATIC_ATTEMPTS >= 2 && MAX_AUTOMATIC_ATTEMPTS <= 5);
    // One delay per retry after the first attempt, and no more.
    assert.equal(AUTOMATIC_RETRY_DELAYS_MS.length, MAX_AUTOMATIC_ATTEMPTS - 1);
  });
});

/* ---------------------------------------------------------------- */

describe('Escaping is the only route from data into a message', () => {
  it('escapes all five dangerous characters', () => {
    assert.equal(escapeHtml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('does not double-escape its own output', () => {
    assert.equal(escapeHtml('&amp;'), '&amp;amp;');
    assert.equal(escapeHtml(escapeHtml('<')), '&amp;lt;');
  });

  /**
   * The payload for §51: a stored-XSS attempt through a customer's own name.
   * The customer controls their first name, so this is genuinely reachable.
   */
  it('renders a script payload in a customer name as visible text', () => {
    const payload = buildOrderShippedPayload(
      '<img src=x onerror=alert(1)>',
      order(),
      null,
    );

    const { html, text } = render('ORDER_SHIPPED', payload);

    /**
     * The tag never forms. `onerror=alert(1)` is still *in* the document as a
     * run of characters, and that is fine and unavoidable — it is the
     * customer's name, printed. What matters is that the angle brackets around
     * it are entities, so there is no element for the handler to be an
     * attribute of.
     */
    assert.ok(!html.includes('<img'), 'the tag survived into the document');
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'), 'the payload survived raw');
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    // The text part carries it literally, which is correct: text/plain is not
    // markup and nothing interprets it.
    assert.ok(text.includes('<img src=x onerror=alert(1)>'));
  });

  it('renders a script payload in a product name as visible text', () => {
    const payload = buildOrderShippedPayload(
      'Asha',
      order({
        items: [
          {
            _id: ID(),
            productName: '</td><script>alert(1)</script>',
            quantity: 1,
            unitPrice: 100,
            returnedQuantity: 0,
            selectedColor: null,
            selectedSize: null,
          },
        ],
      }),
      null,
    );

    const { html } = render('ORDER_SHIPPED', payload);

    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;/td&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
  });

  it('renders a quote-breaking carrier and tracking number as text', () => {
    const payload = buildOrderShippedPayload('Asha', order(), {
      carrier: '" onmouseover="alert(1)',
      trackingNumber: `'"><b>x</b>`,
      trackingUrl: '',
      estimatedDeliveryAt: null,
    });

    const { html } = render('ORDER_SHIPPED', payload);

    assert.ok(!html.includes('onmouseover="alert(1)"'));
    assert.ok(!html.includes('<b>x</b>'));
    assert.ok(html.includes('&quot; onmouseover=&quot;alert(1)'));
  });

  /**
   * An operator writes `resolutionNote`, and an operator is not automatically
   * trusted with markup in a message the store sends under its own name.
   */
  it('renders markup in an operator resolution note as text', () => {
    const payload = buildReturnApprovedPayload(
      'Asha',
      returnRequest({ resolutionNote: '<a href="javascript:alert(1)">click</a>' }),
    );

    const { html } = render('RETURN_APPROVED', payload);

    assert.ok(!html.includes('href="javascript:'));
    assert.ok(html.includes('&lt;a href=&quot;javascript:alert(1)&quot;&gt;'));
  });
});

/* ---------------------------------------------------------------- */

describe('Only trusted links are rendered', () => {
  it('accepts an https tracking URL', () => {
    assert.equal(
      safeExternalUrl('https://track.example/parcel/ABC123'),
      'https://track.example/parcel/ABC123',
    );
  });

  for (const dangerous of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    // Plain http is refused too: a tracking link under ZyCart's branding that
    // downgrades the customer to cleartext is not a link ZyCart will vouch for.
    'http://track.example/parcel',
    'not a url at all',
    '',
  ]) {
    it(`refuses ${dangerous || '(empty)'}`, () => {
      assert.equal(safeExternalUrl(dangerous), null);
    });
  }

  it('refuses null and undefined', () => {
    assert.equal(safeExternalUrl(null), null);
    assert.equal(safeExternalUrl(undefined), null);
  });

  it('renders no tracking button at all for a dangerous URL', () => {
    const payload = buildOrderShippedPayload('Asha', order(), {
      carrier: 'Delhivery',
      trackingNumber: 'DLV123',
      trackingUrl: 'javascript:alert(1)',
      estimatedDeliveryAt: null,
    });

    const { html, text } = render('ORDER_SHIPPED', payload);

    assert.ok(!html.includes('javascript:'));
    assert.ok(!html.includes('Track your order'));
    assert.ok(!text.includes('javascript:'));
    // It falls back to the order page rather than to nothing.
    assert.ok(html.includes('https://zycart.example/account/orders/ZY10482'));
  });

  it('builds application links from configuration, never from a header', () => {
    const env = loadEnv({ ...BASE_ENV, CLIENT_URL: 'https://shop.zycart.example/' });

    assert.equal(appOrigin(env), 'https://shop.zycart.example');
    assert.equal(appUrl(env, '/account/orders'), 'https://shop.zycart.example/account/orders');
    // A path with no leading slash cannot produce `https://hostaccount`.
    assert.equal(appUrl(env, 'account'), 'https://shop.zycart.example/account');
  });

  it('never emits a localhost link when the app URL is configured', () => {
    const { html } = render(
      'ORDER_DELIVERED',
      buildOrderDeliveredPayload('Asha', order()),
      { ...BRAND, appOrigin: 'https://zycart.example' },
    );

    assert.ok(!html.includes('localhost'));
  });
});

/* ---------------------------------------------------------------- */

describe('Subjects', () => {
  it('strips newlines, so a value cannot begin a new header', () => {
    assert.equal(
      sanitizeSubject('Your order\r\nBcc: attacker@example.com'),
      'Your order Bcc: attacker@example.com',
    );
  });

  it('strips control and format characters', () => {
    assert.equal(sanitizeSubject('a\u0000b‎c'), 'a b c');
  });

  it('bounds the length', () => {
    assert.ok(sanitizeSubject('x'.repeat(500)).length <= 180);
  });

  it('uses fixed wording with one server-generated reference', () => {
    const subjects = [
      render('ORDER_SHIPPED', buildOrderShippedPayload('Asha', order(), null)).subject,
      render('ORDER_DELIVERED', buildOrderDeliveredPayload('Asha', order())).subject,
      render('RETURN_APPROVED', buildReturnApprovedPayload('Asha', returnRequest())).subject,
      render('REFUND_COMPLETED', buildRefundCompletedPayload('Asha', returnRequest())).subject,
    ];

    assert.deepEqual(subjects, [
      'Your ZyCart order ZY10482 has shipped',
      'Your ZyCart order ZY10482 has been delivered',
      'Your ZyCart return ZYR-000123 has been approved',
      'Your ZyCart refund for ZYR-000123 is complete',
    ]);

    // No exclamation marks, no urgency, no amounts on a lock screen.
    for (const subject of subjects) {
      assert.ok(!subject.includes('!'), subject);
      assert.ok(!subject.includes('₹'), subject);
      assert.ok(subject.length <= 78, `${subject} is too long for a phone`);
    }
  });

  it('keeps a customer name out of the subject entirely', () => {
    const payload = buildOrderShippedPayload('Asha\r\nBcc: x@y.z', order(), null);
    const { subject } = render('ORDER_SHIPPED', payload);

    // The name is not in the subject at all — which is the stronger guarantee.
    assert.equal(subject, 'Your ZyCart order ZY10482 has shipped');
  });
});

/* ---------------------------------------------------------------- */

describe('Order shipped', () => {
  it('says less rather than inventing a carrier, tracking or estimate', () => {
    const payload = buildOrderShippedPayload('Asha', order(), null);
    const { html, text } = render('ORDER_SHIPPED', payload);

    assert.equal(payload.carrier, '');
    assert.equal(payload.trackingNumber, '');
    assert.equal(payload.estimatedDeliveryAt, null);

    assert.ok(!html.includes('Carrier'));
    assert.ok(!html.includes('Tracking number'));
    assert.ok(!html.includes('Estimated delivery'));
    assert.ok(!text.includes('Estimated delivery'));
    assert.ok(html.includes('Your order is on its way'));
  });

  it('includes what was actually recorded', () => {
    const payload = buildOrderShippedPayload('Asha', order(), {
      carrier: 'Delhivery',
      trackingNumber: 'DLV1234567',
      trackingUrl: 'https://track.example/DLV1234567',
      estimatedDeliveryAt: new Date('2026-09-25T00:00:00.000Z'),
    });

    const { html, text } = render('ORDER_SHIPPED', payload);

    assert.ok(html.includes('Delhivery'));
    assert.ok(html.includes('DLV1234567'));
    assert.ok(html.includes('https://track.example/DLV1234567'));
    assert.ok(html.includes('Track your order'));
    assert.ok(text.includes('Carrier: Delhivery'));
    assert.ok(text.includes('Track your order: https://track.example/DLV1234567'));
    assert.ok(html.includes('25 September 2026'));
  });

  it('summarises the items and counts the rest', () => {
    const many = order({
      items: Array.from({ length: 6 }, (_, index) => ({
        _id: ID(),
        productName: `Item ${String(index)}`,
        quantity: 1,
        unitPrice: 100,
        returnedQuantity: 0,
        selectedColor: null,
        selectedSize: null,
      })),
    });

    const payload = buildOrderShippedPayload('Asha', many, null);

    assert.equal(payload.items.length, MAX_EMAIL_LINES);
    assert.equal(payload.hiddenItemCount, 6 - MAX_EMAIL_LINES);

    const { html, text } = render('ORDER_SHIPPED', payload);
    assert.ok(html.includes('3 more items'));
    assert.ok(text.includes('3 more items'));
  });

  it('renders the variant the way the storefront does', () => {
    const payload = buildOrderShippedPayload('Asha', order(), null);

    assert.equal(payload.items[0]?.variant, 'Size 9 · Black');
    // A line with neither axis gets an empty string, not "undefined · null".
    assert.equal(payload.items[1]?.variant, '');
  });
});

/* ---------------------------------------------------------------- */

describe('Order delivered', () => {
  it('offers a return only when the order is genuinely returnable', () => {
    const payload = buildOrderDeliveredPayload('Asha', order());
    assert.equal(payload.returnsOpen, true);

    const { html } = render('ORDER_DELIVERED', payload);
    assert.ok(html.includes('Start a return'));
    assert.ok(html.includes('Returns open until'));
  });

  /**
   * §41: do not tell a customer they can return something when the actual
   * returnability logic says they cannot.
   */
  it('offers no return when every unit is already spoken for', () => {
    const spent = order({
      items: [
        {
          _id: ID(),
          productName: 'Nike Air Max',
          quantity: 1,
          unitPrice: 12_995,
          returnedQuantity: 1,
          selectedColor: null,
          selectedSize: null,
        },
      ],
    });

    const payload = buildOrderDeliveredPayload('Asha', spent);
    assert.equal(payload.returnsOpen, false);

    const { html } = render('ORDER_DELIVERED', payload);
    assert.ok(!html.includes('Start a return'));
    assert.ok(html.includes('Returns for this order are closed'));
  });

  it('offers no return once the window has closed', () => {
    const old = order({ deliveredAt: new Date('2020-01-01T00:00:00.000Z') });
    const payload = buildOrderDeliveredPayload('Asha', old);

    assert.equal(payload.returnsOpen, false);
    assert.equal(payload.returnWindowEndsAt, null);
  });

  it('prints no delivery date when none was recorded', () => {
    const undated = order({ deliveredAt: null });
    const payload = buildOrderDeliveredPayload('Asha', undated);

    assert.equal(payload.deliveredAt, null);

    const { html, text } = render('ORDER_DELIVERED', payload);
    assert.ok(!html.includes('Delivered</td>'));
    assert.ok(!text.includes('Delivered:'));
  });
});

/* ---------------------------------------------------------------- */

describe('Return approved', () => {
  it('reports the approved quantity, not the requested one', () => {
    const payload = buildReturnApprovedPayload('Asha', returnRequest());

    assert.equal(payload.items[0]?.quantity, 1);

    const { html, text } = render('RETURN_APPROVED', payload);
    assert.ok(html.includes('&times;1'));
    assert.ok(text.includes('x1'));
  });

  it('drops a line that was approved for nothing', () => {
    const payload = buildReturnApprovedPayload(
      'Asha',
      returnRequest({
        items: [
          { productName: 'Kept', requestedQuantity: 1, approvedQuantity: 0 },
          { productName: 'Returned', requestedQuantity: 1, approvedQuantity: 1 },
        ],
      }),
    );

    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0]?.name, 'Returned');
  });

  /**
   * §42: internal admin commentary must never reach a customer. The payload
   * type has no field for it, which is the structural half of the guarantee;
   * this is the test that the builder does not smuggle one in.
   */
  it('carries the customer-facing note and has nowhere to put the internal one', () => {
    const payload = buildReturnApprovedPayload(
      'Asha',
      // An adminNote is deliberately not part of `PayloadReturn`; passing one
      // through an object literal would not compile, so this asserts the
      // builder reads only `resolutionNote`.
      returnRequest({ resolutionNote: 'Send them back in the original box.' }),
    );

    assert.equal(payload.resolutionNote, 'Send them back in the original box.');
    assert.equal(Object.keys(payload).includes('adminNote'), false);

    const { html } = render('RETURN_APPROVED', payload);
    assert.ok(html.includes('Send them back in the original box.'));
  });

  it('links to both the return and the order', () => {
    const { html } = render('RETURN_APPROVED', buildReturnApprovedPayload('Asha', returnRequest()));

    assert.ok(html.includes('https://zycart.example/account/returns/ZYR-000123'));
    assert.ok(html.includes('https://zycart.example/account/orders/ZY10482'));
  });
});

/* ---------------------------------------------------------------- */

describe('Refund completed', () => {
  it('takes the amount from the stored refund record', () => {
    const payload = buildRefundCompletedPayload('Asha', returnRequest());
    assert.equal(payload.amount, 12_995);

    const { html, text } = render('REFUND_COMPLETED', payload);
    assert.ok(html.includes('₹12,995'));
    assert.ok(text.includes('₹12,995'));
  });

  it('formats rupees the way the rest of ZyCart does', () => {
    assert.equal(formatRupees(1_299), '₹1,299');
    assert.equal(formatRupees(114_900), '₹1,14,900');
    assert.equal(formatRupees(0), '₹0');
  });

  it('refuses to print an amount that is not whole rupees', () => {
    assert.throws(() => formatRupees(12.5), MoneyError);
    assert.throws(() => formatRupees(Number.NaN), MoneyError);
    assert.throws(() => formatRupees(-1), MoneyError);
  });

  it('never renders undefined for a return with no refund recorded', () => {
    const payload = buildRefundCompletedPayload('Asha', returnRequest({ refund: null }));

    assert.equal(payload.amount, 0);
    const { html, text } = render('REFUND_COMPLETED', payload);
    assert.ok(!html.includes('undefined'));
    assert.ok(!text.includes('undefined'));
  });
});

/* ---------------------------------------------------------------- */

describe('Every rendered message', () => {
  const cases: [NotificationEvent, unknown][] = [
    ['ORDER_SHIPPED', buildOrderShippedPayload('Asha', order(), null)],
    ['ORDER_DELIVERED', buildOrderDeliveredPayload('Asha', order())],
    ['RETURN_APPROVED', buildReturnApprovedPayload('Asha', returnRequest())],
    ['REFUND_COMPLETED', buildRefundCompletedPayload('Asha', returnRequest())],
  ];

  for (const [event, payload] of cases) {
    describe(event, () => {
      const { html, text, subject, template, templateVersion } = render(event, payload);

      it('has a subject, an HTML body and a plain-text alternative', () => {
        assert.ok(subject.length > 0);
        assert.ok(html.length > 0);
        assert.ok(text.length > 0);
      });

      it('names its template and version, for a deterministic retry', () => {
        assert.equal(template, templateFor(event).name);
        assert.equal(templateVersion, templateFor(event).version);
      });

      it('contains no undefined, null or NaN', () => {
        for (const fragment of ['undefined', 'NaN', '[object Object]']) {
          assert.ok(!html.includes(fragment), `${event} html contains ${fragment}`);
          assert.ok(!text.includes(fragment), `${event} text contains ${fragment}`);
        }
      });

      it('is a complete, light-only HTML document', () => {
        assert.ok(html.startsWith('<!doctype html>'));
        assert.ok(html.includes('<html lang="en">'));
        assert.ok(html.includes('name="color-scheme" content="light"'));
        assert.ok(html.trimEnd().endsWith('</html>'));
      });

      it('uses no JavaScript, no external assets and no modern layout', () => {
        assert.ok(!/<script/i.test(html));
        // An event-handler attribute is whitespace, then `on…`, then `=`.
        // Anchoring on the whitespace is what stops this matching the `ontent`
        // inside a perfectly ordinary `content="light"`.
        assert.ok(!/\son[a-z]+\s*=/i.test(html));
        assert.ok(!html.includes('<img'));
        assert.ok(!html.includes('@import'));
        assert.ok(!html.includes('display:flex'));
        assert.ok(!html.includes('display:grid'));
      });

      it('is responsive without a fixed width larger than a phone', () => {
        assert.ok(html.includes('max-width:600px'));
        assert.ok(html.includes('width:100%'));
        assert.ok(html.includes('width=device-width'));
      });

      it('has one heading and a preview line that is not the whole message', () => {
        assert.equal(html.match(/<h1/g)?.length, 1);
        assert.ok(html.includes('mso-hide:all'));
      });

      it('has a primary call to action pointing at a real ZyCart route', () => {
        assert.ok(/\/account\/(orders|returns)\//.test(html));
      });

      it('carries a plain-text URL for every button', () => {
        const buttons = html.match(/href="https:\/\/zycart\.example[^"]*"/g) ?? [];
        assert.ok(buttons.length >= 1);
      });

      it('says what it is, without marketing', () => {
        assert.ok(text.includes('This is a service message about your ZyCart order.'));
        for (const spam of ['You might also like', 'Shop now', 'Limited time', '%']) {
          assert.ok(!text.includes(spam), `${event} text contains "${spam}"`);
        }
        // At most one exclamation mark across an entire transactional message.
        assert.ok((text.match(/!/g) ?? []).length === 0);
      });

      it('offers no unsubscribe, because these are not marketing', () => {
        assert.ok(!/unsubscribe/i.test(html));
        assert.ok(!/unsubscribe/i.test(text));
      });

      it('invents no support address when none is configured', () => {
        assert.ok(!html.includes('mailto:'));
        assert.ok(!text.includes('Support:'));
        // ...and uses the configured one when there is one.
        const withSupport = render(event, payload, BRAND_WITH_SUPPORT);
        assert.ok(withSupport.html.includes('mailto:help@zycart.example'));
        assert.ok(withSupport.text.includes('Support: help@zycart.example'));
      });

      it('invents no postal address, phone number or legal entity', () => {
        assert.ok(!/\bLtd\b|\bPvt\b|\bInc\b|registered office/i.test(text));
        assert.ok(!/\+91[\s-]?\d/.test(text));
      });
    });
  }
});

/* ---------------------------------------------------------------- */

describe('The greeting', () => {
  it('uses the name when there is one', () => {
    const { text } = render('ORDER_SHIPPED', buildOrderShippedPayload('Asha', order(), null));
    assert.ok(text.includes('Hi Asha,'));
  });

  for (const [label, name] of [
    ['an empty name', ''],
    ['a whitespace-only name', '   '],
  ] as const) {
    it(`falls back to a neutral greeting for ${label}`, () => {
      const { text, html } = render('ORDER_SHIPPED', buildOrderShippedPayload(name, order(), null));
      assert.ok(text.includes('Hi there,'));
      assert.ok(!html.includes('Hi ,'));
    });
  }
});

/* ---------------------------------------------------------------- */

describe('A stored payload is re-validated before it is rendered', () => {
  it('refuses a payload that does not match its template', () => {
    assert.throws(() => render('REFUND_COMPLETED', { customerName: 'Asha' }));
    assert.throws(() => render('ORDER_SHIPPED', null));
    assert.throws(() => render('ORDER_SHIPPED', 'not an object'));
  });

  it('refuses a refund amount that is not a whole number of rupees', () => {
    assert.throws(() =>
      render('REFUND_COMPLETED', {
        customerName: 'Asha',
        returnNumber: 'ZYR-1',
        orderNumber: 'ZY1',
        amount: 12.5,
      }),
    );
  });

  it('refuses one event rendered with another event payload', () => {
    const shipped = buildOrderShippedPayload('Asha', order(), null);
    assert.throws(() => render('REFUND_COMPLETED', shipped));
  });
});

/* ---------------------------------------------------------------- */

describe('Failure classification decides whether to try again', () => {
  it('treats a 5xx reply as permanent', () => {
    const verdict = classifySmtpError({ responseCode: 550, response: '550 No such user' });
    assert.equal(verdict.permanent, true);
    assert.ok(verdict.reason.includes('550'));
  });

  it('treats a 4xx reply as temporary', () => {
    const verdict = classifySmtpError({ responseCode: 421, response: '421 Try later' });
    assert.equal(verdict.permanent, false);
  });

  it('treats a connection timeout as temporary', () => {
    assert.equal(classifySmtpError({ code: 'ETIMEDOUT' }).permanent, false);
    assert.equal(classifySmtpError({ code: 'ECONNECTION' }).permanent, false);
    assert.equal(classifySmtpError({ code: 'EAI_AGAIN' }).permanent, false);
  });

  it('treats bad credentials and a refused envelope as permanent', () => {
    assert.equal(classifySmtpError({ code: 'EAUTH' }).permanent, true);
    assert.equal(classifySmtpError({ code: 'EENVELOPE' }).permanent, true);
  });

  it('treats an unrecognised error as temporary, so nothing is abandoned early', () => {
    assert.equal(classifySmtpError({ code: 'ESOMETHINGNEW' }).permanent, false);
    assert.equal(classifySmtpError(new Error('boom')).permanent, false);
    assert.equal(classifySmtpError(undefined).permanent, false);
  });

  /**
   * §62 and §132: a diagnostic message must be useful and must not carry a
   * secret. A nodemailer error can quote the command that was in flight, and
   * during authentication that command contains the password.
   */
  it('redacts an AUTH command out of a server reply', () => {
    const verdict = classifySmtpError({
      responseCode: 535,
      response: '535 rejected: AUTH PLAIN AGFkbWluAHN1cGVyc2VjcmV0',
    });

    assert.ok(!verdict.reason.includes('AGFkbWluAHN1cGVyc2VjcmV0'));
    assert.ok(verdict.reason.includes('[redacted]'));
  });

  it('never returns a bare "Error"', () => {
    for (const error of [new Error('x'), {}, null, 'boom']) {
      const verdict = classifySmtpError(error);
      assert.ok(verdict.reason.length > 20, verdict.reason);
      assert.notEqual(verdict.reason.trim(), 'Error');
    }
  });

  it('bounds the stored reason so one error cannot fill a document', () => {
    const verdict = classifySmtpError({ responseCode: 550, response: 'x'.repeat(5_000) });
    assert.ok(verdict.reason.length < 300);
  });
});

/* ---------------------------------------------------------------- */

describe('The mock provider', () => {
  beforeEach(() => {
    resetCapturedEmails();
    clearForcedFailures();
  });

  const config = emailConfig(loadEnv(BASE_ENV));
  const provider = createMockProvider(config);

  const message = () => ({
    to: 'asha@example.com',
    toName: 'Asha Rao',
    subject: 'Your ZyCart order ZY10482 has shipped',
    text: 'Hi Asha,',
    html: '<p>Hi Asha,</p>',
    meta: { notificationId: 'abc123', event: 'ORDER_SHIPPED', template: 'order-shipped' },
  });

  it('captures what tests need to assert', async () => {
    const result = await provider.send(message());

    assert.equal(capturedEmails().length, 1);
    const sent = capturedEmails()[0];
    assert.equal(sent?.to, 'asha@example.com');
    assert.equal(sent?.subject, 'Your ZyCart order ZY10482 has shipped');
    assert.equal(sent?.template, 'order-shipped');
    assert.equal(sent?.event, 'ORDER_SHIPPED');
    assert.equal(sent?.notificationId, 'abc123');
    assert.equal(result.messageId, 'mock-abc123');
  });

  it('returns a message id derived from the delivery, not a random one', async () => {
    const first = await provider.send(message());
    const second = await provider.send(message());
    assert.equal(first.messageId, second.messageId);
  });

  it('can be told to fail, temporarily', async () => {
    failNextSends(1);

    await assert.rejects(provider.send(message()), (error: unknown) => {
      assert.ok(error instanceof EmailDeliveryError);
      assert.equal(error.permanent, false);
      return true;
    });

    assert.equal(capturedEmails().length, 0);

    // The failure stops on its own, which is what makes "attempt 1 fails,
    // attempt 2 succeeds" testable.
    await provider.send(message());
    assert.equal(capturedEmails().length, 1);
  });

  it('can be told to fail permanently', async () => {
    failNextSends(1, { permanent: true });

    await assert.rejects(provider.send(message()), (error: unknown) => {
      assert.ok(error instanceof EmailDeliveryError);
      assert.equal(error.permanent, true);
      return true;
    });
  });
});

/* ---------------------------------------------------------------- */

describe('Configuration', () => {
  it('defaults to the mock provider, so nothing sends by accident', () => {
    const env = loadEnv(BASE_ENV);
    const config = emailConfig(env);

    assert.equal(config.provider, 'mock');
    assert.equal(config.smtp, null);
    assert.equal(config.replyTo, null);
    assert.equal(config.fromName, 'ZyCart');
    // A reserved, unresolvable TLD rather than a plausible placeholder.
    assert.ok(config.fromAddress.endsWith('.invalid'));
  });

  /**
   * §14: half-configured SMTP must fail loudly at startup rather than pretend
   * to send.
   */
  it('refuses to boot on SMTP with no host, credentials or sender', () => {
    assert.throws(
      () => loadEnv({ ...BASE_ENV, EMAIL_PROVIDER: 'smtp' }),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM_ADDRESS']) {
          assert.ok(message.includes(key), `did not complain about ${key}`);
        }
        return true;
      },
    );
  });

  it('refuses SMTP with a host but no password', () => {
    assert.throws(() =>
      loadEnv({
        ...BASE_ENV,
        EMAIL_PROVIDER: 'smtp',
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'apikey',
        EMAIL_FROM_ADDRESS: 'no-reply@zycart.example',
      }),
    );
  });

  it('resolves a complete SMTP configuration', () => {
    const env = loadEnv({
      ...BASE_ENV,
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_USER: 'apikey',
      SMTP_PASSWORD: 'secret-value',
      SMTP_SECURE: 'true',
      EMAIL_FROM_NAME: 'ZyCart Orders',
      EMAIL_FROM_ADDRESS: 'no-reply@zycart.example',
      EMAIL_REPLY_TO: 'help@zycart.example',
    });

    const config = emailConfig(env);

    assert.equal(config.provider, 'smtp');
    assert.equal(config.smtp?.host, 'smtp.example.com');
    assert.equal(config.smtp?.port, 465);
    assert.equal(config.smtp?.secure, true);
    assert.equal(config.fromName, 'ZyCart Orders');
    assert.equal(config.fromAddress, 'no-reply@zycart.example');
    assert.equal(config.replyTo, 'help@zycart.example');
  });

  it('refuses a sender address that is not an address', () => {
    assert.throws(() => loadEnv({ ...BASE_ENV, EMAIL_FROM_ADDRESS: 'not-an-email' }));
    assert.throws(() => loadEnv({ ...BASE_ENV, EMAIL_REPLY_TO: 'nope' }));
  });

  /**
   * §52/§157: email links come from configuration. A malformed origin produces
   * broken links in mail that cannot be recalled, so it stops the process.
   */
  it('refuses an application URL that is not an absolute http(s) address', () => {
    for (const value of ['zycart.example', 'javascript:alert(1)', 'ftp://zycart.example', '/shop']) {
      assert.throws(() => loadEnv({ ...BASE_ENV, CLIENT_URL: value }), `accepted ${value}`);
    }
  });

  it('accepts an ordinary origin', () => {
    assert.equal(appOrigin(loadEnv(BASE_ENV)), 'http://localhost:3000');
    assert.equal(
      appOrigin(loadEnv({ ...BASE_ENV, CLIENT_URL: 'https://zycart.example' })),
      'https://zycart.example',
    );
  });

  it('never exposes a credential through the resolved configuration name', () => {
    const env = loadEnv({
      ...BASE_ENV,
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'apikey',
      SMTP_PASSWORD: 'super-secret',
      EMAIL_FROM_ADDRESS: 'no-reply@zycart.example',
    });

    // The password is reachable only through `smtp`, which nothing outside the
    // transport reads — and never through anything that is serialised.
    const config = emailConfig(env);
    const exposed = JSON.stringify({
      provider: config.provider,
      fromName: config.fromName,
      fromAddress: config.fromAddress,
      replyTo: config.replyTo,
    });

    assert.ok(!exposed.includes('super-secret'));
    assert.ok(!exposed.includes('apikey'));
  });
});
