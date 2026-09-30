import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { ApiError } from '@google/genai';
import { loadEnv } from '../src/config/env';
import { checkReadiness } from '../src/config/readiness';
import { tryOnConfig, tryOnUnavailableReason } from '../src/config/try-on';
import { secretValues } from '../src/config/logging';
import type { TryOnImageGenerator } from '../src/services/try-on/generator';
import { hasNoQuota, toProviderError } from '../src/services/ai/gemini.provider';
import { AiProviderError } from '../src/services/ai/provider';
import { buildTryOnPrompt, placementOf, type TryOnSubject } from '../src/services/try-on/prompt';
import { tryOnDay } from '../src/services/try-on/quota';
import { readTryOnResponse } from '../src/services/try-on/response';
import {
  TRY_ON_PAUSE_MS,
  createTryOn,
  isTryOnPaused,
  providerFailure,
  resumeTryOn,
  tryOnStatus,
} from '../src/services/try-on/try-on.service';
import { AppError } from '../src/utils/AppError';
import { configureLogger } from '../src/utils/logger';

/**
 * Phase 19's virtual try-on, where it can be checked without a database or a
 * paid call to an image model: which key is used, where a product goes on a
 * person, what the model is told, how its answer is read, and what happens
 * when the model's provider says no.
 */

const BASE_ENV = {
  MONGODB_URI: 'mongodb://localhost:27017/zycart-test',
  JWT_SECRET: 'x'.repeat(48),
};

const GEMINI_KEY = 'AIzaGeminiKeyForTests0000000000000000';
const TRY_ON_KEY = 'AIzaTryOnKeyForTests00000000000000000';

function subject(overrides: Partial<TryOnSubject> = {}): TryOnSubject {
  return {
    productName: 'Heritage Crew Tee',
    brand: 'Atelier Nord',
    categoryName: 'Fashion',
    categorySlug: 'fashion',
    tags: ['cotton', 'tee'],
    colour: null,
    ...overrides,
  };
}

/* ---------------------------------------------------------------- */

describe('Try-on configuration', () => {
  it('uses the assistant’s key when the assistant runs on Gemini', () => {
    const config = tryOnConfig(
      loadEnv({ ...BASE_ENV, AI_PROVIDER: 'gemini', AI_API_KEY: GEMINI_KEY }),
    );

    assert.equal(config?.apiKey, GEMINI_KEY);
    assert.equal(config?.model, 'gemini-3.1-flash-image');
    assert.equal(config?.dailyLimit, 10);
  });

  it('never hands Google a key that belongs to another vendor', () => {
    const env = loadEnv({ ...BASE_ENV, AI_PROVIDER: 'anthropic', AI_API_KEY: GEMINI_KEY });

    assert.equal(tryOnConfig(env), null);
    assert.match(tryOnUnavailableReason(env) ?? '', /TRY_ON_API_KEY/);
  });

  it('prefers its own key when one is set', () => {
    const config = tryOnConfig(
      loadEnv({
        ...BASE_ENV,
        AI_PROVIDER: 'gemini',
        AI_API_KEY: GEMINI_KEY,
        TRY_ON_API_KEY: TRY_ON_KEY,
        TRY_ON_MODEL: 'gemini-3.1-flash-lite-image',
        TRY_ON_DAILY_LIMIT: '3',
      }),
    );

    assert.equal(config?.apiKey, TRY_ON_KEY);
    assert.equal(config?.model, 'gemini-3.1-flash-lite-image');
    assert.equal(config?.dailyLimit, 3);
  });

  it('is off when switched off, whatever keys exist', () => {
    const env = loadEnv({ ...BASE_ENV, TRY_ON_API_KEY: TRY_ON_KEY, TRY_ON_ENABLED: 'false' });

    assert.equal(tryOnConfig(env), null);
    assert.equal(tryOnUnavailableReason(env), 'TRY_ON_ENABLED is false');
  });

  it('registers its key with the log redactor', () => {
    const env = loadEnv({ ...BASE_ENV, TRY_ON_API_KEY: TRY_ON_KEY });
    assert.ok(secretValues(env).includes(TRY_ON_KEY));
  });

  it('warns a production store that meant to offer it and cannot', () => {
    const report = checkReadiness(
      loadEnv({
        ...BASE_ENV,
        NODE_ENV: 'production',
        CLIENT_URL: 'https://zycart.example',
        AI_ENABLED: 'false',
      }),
    );

    assert.ok(
      report.findings.some(
        (finding) => finding.key === 'TRY_ON_API_KEY' && finding.severity === 'warning',
      ),
    );
    assert.equal(report.summary['Try-on'], 'not configured');
  });
});

/* ---------------------------------------------------------------- */

describe('Where a product goes on a person', () => {
  const cases: [Partial<TryOnSubject>, string][] = [
    [{}, 'clothing'],
    [
      {
        productName: 'Aviator Sunglasses',
        categoryName: 'Accessories',
        categorySlug: 'accessories',
        tags: [],
      },
      'eyewear',
    ],
    [
      {
        productName: 'Field Chronograph',
        categoryName: 'Accessories',
        categorySlug: 'accessories',
        tags: ['watch'],
      },
      'wristwear',
    ],
    [
      {
        productName: 'Canvas Tote',
        categoryName: 'Accessories',
        categorySlug: 'accessories',
        tags: [],
      },
      'bag',
    ],
    [
      {
        productName: 'Wool Beanie',
        categoryName: 'Accessories',
        categorySlug: 'accessories',
        tags: [],
      },
      'headwear',
    ],
    [
      {
        productName: 'Silver Pendant Necklace',
        categoryName: 'Accessories',
        categorySlug: 'accessories',
        tags: [],
      },
      'jewellery',
    ],
    [
      {
        productName: 'Silk Scarf',
        categoryName: 'Accessories',
        categorySlug: 'accessories',
        tags: [],
      },
      'accessory',
    ],
    [
      {
        productName: 'Air Max Heritage Runner',
        categoryName: 'Footwear',
        categorySlug: 'footwear',
        tags: [],
      },
      'footwear',
    ],
  ];

  for (const [overrides, placement] of cases) {
    it(`${overrides.productName ?? 'Heritage Crew Tee'} → ${placement}`, () => {
      assert.equal(placementOf(subject(overrides)), placement);
    });
  }

  it('treats everything in a footwear category as footwear, even a "cap-toe"', () => {
    assert.equal(
      placementOf(
        subject({
          productName: 'Cap-Toe Oxford',
          categoryName: 'Footwear',
          categorySlug: 'footwear',
        }),
      ),
      'footwear',
    );
  });

  it('matches whole words only — an earring is not a ring, a string is not either', () => {
    assert.equal(
      placementOf(
        subject({
          productName: 'Pearl Earrings',
          categorySlug: 'accessories',
          categoryName: 'Accessories',
        }),
      ),
      'jewellery',
    );
    assert.equal(placementOf(subject({ productName: 'Drawstring Hoodie', tags: [] })), 'clothing');
  });
});

describe('What the model is told', () => {
  it('names the product and keeps the person exactly as they are', () => {
    const prompt = buildTryOnPrompt(subject());

    assert.match(prompt, /"Atelier Nord Heritage Crew Tee"/);
    assert.match(prompt, /Do not slim, reshape, retouch or beautify/);
    assert.match(prompt, /same face and identity/);
    assert.match(prompt, /add no text/);
  });

  it('asks for the chosen colourway, and only when there is one', () => {
    assert.match(
      buildTryOnPrompt(subject({ colour: { name: 'Midnight', hex: '#101820' } })),
      /"Midnight" colourway \(#101820\)/,
    );
    assert.doesNotMatch(buildTryOnPrompt(subject()), /colourway/);
  });

  it('places shoes on feet and glasses on a face', () => {
    assert.match(
      buildTryOnPrompt(
        subject({ productName: 'Court Low', categoryName: 'Footwear', categorySlug: 'footwear' }),
      ),
      /on the person's feet/,
    );
    assert.match(
      buildTryOnPrompt(
        subject({
          productName: 'Round Glasses',
          categoryName: 'Accessories',
          categorySlug: 'accessories',
        }),
      ),
      /on the person's face/,
    );
  });
});

/* ---------------------------------------------------------------- */

describe("Reading the model's answer", () => {
  const image = (data: string, extra: Record<string, unknown> = {}) => ({
    inlineData: { mimeType: 'image/png', data },
    ...extra,
  });

  it('returns the final image and ignores the commentary', () => {
    const outcome = readTryOnResponse({
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ text: 'Here you go' } as never, image('AAA')] },
        },
      ],
    });

    assert.deepEqual(outcome, { kind: 'image', image: { mimeType: 'image/png', data: 'AAA' } });
  });

  it('skips draft images the model marked as thoughts', () => {
    const outcome = readTryOnResponse({
      candidates: [{ content: { parts: [image('DRAFT', { thought: true }), image('FINAL')] } }],
    });

    assert.equal(outcome.kind === 'image' ? outcome.image.data : null, 'FINAL');
  });

  it('reports a blocked prompt as a refusal', () => {
    assert.deepEqual(readTryOnResponse({ promptFeedback: { blockReason: 'SAFETY' } }), {
      kind: 'refused',
      reason: 'SAFETY',
    });
  });

  it('reports an image safety stop as a refusal', () => {
    assert.deepEqual(
      readTryOnResponse({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] }),
      { kind: 'refused', reason: 'IMAGE_SAFETY' },
    );
  });

  it('calls an answer with no image and no reason empty', () => {
    assert.deepEqual(readTryOnResponse({ candidates: [{ finishReason: 'STOP' }] }), {
      kind: 'empty',
    });
    assert.deepEqual(readTryOnResponse({}), { kind: 'empty' });
  });

  it('does not mistake a non-image attachment for the picture', () => {
    const outcome = readTryOnResponse({
      candidates: [
        { content: { parts: [{ inlineData: { mimeType: 'application/pdf', data: 'X' } }] } },
      ],
    });

    assert.equal(outcome.kind, 'empty');
  });
});

describe('The daily allowance', () => {
  it('counts days in IST, so it resets at midnight in India', () => {
    assert.equal(tryOnDay(new Date('2026-09-29T18:29:00.000Z')), '2026-09-29');
    assert.equal(tryOnDay(new Date('2026-09-29T18:30:00.000Z')), '2026-09-30');
  });
});

/* ---------------------------------------------------------------- */

/**
 * Google's 429, as the SDK hands it over: its status line, then the body.
 *
 * A free-tier key asking for an image model gets `limit: 0` — no image model
 * has a free tier. A free-tier key that has merely used up a text model's
 * allowance gets the same status and the same words with a real limit.
 */
const quotaError = (limit: number, model: string, status = 429) =>
  new ApiError({
    status,
    message:
      `got status: ${String(status)}. {"error":{"code":${String(status)},"message":"You exceeded ` +
      'your current quota, please check your plan and billing details.\\n* Quota exceeded for ' +
      'metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, ' +
      `limit: ${String(limit)}, model: ${model}\\nPlease retry in 51.6s.",` +
      '"status":"RESOURCE_EXHAUSTED"}}',
  });

describe('Telling "no quota" from "busy"', () => {
  it('reads limit: 0 as no allowance, and any other limit as a spent one', () => {
    assert.equal(hasNoQuota(quotaError(0, 'gemini-3.1-flash-image').message), true);
    assert.equal(hasNoQuota(quotaError(10, 'gemini-2.5-flash').message), false);
    assert.equal(hasNoQuota(quotaError(1500, 'gemini-2.5-flash').message), false);
    assert.equal(hasNoQuota('Resource has been exhausted (e.g. check quota).'), false);
  });

  it('classifies a free-tier key asking for an image model, naming the fix', () => {
    const error = toProviderError(quotaError(0, 'gemini-3.1-flash-image'));

    assert.equal(error.kind, 'no_quota');
    assert.match(error.message, /enable billing/);
    // ZyCart's sentence, not Google's body — nothing of the request is echoed.
    assert.doesNotMatch(error.message, /generativelanguage|RESOURCE_EXHAUSTED|retry in/);
  });

  it('reads Google’s 403 flavour of the same answer the same way', () => {
    assert.equal(toProviderError(quotaError(0, 'gemini-3.1-flash-image', 403)).kind, 'no_quota');
    assert.equal(toProviderError(quotaError(10, 'gemini-2.5-flash', 403)).kind, 'rate_limit');
  });

  it('keeps a spent allowance a rate limit, which clears by itself', () => {
    assert.equal(toProviderError(quotaError(10, 'gemini-2.5-flash')).kind, 'rate_limit');
  });

  it('still calls a 403 that is not about quota a credential problem', () => {
    const error = toProviderError(
      new ApiError({
        status: 403,
        message:
          'got status: 403. {"error":{"code":403,"message":"Method doesn\'t allow unregistered ' +
          'callers.","status":"PERMISSION_DENIED"}}',
      }),
    );

    assert.equal(error.kind, 'auth');
  });

  it('calls the deadline a timeout', () => {
    const error = toProviderError(new DOMException('The operation timed out.', 'TimeoutError'));
    assert.equal(error.kind, 'timeout');
  });
});

describe('When only the operator can fix it', () => {
  const env = loadEnv({ ...BASE_ENV, TRY_ON_API_KEY: TRY_ON_KEY });
  const records: Record<string, unknown>[] = [];

  /** A model that must not be reached: a paused try-on calls nobody. */
  const unreachable: TryOnImageGenerator = {
    generate: () => Promise.reject(new Error('the model was called while try-on was paused')),
  };

  before(() => {
    configureLogger({ level: 'debug', format: 'json' }, (_level, line) => {
      records.push(JSON.parse(line) as Record<string, unknown>);
    });
  });

  after(() => {
    configureLogger({});
  });

  afterEach(() => {
    resumeTryOn();
    records.length = 0;
  });

  it('tells the customer it is unavailable — not busy — and pauses try-on', () => {
    const failure = providerFailure(new AiProviderError('no quota', 'no_quota'), 'product-1');

    assert.equal(failure.statusCode, 503);
    assert.equal(failure.message, 'Virtual try-on is not available right now.');
    assert.equal(isTryOnPaused(), true);
    assert.equal(isTryOnPaused(Date.now() + TRY_ON_PAUSE_MS + 1_000), false);
  });

  it('hides the button and refuses tries while paused, before reading anything', async () => {
    providerFailure(new AiProviderError('no quota', 'no_quota'), 'product-1');

    assert.equal((await tryOnStatus(env, null)).available, false);

    // An empty photo would be a 400 — the pause is checked first, and the
    // generator would throw if anything got as far as the model.
    await assert.rejects(
      createTryOn(
        env,
        { userId: 'user-1', productRef: 'heritage-crew-tee', photo: Buffer.alloc(0) },
        unreachable,
      ),
      (error: unknown) => error instanceof AppError && error.statusCode === 503,
    );

    resumeTryOn();
    assert.equal((await tryOnStatus(env, null)).available, true);
  });

  it('pauses for a rejected key too', () => {
    const failure = providerFailure(new AiProviderError('rejected', 'auth'), 'product-1');

    assert.equal(failure.statusCode, 503);
    assert.equal(isTryOnPaused(), true);
  });

  it('never pauses for a failure that clears by itself', () => {
    const busy = providerFailure(new AiProviderError('busy', 'rate_limit'), 'product-1');
    assert.equal(busy.statusCode, 503);
    assert.match(busy.message, /busy/);

    assert.equal(providerFailure(new AiProviderError('slow', 'timeout'), 'p').statusCode, 504);
    assert.equal(providerFailure(new AiProviderError('500', 'upstream'), 'p').statusCode, 502);
    assert.equal(providerFailure(new Error('socket hang up'), 'p').statusCode, 502);

    assert.equal(isTryOnPaused(), false);
  });

  it('names the fix in the operator’s log, flagged for action', () => {
    providerFailure(toProviderError(quotaError(0, 'gemini-3.1-flash-image')), 'product-1');

    const record = records.at(-1);

    assert.equal(record?.level, 'error');
    assert.equal(record?.event, 'try_on_failed');
    assert.equal(record?.kind, 'no_quota');
    assert.equal(record?.needsManualAction, true);
    assert.equal(record?.pausedForMs, TRY_ON_PAUSE_MS);
    assert.match(String(record?.detail), /enable billing/);
    assert.doesNotMatch(JSON.stringify(record), /generativelanguage/);
  });

  it('logs a busy provider as a warning, with nothing for anyone to do', () => {
    providerFailure(new AiProviderError('busy', 'rate_limit'), 'product-1');

    const record = records.at(-1);

    assert.equal(record?.level, 'warn');
    assert.equal(record?.needsManualAction, undefined);
  });
});
