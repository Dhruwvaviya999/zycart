/**
 * What an uploaded file actually is, read from its first bytes.
 *
 * ## Why the declared type is ignored
 *
 * A `Content-Type` header, a file name and an extension are all things the
 * uploader chose. A file called `shoe.png` sent as `image/png` can be an HTML
 * page with a script in it, and served back from ZyCart's origin with the type
 * it claimed, it would be a stored-XSS hole with the store's name on it. So the
 * type is decided here, from the file's own magic number, and the stored file
 * takes the extension this function names — nothing the client said survives.
 *
 * ## Why SVG is not on the list
 *
 * SVG is XML and may carry `<script>`. Sanitising it is a project; refusing it
 * is a line. Product photography is raster in any case.
 */

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'avif';

export const IMAGE_MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

export const IMAGE_EXTENSION: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  avif: 'avif',
};

/**
 * The largest image accepted, in bytes.
 *
 * Five megabytes is more than any product photo needs once it is resized for
 * the web, and small enough that an upload cannot be used to exhaust the
 * memory of a process that buffers it.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ascii = (bytes: Buffer, start: number, end: number): string =>
  bytes.subarray(start, end).toString('latin1');

/** The format of these bytes, or null when they are not an image this store accepts. */
export function sniffImage(bytes: Buffer): ImageFormat | null {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';

  if (
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 4) === 'PNG' &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }

  const gif = ascii(bytes, 0, 6);
  if (gif === 'GIF87a' || gif === 'GIF89a') return 'gif';

  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';

  // ISO base media: a box size, then `ftyp`, then the brand.
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }

  return null;
}
