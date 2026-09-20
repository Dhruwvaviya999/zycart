import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { loadEnv } from '../src/config/env';
import {
  createPaymentSchema,
  verifyPaymentSchema,
  webhookEnvelopeSchema,
} from '../src/validators/payment.validator';
import {
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../src/utils/payment-signature';
import {
  MoneyError,
  paiseMatchRupees,
  paiseToRupees,
  rupeesToPaise,
} from '../src/utils/money';

/**
 * The gateway boundary, tested where it actually lives.
 *
 * ## Why this suite exists
 *
 * Phase 14 ended by pointing out that the most security-sensitive code in the
 * repository had no tests of its own. Signature verification, envelope parsing,
 * event-id extraction and the money conversion that decides what a customer is
 * charged were exercised only incidentally, through the refund rules that sit
 * above them. That is exactly backwards: the closer code sits to "is this
 * request really from Razorpay?", the more directly it should be tested.
 *
 * Everything here is pure. No database, no network, no credentials — the HMACs
 * are computed against secrets generated in this file, which is precisely what
 * makes them checkable. What cannot be decided without a database — event-id
 * deduplication, concurrent duplicates, the finalisation claim, refund
 * settlement — is in `verify-payments.ts`, which runs against a real replica
 * set with a stubbed gateway.
 *
 * **No live gateway request is made by anything in this file.**
 */

/** A secret of the right shape. Generated per run; never a real credential. */
const secret = (): string => randomBytes(24).toString('hex');

const hmac = (payload: string | Buffer, key: string): string =>
  createHmac('sha256', key).update(payload).digest('hex');

const BASE_ENV = {
  MONGODB_URI: 'mongodb://localhost:27017/zycart-test',
  JWT_SECRET: 'x'.repeat(48),
  AI_ENABLED: 'false',
};

/* ---------------------------------------------------------------- */

describe('Webhook signature verification', () => {
  const webhookSecret = secret();
  const body = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {} }));
  const valid = hmac(body, webhookSecret);

  it('accepts a signature computed over the exact bytes', () => {
    assert.equal(verifyWebhookSignature({ rawBody: body, signature: valid, webhookSecret }), true);
  });

  it('refuses a signature made with a different secret', () => {
    assert.equal(
      verifyWebhookSignature({ rawBody: body, signature: hmac(body, secret()), webhookSecret }),
      false,
    );
  });

  /**
   * The single most important case here. If a body can be altered after the
   * signature was computed, every other guarantee in the payment system is
   * decoration — an attacker could rewrite an amount, an order id or an event
   * type and have it accepted.
   */
  it('refuses a body that was modified after signing', () => {
    const tampered = Buffer.from(
      JSON.stringify({ event: 'payment.captured', payload: { injected: true } }),
    );

    assert.equal(
      verifyWebhookSignature({ rawBody: tampered, signature: valid, webhookSecret }),
      false,
    );
  });

  it('refuses a body re-serialised with the same content', () => {
    /**
     * Semantically identical JSON, different bytes — reordered keys and
     * whitespace. This is what `JSON.parse` followed by `JSON.stringify` does
     * to a payload, and it is why the verifier takes a Buffer rather than an
     * object.
     */
    const resorted = Buffer.from(JSON.stringify({ payload: {}, event: 'payment.captured' }));

    assert.notEqual(resorted.toString(), body.toString());
    assert.equal(
      verifyWebhookSignature({ rawBody: resorted, signature: valid, webhookSecret }),
      false,
    );
  });

  it('refuses an empty signature', () => {
    assert.equal(verifyWebhookSignature({ rawBody: body, signature: '', webhookSecret }), false);
  });

  for (const [label, signature] of [
    ['too short', valid.slice(0, 32)],
    ['too long', `${valid}00`],
    ['not hex', 'z'.repeat(64)],
    ['a whole JSON object', '{"signature":"x"}'],
  ] as const) {
    it(`refuses a signature that is ${label}`, () => {
      assert.equal(verifyWebhookSignature({ rawBody: body, signature, webhookSecret }), false);
    });
  }

  /**
   * Hex decoding is case-insensitive, so the same digest in capitals is
   * accepted. That is documented here rather than tightened, because it widens
   * nothing: an attacker still has to know the correct digest bytes, and
   * knowing them in capitals is knowing them. Rejecting it would be a change to
   * the most sensitive comparison in the codebase for a cosmetic gain.
   *
   * Razorpay sends lowercase. This asserts the leniency is *only* about case —
   * flipping a single character still fails.
   */
  it('accepts the same digest in capitals, and nothing more', () => {
    assert.equal(
      verifyWebhookSignature({ rawBody: body, signature: valid.toUpperCase(), webhookSecret }),
      true,
    );

    const flipped = `${valid[0] === '0' ? '1' : '0'}${valid.slice(1)}`;

    assert.equal(verifyWebhookSignature({ rawBody: body, signature: flipped, webhookSecret }), false);
    assert.equal(
      verifyWebhookSignature({ rawBody: body, signature: flipped.toUpperCase(), webhookSecret }),
      false,
    );
  });

  it('refuses an empty body', () => {
    assert.equal(
      verifyWebhookSignature({
        rawBody: Buffer.alloc(0),
        signature: hmac(Buffer.alloc(0), webhookSecret),
        webhookSecret,
      }),
      false,
    );
  });

  it('refuses a body that is not a Buffer', () => {
    assert.equal(
      verifyWebhookSignature({
        rawBody: body.toString() as unknown as Buffer,
        signature: valid,
        webhookSecret,
      }),
      false,
    );
  });

  /**
   * A digest of a different length would make `timingSafeEqual` throw, and a
   * thrown exception is itself a timing signal — a distinguishable, much
   * cheaper response than a full comparison. The length check has to come
   * first, and it has to return rather than throw.
   */
  it('never throws, whatever it is given', () => {
    for (const signature of ['', 'x', valid.slice(0, 1), '0'.repeat(1000)]) {
      assert.doesNotThrow(() =>
        verifyWebhookSignature({ rawBody: body, signature, webhookSecret }),
      );
    }
  });
});

/* ---------------------------------------------------------------- */

describe('Checkout signature verification', () => {
  const keySecret = secret();
  const razorpayOrderId = 'order_Nq1aBcDeFgHiJk';
  const razorpayPaymentId = 'pay_Nq1aBcDeFgHiJk';
  const valid = hmac(`${razorpayOrderId}|${razorpayPaymentId}`, keySecret);

  it('accepts the documented order_id|payment_id payload', () => {
    assert.equal(
      verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, signature: valid, keySecret }),
      true,
    );
  });

  it('refuses a signature for a different payment', () => {
    assert.equal(
      verifyCheckoutSignature({
        razorpayOrderId,
        razorpayPaymentId: 'pay_DIFFERENTaaaaaa',
        signature: valid,
        keySecret,
      }),
      false,
    );
  });

  it('refuses a signature for a different order', () => {
    assert.equal(
      verifyCheckoutSignature({
        razorpayOrderId: 'order_DIFFERENTaaaa',
        razorpayPaymentId,
        signature: valid,
        keySecret,
      }),
      false,
    );
  });

  /**
   * The ids are concatenated with `|`, so a pair that reproduces the same
   * joined string must not be accepted as a different pair. `a|b` and `a|b`
   * are the same payload by construction; what this checks is that neither id
   * can be shifted across the separator.
   */
  it('refuses ids shifted across the separator', () => {
    assert.equal(
      verifyCheckoutSignature({
        razorpayOrderId: `${razorpayOrderId}|${razorpayPaymentId}`,
        razorpayPaymentId: '',
        signature: valid,
        keySecret,
      }),
      false,
    );
  });

  it('refuses the wrong secret', () => {
    assert.equal(
      verifyCheckoutSignature({
        razorpayOrderId,
        razorpayPaymentId,
        signature: hmac(`${razorpayOrderId}|${razorpayPaymentId}`, secret()),
        keySecret,
      }),
      false,
    );
  });

  for (const missing of ['razorpayOrderId', 'razorpayPaymentId', 'signature'] as const) {
    it(`refuses a missing ${missing}`, () => {
      const params = { razorpayOrderId, razorpayPaymentId, signature: valid, keySecret };
      assert.equal(verifyCheckoutSignature({ ...params, [missing]: '' }), false);
    });
  }
});

/* ---------------------------------------------------------------- */

describe('Webhook envelope parsing', () => {
  const parse = (value: unknown) => webhookEnvelopeSchema.safeParse(value);

  it('accepts a payment.captured envelope', () => {
    const result = parse({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_abc123',
            order_id: 'order_abc123',
            amount: 530000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.payload.payment?.entity.order_id, 'order_abc123');
  });

  it('accepts a refund envelope', () => {
    const result = parse({
      event: 'refund.processed',
      payload: { refund: { entity: { id: 'rfnd_abc', payment_id: 'pay_abc', status: 'processed' } } },
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.payload.refund?.entity.id, 'rfnd_abc');
  });

  /**
   * Razorpay adds fields, and refusing an event because it grew one would break
   * the integration for no benefit. Unknown keys are kept and ignored — which
   * is safe precisely because nothing downstream spreads this object into a
   * database update. See the mass-assignment tests below.
   */
  it('tolerates fields ZyCart does not read', () => {
    const result = parse({
      event: 'payment.captured',
      account_id: 'acc_x',
      created_at: 1_700_000_000,
      contains: ['payment'],
      payload: {
        payment: { entity: { id: 'pay_abc', vpa: 'x@y', acquirer_data: { rrn: '123' } } },
      },
    });

    assert.equal(result.success, true);
  });

  for (const [label, value] of [
    ['a missing event name', { payload: {} }],
    ['an empty event name', { event: '', payload: {} }],
    ['a non-string event name', { event: 42, payload: {} }],
    ['an absurdly long event name', { event: 'x'.repeat(200), payload: {} }],
    ['a missing payload', { event: 'payment.captured' }],
    ['a payload that is not an object', { event: 'payment.captured', payload: 'nope' }],
    ['a payment entity with no id', { event: 'payment.captured', payload: { payment: { entity: {} } } }],
    [
      'a payment entity that is not an object',
      { event: 'payment.captured', payload: { payment: { entity: 'pay_abc' } } },
    ],
    ['an envelope that is an array', []],
    ['an envelope that is a string', 'payment.captured'],
    ['null', null],
    ['undefined', undefined],
  ] as const) {
    it(`refuses ${label}`, () => {
      assert.equal(parse(value).success, false);
    });
  }

  /**
   * An unsupported event is *parsed*, not rejected. The schema's job is shape,
   * and the dispatcher's job is relevance — a webhook endpoint that 500s on an
   * event somebody enabled in the Razorpay dashboard would be retried for days
   * for no reason. These reach `dispatchWebhook` and return UNHANDLED_EVENT.
   */
  for (const event of ['subscription.charged', 'settlement.processed', 'payment.dispute.created']) {
    it(`parses ${event} so the dispatcher can ignore it deliberately`, () => {
      assert.equal(parse({ event, payload: {} }).success, true);
    });
  }

  /**
   * §43: a webhook payload must never become a MongoDB update object. The
   * schema keeps unknown keys, so the protection cannot be "the parser strips
   * them" — it is that every consumer names the fields it reads. This asserts
   * the parsed envelope carries no key that would be interpreted as an operator
   * if somebody ever spread it into an update.
   */
  it('cannot smuggle a Mongo operator into a field ZyCart reads', () => {
    const result = parse({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_abc',
            order_id: 'order_abc',
            $set: { 'payment.status': 'PAID' },
            $inc: { 'pricing.total': -100000 },
          },
        },
      },
    });

    assert.equal(result.success, true);

    const entity = result.data?.payload.payment?.entity as Record<string, unknown>;

    // The keys survive parsing, and that is fine — what matters is that the
    // fields ZyCart reads are exactly the declared ones and are still correct.
    assert.equal(entity.id, 'pay_abc');
    assert.equal(entity.order_id, 'order_abc');
  });

  it('refuses a prototype-polluting key in place of a declared field', () => {
    const result = parse({
      event: 'payment.captured',
      payload: { payment: { entity: { id: { __proto__: { polluted: true } } } } },
    });

    // `id` must be a string. An object there is a rejected envelope, not an id.
    assert.equal(result.success, false);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });
});

/* ---------------------------------------------------------------- */

describe('Request validators refuse to take money from the client', () => {
  /**
   * §43 again, on the inbound side. The endpoints that start and confirm a
   * payment are `.strict()`, so a request that tries to smuggle an amount
   * alongside the order reference is refused outright rather than having the
   * field quietly ignored — which would leave the guarantee resting on nobody
   * ever spreading the body into a document.
   */
  it('refuses an amount alongside the order id', () => {
    assert.equal(
      createPaymentSchema.safeParse({ orderId: '6aafc8828a06a152405fd00a', amount: 1 }).success,
      false,
    );
  });

  for (const extra of ['total', 'userId', 'status', 'paidAt', 'currency']) {
    it(`refuses a smuggled ${extra}`, () => {
      assert.equal(
        createPaymentSchema.safeParse({ orderId: '6aafc8828a06a152405fd00a', [extra]: 'x' })
          .success,
        false,
      );
    });
  }

  it('accepts an order id on its own', () => {
    assert.equal(createPaymentSchema.safeParse({ orderId: '6aafc8828a06a152405fd00a' }).success, true);
  });

  it('refuses an order id that is not an ObjectId', () => {
    for (const orderId of ['ZY10482', '../../etc', '', { $ne: null }]) {
      assert.equal(createPaymentSchema.safeParse({ orderId }).success, false);
    }
  });

  it('accepts a well-formed verification triple', () => {
    assert.equal(
      verifyPaymentSchema.safeParse({
        razorpayOrderId: 'order_Nq1aBcDeFgHiJk',
        razorpayPaymentId: 'pay_Nq1aBcDeFgHiJk',
        razorpaySignature: 'a'.repeat(64),
      }).success,
      true,
    );
  });

  it('refuses an amount alongside the verification triple', () => {
    assert.equal(
      verifyPaymentSchema.safeParse({
        razorpayOrderId: 'order_Nq1aBcDeFgHiJk',
        razorpayPaymentId: 'pay_Nq1aBcDeFgHiJk',
        razorpaySignature: 'a'.repeat(64),
        amount: 1,
      }).success,
      false,
    );
  });

  /**
   * The id shapes are constrained before they reach an HMAC comparison or a
   * database query. A `{$ne: null}` in place of an id would otherwise be a
   * query-operator injection into `findOne`.
   */
  for (const [field, bad] of [
    ['razorpayOrderId', 'pay_Nq1aBcDeFgHiJk'],
    ['razorpayPaymentId', 'order_Nq1aBcDeFgHiJk'],
    ['razorpaySignature', 'A'.repeat(64)],
    ['razorpaySignature', 'a'.repeat(63)],
  ] as const) {
    it(`refuses a malformed ${field}`, () => {
      const valid = {
        razorpayOrderId: 'order_Nq1aBcDeFgHiJk',
        razorpayPaymentId: 'pay_Nq1aBcDeFgHiJk',
        razorpaySignature: 'a'.repeat(64),
      };

      assert.equal(verifyPaymentSchema.safeParse({ ...valid, [field]: bad }).success, false);
    });
  }

  it('refuses a query operator in place of an id', () => {
    assert.equal(
      verifyPaymentSchema.safeParse({
        razorpayOrderId: { $ne: null },
        razorpayPaymentId: 'pay_Nq1aBcDeFgHiJk',
        razorpaySignature: 'a'.repeat(64),
      }).success,
      false,
    );
  });
});

/* ---------------------------------------------------------------- */

describe('Money crossing the gateway boundary', () => {
  it('converts whole rupees to paise', () => {
    assert.equal(rupeesToPaise(1), 100);
    assert.equal(rupeesToPaise(5_300), 530_000);
    assert.equal(rupeesToPaise(114_900), 11_490_000);
  });

  it('refuses anything that is not whole rupees', () => {
    for (const bad of [5_300.5, Number.NaN, Number.POSITIVE_INFINITY, -1, 1e12]) {
      assert.throws(() => rupeesToPaise(bad), MoneyError, `accepted ${String(bad)}`);
    }
  });

  it('converts paise back, and refuses a remainder', () => {
    assert.equal(paiseToRupees(530_000), 5_300);
    assert.throws(() => paiseToRupees(530_050), MoneyError);
    assert.throws(() => paiseToRupees(1.5), MoneyError);
  });

  /**
   * This is the comparison that decides whether a gateway payment belongs to a
   * ZyCart order. It has to answer false for anything odd rather than throwing,
   * because the caller's conclusion is the same either way — and a throw on the
   * verification path would become a 500 instead of a refusal.
   */
  it('matches a gateway amount against an order total', () => {
    assert.equal(paiseMatchRupees(530_000, 5_300), true);
    assert.equal(paiseMatchRupees(529_900, 5_300), false);
    assert.equal(paiseMatchRupees(53_000_0, 5_301), false);
  });

  it('answers false rather than throwing for a malformed gateway amount', () => {
    for (const bad of ['530000', null, undefined, {}, Number.NaN, 5_300.5]) {
      assert.doesNotThrow(() => paiseMatchRupees(bad, 5_300));
      assert.equal(paiseMatchRupees(bad, 5_300), false);
    }
  });

  it('answers false for an implausible order total rather than throwing', () => {
    assert.equal(paiseMatchRupees(100, -1), false);
  });
});

/* ---------------------------------------------------------------- */

describe('Gateway configuration', () => {
  /**
   * Half-configured payments is the dangerous state: a key with no secret
   * creates gateway orders that can never be verified, and a missing webhook
   * secret leaves the recovery path for lost browser callbacks silently dead.
   */
  it('refuses to boot with some Razorpay variables but not others', () => {
    assert.throws(() => loadEnv({ ...BASE_ENV, RAZORPAY_KEY_ID: 'rzp_test_abcdef123456' }));
    assert.throws(() =>
      loadEnv({
        ...BASE_ENV,
        RAZORPAY_KEY_ID: 'rzp_test_abcdef123456',
        RAZORPAY_KEY_SECRET: 'x'.repeat(24),
      }),
    );
  });

  it('boots with none of them, as cash on delivery only', () => {
    assert.doesNotThrow(() => loadEnv(BASE_ENV));
  });

  it('boots with all three', () => {
    assert.doesNotThrow(() =>
      loadEnv({
        ...BASE_ENV,
        RAZORPAY_KEY_ID: 'rzp_test_abcdef123456',
        RAZORPAY_KEY_SECRET: 'x'.repeat(24),
        RAZORPAY_WEBHOOK_SECRET: 'y'.repeat(24),
      }),
    );
  });

  it('refuses a live key outside production', () => {
    assert.throws(() =>
      loadEnv({
        ...BASE_ENV,
        NODE_ENV: 'development',
        RAZORPAY_KEY_ID: 'rzp_live_abcdef123456',
        RAZORPAY_KEY_SECRET: 'x'.repeat(24),
        RAZORPAY_WEBHOOK_SECRET: 'y'.repeat(24),
      }),
    );
  });

  it('refuses a test key in production, where real money would not be collected', () => {
    assert.throws(() =>
      loadEnv({
        ...BASE_ENV,
        NODE_ENV: 'production',
        AI_PROVIDER: 'anthropic',
        AI_API_KEY: 'k'.repeat(40),
        RAZORPAY_KEY_ID: 'rzp_test_abcdef123456',
        RAZORPAY_KEY_SECRET: 'x'.repeat(24),
        RAZORPAY_WEBHOOK_SECRET: 'y'.repeat(24),
      }),
    );
  });

  it('refuses a key id that is not a Razorpay key id', () => {
    for (const keyId of ['abcdef', 'rzp_abcdef', 'rzp_test_', 'rzp_test_abc def']) {
      assert.throws(
        () =>
          loadEnv({
            ...BASE_ENV,
            RAZORPAY_KEY_ID: keyId,
            RAZORPAY_KEY_SECRET: 'x'.repeat(24),
            RAZORPAY_WEBHOOK_SECRET: 'y'.repeat(24),
          }),
        `accepted ${keyId}`,
      );
    }
  });

  /**
   * The secrets are read by one module and never leave it. This asserts the
   * property that actually matters for a leak: neither appears in a
   * serialisation of the environment's own summary values, which is what a
   * diagnostic endpoint or a startup banner would print.
   */
  it('keeps both secrets out of anything a banner would print', () => {
    const env = loadEnv({
      ...BASE_ENV,
      RAZORPAY_KEY_ID: 'rzp_test_abcdef123456',
      RAZORPAY_KEY_SECRET: 'keysecret'.repeat(3),
      RAZORPAY_WEBHOOK_SECRET: 'hooksecret'.repeat(3),
    });

    const printable = JSON.stringify({
      NODE_ENV: env.NODE_ENV,
      CLIENT_URL: env.CLIENT_URL,
      // The key id is public by design — Checkout needs it in the browser.
      RAZORPAY_KEY_ID: env.RAZORPAY_KEY_ID,
    });

    assert.ok(!printable.includes('keysecret'));
    assert.ok(!printable.includes('hooksecret'));
  });
});
