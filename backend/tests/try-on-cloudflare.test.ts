import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { loadEnv } from '../src/config/env';
import { secretValues } from '../src/config/logging';
import { checkReadiness } from '../src/config/readiness';
import { tryOnConfig, tryOnUnavailableReason } from '../src/config/try-on';
import {
  MAX_REFERENCE_SIDE,
  createCloudflareTryOnGenerator,
  nextUtcMidnight,
  outputSize,
  readCloudflareImage,
  toCloudflareError,
  toReference,
} from '../src/services/ai/cloudflare-image.provider';
import { AiProviderError } from '../src/services/ai/provider';
import { buildReferencePrompt, type TryOnSubject } from '../src/services/try-on/prompt';
import {
  TRY_ON_PAUSE_MS,
  isTryOnPaused,
  providerFailure,
  resumeTryOn,
  tryOnStatus,
} from '../src/services/try-on/try-on.service';
import { sniffImage } from '../src/services/uploads/image-sniff';
import { configureLogger } from '../src/utils/logger';

/**
 * Try-on on Cloudflare Workers AI — the free provider — checked without an
 * account, a token or a network: configuration, the instruction, the images
 * sent, the request's shape, and every way Cloudflare can say no.
 */

const BASE_ENV = {
  MONGODB_URI: 'mongodb://localhost:27017/zycart-test',
  JWT_SECRET: 'x'.repeat(48),
};

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const API_TOKEN = 'cf-workers-ai-token-for-tests-000000000';

const CLOUDFLARE_ENV = {
  ...BASE_ENV,
  TRY_ON_PROVIDER: 'cloudflare',
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  CLOUDFLARE_API_TOKEN: API_TOKEN,
};

function cloudflareConfig() {
  const config = tryOnConfig(loadEnv(CLOUDFLARE_ENV));
  assert.ok(config?.provider === 'cloudflare');
  return config;
}

/** A real image of a given size, made on the spot. Transparent, like a product cut-out. */
const picture = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 4, background: { r: 180, g: 40, b: 40, alpha: 0.5 } },
  })
    .png()
    .toBuffer();

const inline = (bytes: Buffer) => ({ mimeType: 'image/png', data: bytes.toString('base64') });

const subject = (overrides: Partial<TryOnSubject> = {}): TryOnSubject => ({
  productName: 'Heritage Crew Tee',
  brand: 'Atelier Nord',
  categoryName: 'Fashion',
  categorySlug: 'fashion',
  tags: ['cotton', 'tee'],
  colour: null,
  ...overrides,
});

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/* ---------------------------------------------------------------- */

describe('Choosing Cloudflare', () => {
  it('uses the account, the token and FLUX.2 [klein] 4B by default', () => {
    const config = cloudflareConfig();

    assert.equal(config.accountId, ACCOUNT_ID);
    assert.equal(config.apiKey, API_TOKEN);
    assert.equal(config.model, '@cf/black-forest-labs/flux-2-klein-4b');
  });

  it('is unavailable with only half the credentials, and says which', () => {
    const env = loadEnv({
      ...BASE_ENV,
      TRY_ON_PROVIDER: 'cloudflare',
      CLOUDFLARE_API_TOKEN: API_TOKEN,
    });

    assert.equal(tryOnConfig(env), null);
    assert.match(tryOnUnavailableReason(env) ?? '', /CLOUDFLARE_ACCOUNT_ID/);
  });

  it('never falls back to the Gemini key', () => {
    const env = loadEnv({
      ...BASE_ENV,
      TRY_ON_PROVIDER: 'cloudflare',
      TRY_ON_API_KEY: 'AIzaTryOnKeyForTests00000000000000000',
    });

    assert.equal(tryOnConfig(env), null);
  });

  it('refuses to start with a Gemini model left behind in TRY_ON_MODEL', () => {
    assert.throws(
      () => loadEnv({ ...CLOUDFLARE_ENV, TRY_ON_MODEL: 'gemini-3.1-flash-image' }),
      /TRY_ON_MODEL: .*not a Workers AI model/,
    );
    assert.throws(
      () => loadEnv({ ...BASE_ENV, TRY_ON_MODEL: '@cf/black-forest-labs/flux-2-klein-4b' }),
      /TRY_ON_MODEL: is a Workers AI model/,
    );
  });

  it('accepts another Workers AI model by name', () => {
    const env = loadEnv({
      ...CLOUDFLARE_ENV,
      TRY_ON_MODEL: '@cf/black-forest-labs/flux-2-klein-9b',
    });
    assert.equal(tryOnConfig(env)?.model, '@cf/black-forest-labs/flux-2-klein-9b');
  });

  it('rejects an account id that is not one', () => {
    assert.throws(
      () => loadEnv({ ...CLOUDFLARE_ENV, CLOUDFLARE_ACCOUNT_ID: 'my-account' }),
      /CLOUDFLARE_ACCOUNT_ID/,
    );
  });

  it('registers the token with the log redactor', () => {
    assert.ok(secretValues(loadEnv(CLOUDFLARE_ENV)).includes(API_TOKEN));
  });

  it('warns a production store about the Cloudflare token, not the Gemini key', () => {
    const report = checkReadiness(
      loadEnv({
        ...BASE_ENV,
        NODE_ENV: 'production',
        CLIENT_URL: 'https://zycart.example',
        AI_ENABLED: 'false',
        TRY_ON_PROVIDER: 'cloudflare',
      }),
    );

    assert.ok(report.findings.some((finding) => finding.key === 'CLOUDFLARE_API_TOKEN'));
    assert.ok(!report.findings.some((finding) => finding.key === 'TRY_ON_API_KEY'));
  });

  it('tells the consent box who receives the photo', async () => {
    const cloudflare = await tryOnStatus(loadEnv(CLOUDFLARE_ENV), null);
    const gemini = await tryOnStatus(
      loadEnv({ ...BASE_ENV, TRY_ON_API_KEY: 'AIzaTryOnKeyForTests00000000000000000' }),
      null,
    );

    assert.equal(cloudflare.processor, 'Cloudflare Workers AI');
    assert.equal(gemini.processor, 'Google’s Gemini AI');
    assert.equal((await tryOnStatus(loadEnv(BASE_ENV), null)).processor, null);
  });
});

/* ---------------------------------------------------------------- */

describe('What FLUX.2 is told', () => {
  it('describes the photo, referring to the customer as image 1 and the product as image 2', () => {
    const prompt = buildReferencePrompt(subject());

    assert.match(prompt, /person from image 1/);
    assert.match(prompt, /garment from image 2/);
    assert.match(prompt, /"Atelier Nord Heritage Crew Tee"/);
    assert.match(prompt, /same face and identity/);
    assert.match(prompt, /unretouched/);
  });

  it('puts shoes on feet, and names the colourway only when there is one', () => {
    const shoes = buildReferencePrompt(
      subject({
        productName: 'Trail Runner',
        categoryName: 'Footwear',
        categorySlug: 'footwear',
        colour: { name: 'Slate', hex: '#475569' },
      }),
    );

    assert.match(shoes, /shoes from image 2 on their feet/);
    assert.match(shoes, /"Slate" colourway \(#475569\)/);
    assert.doesNotMatch(buildReferencePrompt(subject()), /colourway/);
  });
});

/* ---------------------------------------------------------------- */

describe('The images Cloudflare is sent', () => {
  it('fits a large photo inside 512×512 as a JPEG, keeping its shape', async () => {
    const reference = await toReference(inline(await picture(1200, 900)));

    assert.equal(reference.width, MAX_REFERENCE_SIDE);
    assert.equal(reference.height, 384);
    assert.equal(sniffImage(reference.bytes), 'jpeg');
  });

  it('never enlarges a small one', async () => {
    const reference = await toReference(inline(await picture(300, 200)));

    assert.equal(reference.width, 300);
    assert.equal(reference.height, 200);
  });

  it('sizes the preview like the customer photo, long side 1024, on a 16-pixel grid', () => {
    assert.deepEqual(outputSize(384, 512), { width: 768, height: 1024 });
    assert.deepEqual(outputSize(512, 384), { width: 1024, height: 768 });
    assert.deepEqual(outputSize(512, 512), { width: 1024, height: 1024 });

    const odd = outputSize(333, 500);
    assert.equal(odd.height, 1024);
    assert.equal(odd.width % 16, 0);
  });
});

/* ---------------------------------------------------------------- */

describe('Reading what Cloudflare sends back', () => {
  it('takes the base64 image from the result', async () => {
    const png = await picture(8, 8);
    const outcome = readCloudflareImage({
      success: true,
      result: { image: png.toString('base64') },
    });

    assert.equal(outcome.kind, 'image');
    assert.equal(outcome.kind === 'image' && outcome.image.mimeType, 'image/png');
  });

  it('accepts the image as a data URL too', async () => {
    const png = await picture(8, 8);
    const outcome = readCloudflareImage({
      success: true,
      result: { image: `data:image/png;base64,${png.toString('base64')}` },
    });

    assert.equal(outcome.kind, 'image');
  });

  it('calls a result with no image, or with bytes that are not one, empty', () => {
    assert.equal(readCloudflareImage({ success: true, result: {} }).kind, 'empty');
    assert.equal(readCloudflareImage(null).kind, 'empty');
    assert.equal(
      readCloudflareImage({
        success: true,
        result: { image: Buffer.from('<svg/>').toString('base64') },
      }).kind,
      'empty',
    );
  });
});

describe('Every way Cloudflare says no', () => {
  const NOW = Date.UTC(2026, 8, 30, 14, 45);

  it('reads a spent free allowance as a daily quota that returns at midnight UTC', () => {
    for (const code of [3036, 4006]) {
      const error = toCloudflareError(
        429,
        {
          success: false,
          errors: [
            { code, message: 'You have used up your daily free allocation of 10,000 neurons' },
          ],
        },
        NOW,
      );

      assert.equal(error.kind, 'daily_quota');
      assert.equal(error.retryAt, Date.UTC(2026, 9, 1));
    }
  });

  it('keeps "out of capacity" a rate limit, which clears in moments', () => {
    const error = toCloudflareError(429, {
      success: false,
      errors: [{ code: 3040, message: 'Capacity temporarily exceeded, please try again' }],
    });

    assert.equal(error.kind, 'rate_limit');
  });

  it('tells a model that needs Workers Paid from a bad token, though both are 403', () => {
    const paidOnly = toCloudflareError(403, {
      success: false,
      errors: [{ code: 5035, message: 'This model requires a Workers Paid plan' }],
    });
    const badToken = toCloudflareError(403, {
      success: false,
      errors: [{ code: 10000, message: 'Authentication error' }],
    });

    assert.equal(paidOnly.kind, 'no_quota');
    assert.equal(badToken.kind, 'auth');
    assert.equal(toCloudflareError(401, null).kind, 'auth');
  });

  it('names a mistyped model as the operator’s to fix', () => {
    const error = toCloudflareError(400, {
      success: false,
      errors: [{ code: 5007, message: 'No such model @cf/nope or task' }],
    });

    assert.equal(error.kind, 'no_quota');
    assert.match(error.message, /TRY_ON_MODEL/);
  });

  it('quotes none of Cloudflare’s own words', () => {
    const error = toCloudflareError(500, {
      success: false,
      errors: [
        { code: 7001, message: 'internal detail for account 0123 prompt="a photo of Jane"' },
      ],
    });

    assert.equal(error.kind, 'upstream');
    assert.equal(error.message, 'Workers AI error (status 500, code 7001)');
  });

  it('finds the next midnight UTC from any time of day', () => {
    assert.equal(nextUtcMidnight(Date.UTC(2026, 11, 31, 23, 59)), Date.UTC(2027, 0, 1));
    assert.equal(nextUtcMidnight(Date.UTC(2026, 8, 30, 0, 0)), Date.UTC(2026, 9, 1));
  });
});

/* ---------------------------------------------------------------- */

describe('The request itself', () => {
  interface Sent {
    url: string;
    init: RequestInit | undefined;
  }

  const recorder = (answer: () => Response | Promise<Response>) => {
    const sent: Sent[] = [];
    const send: typeof fetch = async (input, init) => {
      sent.push({ url: String(input), init });
      return answer();
    };
    return { sent, send };
  };

  it('posts both photos, the prompt and the size to the account’s model', async () => {
    const png = await picture(16, 16);
    const { sent, send } = recorder(() =>
      jsonResponse(200, { success: true, result: { image: png.toString('base64') }, errors: [] }),
    );

    const outcome = await createCloudflareTryOnGenerator(cloudflareConfig(), send).generate({
      prompt: 'a prompt',
      person: inline(await picture(900, 1200)),
      product: inline(await picture(1000, 1000)),
    });

    assert.equal(outcome.kind, 'image');
    assert.equal(sent.length, 1);

    const [request] = sent;
    assert.ok(request);
    assert.equal(
      request.url,
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`,
    );
    assert.equal(request.init?.method, 'POST');
    assert.deepEqual(request.init?.headers, { Authorization: `Bearer ${API_TOKEN}` });

    const form = request.init?.body;
    assert.ok(form instanceof FormData);
    assert.equal(form.get('prompt'), 'a prompt');
    assert.equal(form.get('width'), '768');
    assert.equal(form.get('height'), '1024');

    for (const field of ['input_image_0', 'input_image_1']) {
      const file = form.get(field);
      assert.ok(file instanceof Blob, field);

      const bytes: Buffer = Buffer.from(await file.arrayBuffer());
      const metadata: sharp.Metadata = await sharp(bytes).metadata();

      assert.equal(metadata.format, 'jpeg');
      assert.ok(metadata.width <= MAX_REFERENCE_SIDE, field);
      assert.ok(metadata.height <= MAX_REFERENCE_SIDE, field);
    }
  });

  it('accepts an answer that is the image bytes themselves', async () => {
    const png = await picture(16, 16);
    const { send } = recorder(
      () =>
        new Response(new Uint8Array(png), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    );

    const outcome = await createCloudflareTryOnGenerator(cloudflareConfig(), send).generate({
      prompt: 'a prompt',
      person: inline(await picture(64, 64)),
      product: inline(await picture(64, 64)),
    });

    assert.equal(outcome.kind, 'image');
  });

  it('throws the classified failure when Cloudflare refuses', async () => {
    const { send } = recorder(() =>
      jsonResponse(429, {
        success: false,
        errors: [
          { code: 3036, message: 'You have used up your daily free allocation of 10,000 neurons' },
        ],
      }),
    );

    await assert.rejects(
      createCloudflareTryOnGenerator(cloudflareConfig(), send).generate({
        prompt: 'a prompt',
        person: inline(await picture(64, 64)),
        product: inline(await picture(64, 64)),
      }),
      (error: unknown) => error instanceof AiProviderError && error.kind === 'daily_quota',
    );
  });

  it('calls a network failure upstream and a deadline a timeout', async () => {
    const photos = {
      prompt: 'a prompt',
      person: inline(await picture(64, 64)),
      product: inline(await picture(64, 64)),
    };

    await assert.rejects(
      createCloudflareTryOnGenerator(cloudflareConfig(), () =>
        Promise.reject(new TypeError('fetch failed')),
      ).generate(photos),
      (error: unknown) => error instanceof AiProviderError && error.kind === 'upstream',
    );

    await assert.rejects(
      createCloudflareTryOnGenerator(cloudflareConfig(), () =>
        Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')),
      ).generate(photos),
      (error: unknown) => error instanceof AiProviderError && error.kind === 'timeout',
    );
  });
});

/* ---------------------------------------------------------------- */

describe('When the free allowance runs out', () => {
  const records: Record<string, unknown>[] = [];

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

  it('says so plainly and pauses try-on until Cloudflare’s reset', () => {
    const resetAt = Date.now() + 3 * 60 * 60 * 1_000;
    const failure = providerFailure(
      new AiProviderError('allowance spent', 'daily_quota', resetAt),
      'product-1',
    );

    assert.equal(failure.statusCode, 503);
    assert.match(failure.message, /limit for today/);
    assert.equal(isTryOnPaused(resetAt - 1), true);
    assert.equal(isTryOnPaused(resetAt), false);
  });

  it('logs a warning, not an alert — it is expected on a free plan', () => {
    const resetAt = Date.now() + 60 * 60 * 1_000;
    providerFailure(new AiProviderError('allowance spent', 'daily_quota', resetAt), 'product-1');

    const record = records.at(-1);

    assert.equal(record?.level, 'warn');
    assert.equal(record?.kind, 'daily_quota');
    assert.equal(record?.needsManualAction, undefined);
    assert.equal(record?.pausedUntil, new Date(resetAt).toISOString());
  });

  it('distrusts a reset time that is past or more than a day away', () => {
    const before = Date.now();

    providerFailure(
      new AiProviderError('spent', 'daily_quota', before + 3 * 24 * 60 * 60 * 1_000),
      'product-1',
    );
    assert.equal(isTryOnPaused(before + TRY_ON_PAUSE_MS + 1_000), false);

    providerFailure(new AiProviderError('spent', 'daily_quota', before - 1_000), 'product-1');
    assert.equal(isTryOnPaused(), true);
    assert.equal(isTryOnPaused(before + TRY_ON_PAUSE_MS + 1_000), false);
  });
});
