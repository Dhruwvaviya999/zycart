import type { Env } from '../../config/env';
import { TRY_ON_PROCESSOR, tryOnConfig } from '../../config/try-on';
/**
 * Registered for their side effect: the product lookup below populates a
 * category and a brand, and this service may run outside the API process
 * (a verification script), where nothing else would have loaded them.
 */
import '../../models/brand.model';
import '../../models/category.model';
import { Product } from '../../models/product.model';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { isObjectId } from '../../validators/common';
import { AiProviderError } from '../ai/provider';
import { IMAGE_MIME, sniffImage, type ImageFormat } from '../uploads/image-sniff';
import { createTryOnGenerator, type TryOnImageGenerator } from './generator';
import { buildReferencePrompt, buildTryOnPrompt, placementOf, type Placement } from './prompt';
import { releaseTry, reserveTry, triesUsedToday } from './quota';
import type { InlineImage } from './response';

/**
 * Virtual try-on: a customer's photo, a product, and a picture of the one
 * wearing the other.
 *
 * ## What happens to the photo
 *
 * It arrives in the request body, is checked, is sent to the image model, and
 * is gone when the request ends. It is not written to disk, to the database,
 * to object storage or to a log — not even its size is logged — and neither is
 * the picture that comes back, which goes straight to the customer's browser.
 * ZyCart keeps a count of tries per day and nothing else.
 *
 * ## What a try costs, and who pays for a failure
 *
 * Every try is an image generation somebody's allowance pays for — a paid
 * Gemini call, or part of Cloudflare's free daily allowance, which the whole
 * store shares — so each account has a daily allowance
 * (`TRY_ON_DAILY_LIMIT`). A try is reserved *before* the model is called, so
 * two tabs cannot both spend the last one, and given back when no picture came
 * out — a refusal, a timeout, a provider fault — because a customer who got
 * nothing has used nothing. Everything that could make a request fail for a
 * reason of its own is checked before the reservation, so a bad photo or an
 * ineligible product never touches the allowance at all.
 */

/** What the model accepts as input. GIF and AVIF are fine for the shop, not for this. */
export const TRY_ON_FORMATS: readonly ImageFormat[] = ['jpeg', 'png', 'webp'];

/**
 * The largest customer photo accepted, in bytes.
 *
 * The storefront downscales and re-encodes before uploading — which also
 * strips location metadata — so a real upload is a few hundred kilobytes.
 * The ceiling is for a client that skips that, and it keeps the request to
 * the model well inside its inline size limit.
 */
export const MAX_TRY_ON_PHOTO_BYTES = 6 * 1024 * 1024;

const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;
const PRODUCT_IMAGE_TIMEOUT_MS = 15_000;

export interface TryOnInput {
  userId: string;
  /** A product id or slug. */
  productRef: string;
  /** The colourway chosen on the product page, by name. */
  colour?: string;
  photo: Buffer;
}

export interface TryOnResult {
  /** A `data:` URL — the picture never exists anywhere else. */
  image: string;
  placement: Placement;
  dailyLimit: number;
  remainingToday: number;
}

const unavailable = () => new AppError('Virtual try-on is not available right now.', 503);

/**
 * The product photo, fetched and checked.
 *
 * Product images are URLs an administrator entered or uploaded, so this is a
 * server-side fetch of an address from the database. Two things keep it
 * honest. The response is read with a byte ceiling, not trusted to be small.
 * And it must *be* an image the model accepts, by its own first bytes — so a
 * URL pointed at something that is not a product photo sends nothing onward,
 * whatever it returned.
 */
async function fetchProductImage(url: string | undefined): Promise<InlineImage> {
  const refuse = () => new AppError('This product’s photo could not be prepared for try-on.', 409);

  let target: URL;

  try {
    target = new URL(url ?? '');
  } catch {
    throw refuse();
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') throw refuse();

  let response: Response;

  try {
    response = await fetch(target, {
      // Asks an image CDN for a format the model reads, rather than the AVIF a
      // browser would be offered for the same URL.
      headers: { Accept: 'image/jpeg,image/png,image/webp;q=0.9' },
      signal: AbortSignal.timeout(PRODUCT_IMAGE_TIMEOUT_MS),
    });
  } catch {
    throw refuse();
  }

  if (!response.ok || !response.body) throw refuse();

  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    received += value.byteLength;
    if (received > MAX_PRODUCT_IMAGE_BYTES) {
      await reader.cancel();
      throw refuse();
    }

    chunks.push(value);
  }

  const bytes = Buffer.concat(chunks);
  const format = sniffImage(bytes);

  if (!format || !TRY_ON_FORMATS.includes(format)) throw refuse();

  return { mimeType: IMAGE_MIME[format], data: bytes.toString('base64') };
}

/** The customer's photo, checked by its own bytes. */
function readPhoto(photo: Buffer): InlineImage {
  if (photo.length === 0) {
    throw new AppError('Choose a photo to try this on.', 400);
  }

  if (photo.length > MAX_TRY_ON_PHOTO_BYTES) {
    throw new AppError('That photo is too large. Use one under 6 MB.', 413);
  }

  const format = sniffImage(photo);

  if (!format || !TRY_ON_FORMATS.includes(format)) {
    throw new AppError('Use a JPEG, PNG or WebP photo.', 415);
  }

  return { mimeType: IMAGE_MIME[format], data: photo.toString('base64') };
}

/** What to tell the customer when the model will not use their photo. */
const REFUSED_HINT: Record<Placement, string> = {
  clothing:
    'a clear, well-lit photo of yourself facing the camera, from the waist up or full length',
  footwear: 'a clear, full-length photo of yourself with your feet visible',
  eyewear: 'a clear, well-lit photo of your face, looking at the camera',
  wristwear: 'a clear photo with your wrist and hand visible',
  bag: 'a clear, well-lit photo of yourself, from the waist up or full length',
  headwear: 'a clear, well-lit photo of your head and shoulders',
  jewellery: 'a clear, well-lit photo where the place you would wear it is visible',
  accessory: 'a clear, well-lit photo of yourself facing the camera',
};

/**
 * How long try-on stays switched off after a failure only an operator can fix.
 */
export const TRY_ON_PAUSE_MS = 10 * 60 * 1_000;

/** The longest a spent daily allowance may pause try-on for, whatever the provider says. */
const MAX_DAILY_PAUSE_MS = 24 * 60 * 60 * 1_000;

/**
 * Until when try-on is paused in this process, as epoch milliseconds.
 *
 * ## Why pause at all
 *
 * A rejected key, or a key with no quota for the model, fails every try the
 * same way until somebody changes the configuration. So does a provider whose
 * allowance for the day is spent — Cloudflare's free plan — until the
 * provider's reset. Without a pause, every customer who opens a product page
 * sees the button, uploads a photo, waits, and is told it is unavailable — and
 * each of them costs a round trip to learn what the first one already did. So
 * the first such failure hides the button (`tryOnStatus` answers unavailable)
 * and refuses further tries without calling out, for a while.
 *
 * ## Why only for a while, and only here
 *
 * The operator's fix — enabling billing, replacing a key — happens outside
 * this process and tells it nothing, so the pause expires and the next try
 * finds out. A spent daily allowance pauses until the time the provider named.
 * It is per process on purpose: a shared flag would need a store and would
 * outlive the problem, and a few processes each learning once is cheap. Only
 * failures that cannot clear within a minute pause; a timeout or a transient
 * rate limit never does.
 */
let pausedUntil = 0;

export function isTryOnPaused(now: number = Date.now()): boolean {
  return now < pausedUntil;
}

/** Ends a pause — for tests, and for nothing reachable over HTTP. */
export function resumeTryOn(): void {
  pausedUntil = 0;
}

/**
 * Turns a provider failure into something a customer can act on, and says the
 * operator's version in the log. Exported so each mapping can be checked
 * without a database or a paid call.
 */
export function providerFailure(error: unknown, productId: string): AppError {
  const kind = error instanceof AiProviderError ? error.kind : 'unknown';
  const operatorsProblem = kind === 'auth' || kind === 'no_quota';
  const now = Date.now();

  if (operatorsProblem) pausedUntil = now + TRY_ON_PAUSE_MS;

  if (kind === 'daily_quota') {
    // The provider's own reset time when it gave a sane one, else the usual pause.
    const retryAt = error instanceof AiProviderError ? error.retryAt : undefined;
    pausedUntil =
      retryAt !== undefined && retryAt > now && retryAt - now <= MAX_DAILY_PAUSE_MS
        ? retryAt
        : now + TRY_ON_PAUSE_MS;
  }

  logger.log(operatorsProblem ? 'error' : 'warn', 'try_on_failed', {
    productId,
    kind,
    ...(operatorsProblem
      ? {
          // The field an alert fires on: this fails every try until fixed.
          needsManualAction: true,
          // ZyCart's own sentence, naming the fix — see `toProviderError`.
          detail: error instanceof Error ? error.message : undefined,
          pausedForMs: TRY_ON_PAUSE_MS,
        }
      : {}),
    // Expected on a free plan, so a warning and no alert: it ends by itself.
    ...(kind === 'daily_quota'
      ? {
          detail: error instanceof Error ? error.message : undefined,
          pausedUntil: new Date(pausedUntil).toISOString(),
        }
      : {}),
  });

  switch (kind) {
    case 'timeout':
      return new AppError('The preview took too long. Please try again.', 504);
    case 'rate_limit':
      return new AppError('Try-on is busy right now. Please try again in a minute.', 503);
    case 'daily_quota':
      return new AppError(
        'Virtual try-on has reached its limit for today. Please try again tomorrow.',
        503,
      );
    case 'auth':
    case 'no_quota':
      // Not "busy": waiting will not help, and the customer should not be
      // told it will. The button disappears until the pause ends.
      return unavailable();
    default:
      return new AppError(
        'The try-on service is unavailable right now. Please try again shortly.',
        502,
      );
  }
}

/**
 * One virtual try-on.
 *
 * `generator` is the seam described on `TryOnImageGenerator`; production passes
 * nothing and gets the configured provider's live model.
 */
export async function createTryOn(
  env: Env,
  input: TryOnInput,
  generator?: TryOnImageGenerator,
): Promise<TryOnResult> {
  const config = tryOnConfig(env);

  // Paused: refused before anything is read, reserved or sent — see
  // `pausedUntil`. A page that still showed the button gets a plain answer.
  if (!config || isTryOnPaused()) throw unavailable();

  // Everything that can fail on its own merits is checked before a try is
  // reserved, so none of it can cost the customer part of their allowance.
  const person = readPhoto(input.photo);

  const product = await Product.findOne(
    isObjectId(input.productRef)
      ? { _id: input.productRef, isActive: true }
      : { slug: input.productRef, isActive: true },
  )
    .populate('category', 'name slug tryOnEnabled')
    .populate('brand', 'name');

  if (!product) throw new AppError('Product not found', 404);

  const category = product.category as unknown as {
    name?: string;
    slug?: string;
    tryOnEnabled?: boolean;
  } | null;

  if (!category?.tryOnEnabled) {
    throw new AppError('Virtual try-on is not available for this product.', 409);
  }

  const colour = input.colour
    ? product.colors.find((entry) => entry.name.toLowerCase() === input.colour?.toLowerCase())
    : undefined;

  if (input.colour && !colour) {
    throw new AppError('That colour is not offered for this product.', 400);
  }

  const brand = product.brand as unknown as { name?: string } | null;

  const subject = {
    productName: product.name,
    brand: brand?.name ?? '',
    categoryName: category.name ?? '',
    categorySlug: category.slug ?? '',
    tags: product.tags,
    colour: colour ? { name: colour.name, hex: colour.hex } : null,
  };

  const placement = placementOf(subject);
  const productImage = await fetchProductImage(product.images[0]);
  const productId = String(product._id);

  const reservation = await reserveTry(input.userId, config.dailyLimit);

  if (!reservation.reserved) {
    throw new AppError(
      `You have used all ${String(config.dailyLimit)} try-ons for today. Your allowance resets at ` +
        'midnight (IST).',
      429,
    );
  }

  const startedAt = Date.now();
  let outcome;

  try {
    outcome = await (generator ?? createTryOnGenerator(config)).generate({
      // Gemini follows instructions; FLUX.2 is told what the picture shows.
      prompt:
        config.provider === 'cloudflare'
          ? buildReferencePrompt(subject)
          : buildTryOnPrompt(subject),
      person,
      product: productImage,
    });
  } catch (error) {
    await releaseTry(input.userId, reservation.day);
    throw providerFailure(error, productId);
  }

  if (outcome.kind !== 'image') {
    await releaseTry(input.userId, reservation.day);

    logger.info('try_on_refused', {
      productId,
      outcome: outcome.kind,
      reason: outcome.kind === 'refused' ? outcome.reason : undefined,
    });

    throw new AppError(
      `We could not create a preview from this photo. Try ${REFUSED_HINT[placement]}.`,
      422,
    );
  }

  logger.info('try_on_completed', {
    productId,
    placement,
    model: config.model,
    durationMs: Date.now() - startedAt,
    usedToday: reservation.used,
  });

  return {
    image: `data:${outcome.image.mimeType};base64,${outcome.image.data}`,
    placement,
    dailyLimit: config.dailyLimit,
    remainingToday: Math.max(0, config.dailyLimit - reservation.used),
  };
}

export interface TryOnStatus {
  /** Whether this deployment offers try-on at all. */
  available: boolean;
  /** Who the photo is sent to, for the consent box. Null when unavailable. */
  processor: string | null;
  dailyLimit: number;
  /** Null for a visitor who is not signed in: try-on needs an account. */
  remainingToday: number | null;
}

/** What the product page needs to decide whether, and how, to offer the button. */
export async function tryOnStatus(env: Env, userId: string | null): Promise<TryOnStatus> {
  const config = tryOnConfig(env);

  // A paused try-on is reported as unavailable, so the button is not offered
  // while every try would fail the same way.
  if (!config || isTryOnPaused()) {
    return { available: false, processor: null, dailyLimit: 0, remainingToday: null };
  }

  return {
    available: true,
    processor: TRY_ON_PROCESSOR[config.provider],
    dailyLimit: config.dailyLimit,
    remainingToday: userId ? Math.max(0, config.dailyLimit - (await triesUsedToday(userId))) : null,
  };
}
