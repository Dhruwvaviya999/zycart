import sharp from 'sharp';
import type { TryOnConfig } from '../../config/try-on';
import type { TryOnImageGenerator } from '../try-on/generator';
import type { InlineImage, TryOnOutcome } from '../try-on/response';
import { IMAGE_MIME, sniffImage } from '../uploads/image-sniff';
import { AiProviderError } from './provider';

/**
 * Virtual try-on through FLUX.2 on Cloudflare Workers AI (Phase 19).
 *
 * The free way to run try-on. Every Cloudflare account gets a daily allowance
 * of 10,000 "neurons", and on the Free plan a request past it is refused, not
 * billed — so a store on this provider cannot run up a bill however popular
 * the button becomes. FLUX.2 [klein] 4B takes up to four reference images, and
 * a preview costs about a thousandth of a dollar of that allowance, which puts
 * the free plan at roughly eighty previews a day for the whole store.
 *
 * Called over Cloudflare's REST API with a Workers AI token; no SDK. Like the
 * Gemini generator it keeps nothing — no image, prompt or response is logged
 * or stored here — and Cloudflare states it does not train on, or improve any
 * service with, what is sent to Workers AI.
 *
 * ## What is different from Gemini
 *
 * Workers AI takes reference images no larger than 512×512, so both photos are
 * scaled down here first, which costs some detail in a face. And FLUX.2 is not
 * a conversational model: it is given a description of the picture to produce
 * (`buildReferencePrompt`) rather than instructions to follow.
 */

type CloudflareTryOnConfig = Extract<TryOnConfig, { provider: 'cloudflare' }>;

const API_BASE = 'https://api.cloudflare.com/client/v4/accounts';

/** The largest reference image Workers AI accepts, per side. */
export const MAX_REFERENCE_SIDE = 512;

/**
 * The preview's long side.
 *
 * Output is charged per 512×512 tile, so 1024 keeps a preview to at most four
 * tiles — the difference between eighty free previews a day and twenty.
 */
const OUTPUT_LONG_SIDE = 1024;

export interface ReferenceImage {
  bytes: Buffer;
  width: number;
  height: number;
}

/**
 * An image made fit to send: inside 512×512, upright, as a JPEG.
 *
 * `rotate()` applies any EXIF orientation before the metadata is dropped —
 * sharp writes none unless asked — and transparent product shots are laid on
 * white, the background a product page shows them on, rather than on black.
 */
export async function toReference(image: InlineImage): Promise<ReferenceImage> {
  const { data, info } = await sharp(Buffer.from(image.data, 'base64'))
    .rotate()
    .resize(MAX_REFERENCE_SIDE, MAX_REFERENCE_SIDE, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });

  return { bytes: data, width: info.width, height: info.height };
}

/**
 * The preview's size: the customer photo's shape, long side 1024.
 *
 * The same shape so the before/after comparison lines up; multiples of 16
 * because that is the grid the model generates on.
 */
export function outputSize(width: number, height: number): { width: number; height: number } {
  const scale = OUTPUT_LONG_SIDE / Math.max(width, height, 1);
  const snap = (side: number) => Math.max(256, Math.round((side * scale) / 16) * 16);

  return { width: snap(width), height: snap(height) };
}

/** Cloudflare's response envelope — the parts read here. */
export interface CloudflareEnvelope {
  success?: boolean;
  result?: { image?: unknown } | null;
  errors?: { code?: number; message?: string }[];
}

/** The next 00:00 UTC, when Workers AI's free allocation starts again. */
export function nextUtcMidnight(now: number): number {
  const today = new Date(now);
  return Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1);
}

/**
 * Classifies a refused request by Cloudflare's own error codes, never quoting
 * its text.
 *
 * Two different problems both arrive as 429: the day's free allocation being
 * spent (3036, and 4006 in practice), which comes back at midnight UTC, and
 * the platform being out of capacity (3040), which comes back in moments. The
 * codes are checked before the status for the same reason with 403: a model
 * that needs the Workers Paid plan (5035) is not a bad token.
 */
export function toCloudflareError(
  status: number,
  body: CloudflareEnvelope | null,
  now: number = Date.now(),
): AiProviderError {
  const errors = body?.errors ?? [];
  const codes = errors.map((error) => error.code);
  const text = errors.map((error) => error.message ?? '').join(' ');

  if (codes.includes(3036) || codes.includes(4006) || /daily free allocation/i.test(text)) {
    return new AiProviderError(
      'The Workers AI free allocation for today (10,000 neurons) is used up; it comes back at ' +
        '00:00 UTC. The Workers Paid plan removes the cap.',
      'daily_quota',
      nextUtcMidnight(now),
    );
  }

  if (codes.includes(5035)) {
    return new AiProviderError(
      'This model requires the Workers Paid plan: upgrade, or set TRY_ON_MODEL to a model the ' +
        'Free plan includes.',
      'no_quota',
    );
  }

  if (codes.includes(5007) || codes.includes(3042)) {
    return new AiProviderError(
      'Workers AI has no model by that name: check TRY_ON_MODEL.',
      'no_quota',
    );
  }

  if (status === 401 || status === 403 || codes.includes(10000)) {
    return new AiProviderError(
      'Cloudflare rejected the credentials: CLOUDFLARE_API_TOKEN needs Workers AI permissions, ' +
        'and CLOUDFLARE_ACCOUNT_ID must be the account it belongs to.',
      'auth',
    );
  }

  if (status === 429) return new AiProviderError('Workers AI is at capacity', 'rate_limit');
  if (status === 408) return new AiProviderError('Workers AI timed out', 'timeout');

  const code = codes.find((value) => typeof value === 'number');
  return new AiProviderError(
    `Workers AI error (status ${String(status)}${code === undefined ? '' : `, code ${String(code)}`})`,
    'upstream',
  );
}

/** Image bytes, checked by their own first bytes. Anything else is no picture. */
function imageFrom(bytes: Buffer): TryOnOutcome {
  const format = sniffImage(bytes);
  if (!format) return { kind: 'empty' };

  return { kind: 'image', image: { mimeType: IMAGE_MIME[format], data: bytes.toString('base64') } };
}

/** The picture in a successful response: `result.image`, base64, perhaps as a data URL. */
export function readCloudflareImage(body: CloudflareEnvelope | null): TryOnOutcome {
  const encoded = body?.result?.image;
  if (typeof encoded !== 'string' || encoded.length === 0) return { kind: 'empty' };

  return imageFrom(Buffer.from(encoded.replace(/^data:[^,]*,/, ''), 'base64'));
}

function parseEnvelope(payload: Buffer): CloudflareEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(payload.toString('utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as CloudflareEnvelope) : null;
  } catch {
    return null;
  }
}

/**
 * `send` is `fetch` in production and a stub in tests — the same seam, one
 * level down, as the generator itself.
 */
export function createCloudflareTryOnGenerator(
  config: CloudflareTryOnConfig,
  send: typeof fetch = fetch,
): TryOnImageGenerator {
  const url = `${API_BASE}/${config.accountId}/ai/run/${config.model}`;

  return {
    async generate({ prompt, person, product }) {
      const [personImage, productImage] = await Promise.all([
        toReference(person),
        toReference(product),
      ]);
      const size = outputSize(personImage.width, personImage.height);

      // Numbered as the prompt refers to them: the customer is image 1.
      const form = new FormData();
      form.append('prompt', prompt);
      form.append(
        'input_image_0',
        new Blob([new Uint8Array(personImage.bytes)], { type: 'image/jpeg' }),
        'person.jpg',
      );
      form.append(
        'input_image_1',
        new Blob([new Uint8Array(productImage.bytes)], { type: 'image/jpeg' }),
        'product.jpg',
      );
      form.append('width', String(size.width));
      form.append('height', String(size.height));

      let status: number;
      let contentType: string;
      let payload: Buffer;

      try {
        const response = await send(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}` },
          body: form,
          signal: AbortSignal.timeout(config.timeoutMs),
        });

        status = response.status;
        contentType = response.headers.get('content-type') ?? '';
        payload = Buffer.from(await response.arrayBuffer());
      } catch (error) {
        throw error instanceof Error &&
          (error.name === 'TimeoutError' || error.name === 'AbortError')
          ? new AiProviderError('Request aborted', 'timeout')
          : new AiProviderError('Could not reach Workers AI', 'upstream');
      }

      const ok = status >= 200 && status < 300;

      // Some Workers AI image models answer with the bytes themselves.
      if (ok && contentType.startsWith('image/')) return imageFrom(payload);

      const body = parseEnvelope(payload);
      if (!ok || body?.success === false) throw toCloudflareError(status, body);

      return readCloudflareImage(body);
    },
  };
}
