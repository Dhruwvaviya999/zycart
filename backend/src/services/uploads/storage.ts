import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Env } from '../../config/env';
import { IMAGE_EXTENSION, IMAGE_MIME, type ImageFormat } from './image-sniff';

/**
 * Where uploaded product images go.
 *
 * Two providers behind one small interface, chosen once from configuration —
 * the same shape the email and AI providers have. Both are handed bytes that
 * have already been sniffed and size-checked, and a format this module did not
 * choose never reaches either.
 */

export interface StoredImage {
  /** The absolute URL the catalogue stores and the storefront renders. */
  url: string;
  bytes: number;
  format: ImageFormat;
  provider: 'local' | 'cloudinary';
}

/** A failure the uploader can be told about, in ZyCart's words rather than the provider's. */
export class UploadError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export interface ImageStorage {
  readonly name: 'local' | 'cloudinary';
  store(bytes: Buffer, format: ImageFormat): Promise<StoredImage>;
}

/* ---------------------------------------------------------------- */
/* Local disk                                                        */
/* ---------------------------------------------------------------- */

/** Everything the local provider writes lives under here, and only here. */
export const LOCAL_UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');

/** The path the local files are served from. See `app.ts`. */
export const LOCAL_UPLOAD_ROUTE = '/api/uploads';

/**
 * Files on this machine's disk.
 *
 * ## The name is ZyCart's, never the uploader's
 *
 * Random, with the extension the sniffer chose. A client-supplied name could
 * contain `../`, could collide with an existing file, and could carry an
 * extension a web server would execute or render as HTML; none of those is
 * possible when the name is 24 hex characters and a known extension.
 */
function localStorage(env: Env): ImageStorage {
  const base = (env.API_PUBLIC_URL ?? `http://localhost:${String(env.PORT)}`).replace(/\/+$/, '');

  return {
    name: 'local',
    async store(bytes, format) {
      const month = new Date().toISOString().slice(0, 7).replace('-', '');
      const name = `${month}-${randomBytes(12).toString('hex')}.${IMAGE_EXTENSION[format]}`;
      const directory = path.join(LOCAL_UPLOAD_ROOT, 'products');

      await mkdir(directory, { recursive: true });
      // `wx`: fail rather than overwrite, however unlikely a collision is.
      await writeFile(path.join(directory, name), bytes, { flag: 'wx' });

      return {
        url: `${base}${LOCAL_UPLOAD_ROUTE}/products/${name}`,
        bytes: bytes.length,
        format,
        provider: 'local',
      };
    },
  };
}

/* ---------------------------------------------------------------- */
/* Cloudinary                                                        */
/* ---------------------------------------------------------------- */

/** How long an upload may take before it is abandoned. */
const CLOUDINARY_TIMEOUT_MS = 20_000;

/**
 * Cloudinary's signed-upload signature.
 *
 * The parameters being signed, sorted by name and joined as a query string,
 * with the API secret appended, SHA-1'd. The secret is an input to a hash and
 * never leaves this process — it is not sent, not logged, and not returned.
 */
export function cloudinarySignature(params: Record<string, string>, secret: string): string {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key] ?? ''}`)
    .join('&');

  return createHash('sha1').update(`${payload}${secret}`).digest('hex');
}

/**
 * Images on Cloudinary, uploaded server-side with a signed request.
 *
 * Server-side rather than straight from the browser, so the upload passes
 * through the same admin guard, the same size limit and the same sniffer as the
 * local provider — a browser holding a signature could upload anything to the
 * store's account.
 */
function cloudinaryStorage(env: Env): ImageStorage {
  const cloudName = env.CLOUDINARY_CLOUD_NAME ?? '';
  const apiKey = env.CLOUDINARY_API_KEY ?? '';
  const secret = env.CLOUDINARY_API_SECRET ?? '';

  return {
    name: 'cloudinary',
    async store(bytes, format) {
      const params = {
        folder: env.CLOUDINARY_FOLDER,
        timestamp: String(Math.floor(Date.now() / 1000)),
      };

      const form = new FormData();
      form.set('file', new Blob([new Uint8Array(bytes)], { type: IMAGE_MIME[format] }));
      form.set('api_key', apiKey);
      form.set('folder', params.folder);
      form.set('timestamp', params.timestamp);
      form.set('signature', cloudinarySignature(params, secret));

      let response: Response;

      try {
        response = await fetch(
          `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
          { method: 'POST', body: form, signal: AbortSignal.timeout(CLOUDINARY_TIMEOUT_MS) },
        );
      } catch {
        throw new UploadError('The image service could not be reached. Try again in a moment.');
      }

      const body = (await response.json().catch(() => null)) as {
        secure_url?: unknown;
        bytes?: unknown;
      } | null;

      /**
       * Cloudinary's own error text is not passed on. It is usually harmless,
       * but a signature failure quotes back the string that was signed, and the
       * uploader has no use for any of it — they need to know whether trying
       * again could help.
       */
      if (!response.ok || typeof body?.secure_url !== 'string') {
        throw new UploadError(
          response.status === 401 || response.status === 403
            ? 'The image service rejected the store’s credentials. Check the Cloudinary settings.'
            : 'The image service did not accept the upload. Try again in a moment.',
        );
      }

      return {
        url: body.secure_url,
        bytes: typeof body.bytes === 'number' ? body.bytes : bytes.length,
        format,
        provider: 'cloudinary',
      };
    },
  };
}

/** The configured provider. `loadEnv` has already refused a half-configured one. */
export function imageStorage(env: Env): ImageStorage {
  return env.UPLOAD_PROVIDER === 'cloudinary' ? cloudinaryStorage(env) : localStorage(env);
}
