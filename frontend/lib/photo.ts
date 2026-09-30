/**
 * Getting a customer's photo ready to leave their device.
 *
 * ## Why it is redrawn rather than sent as chosen
 *
 * Three reasons, and the third is the one that matters most.
 *
 * 1. **Size.** A phone photo is 3–12 MB and 4,000 pixels across. The image
 *    model works at around a megapixel, so the rest is bandwidth the customer
 *    pays for and latency they wait through, for nothing.
 * 2. **Format.** Whatever was chosen, what leaves is a JPEG — one of the three
 *    formats the server accepts — so a PNG screenshot or a WebP works as well
 *    as a camera photo.
 * 3. **Metadata.** A camera JPEG carries EXIF: the GPS coordinates of where it
 *    was taken, the device, the time. Drawing the pixels onto a canvas and
 *    encoding the canvas keeps the picture and nothing else, so a photo taken
 *    at home never tells anybody where home is.
 *
 * Orientation is applied while decoding (`imageOrientation: 'from-image'`), so
 * a portrait photo is not sent sideways once the EXIF that rotated it is gone.
 */

/** The longest side sent, in pixels. Enough for the model; far less than a camera makes. */
const MAX_EDGE = 1536;

/** Photos smaller than this across are too small to put anything on convincingly. */
export const MIN_EDGE = 256;

export class PhotoError extends Error {}

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) {
    throw new PhotoError('Choose a photo — JPEG, PNG or WebP.');
  }

  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Most often an iPhone HEIC opened in a browser that cannot decode it.
    throw new PhotoError('This photo could not be opened here. Try a JPEG or PNG.');
  }

  try {
    if (Math.min(bitmap.width, bitmap.height) < MIN_EDGE) {
      throw new PhotoError('This photo is too small. Use one at least 256 pixels across.');
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new PhotoError('This browser could not prepare the photo.');

    // A transparent PNG would otherwise turn black when flattened to JPEG.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );

    if (!blob) throw new PhotoError('This browser could not prepare the photo.');

    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
