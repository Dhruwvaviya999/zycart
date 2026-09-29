import type { Request, Response } from 'express';
import { sniffImage } from '../services/uploads/image-sniff';
import { imageStorage, UploadError } from '../services/uploads/storage';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

/**
 * Stores one product image and answers with its URL.
 *
 * The body is the image itself — `Content-Type: image/…`, raw bytes — rather
 * than a multipart form. One file per request keeps the parser a single line
 * of Express, needs no multipart dependency, and gives every file its own
 * size limit and its own error.
 *
 * Nothing is attached to a product here. The URL goes back to the product form,
 * and becomes part of the catalogue only when the administrator saves the
 * product — which is the change the audit trail records.
 */
export async function uploadImage(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;

  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new AppError(
      'Send the image itself as the request body, with an image content type.',
      400,
    );
  }

  const format = sniffImage(body);

  if (!format) {
    // The declared type, not the bytes: it is what the uploader claimed, and
    // it is enough to recognise a misconfigured client in the log.
    logger.warn('upload_rejected', {
      reason: 'unrecognised_format',
      declaredType: req.headers['content-type'] ?? 'none',
      bytes: body.length,
    });

    throw new AppError('Only JPEG, PNG, WebP, GIF and AVIF images can be uploaded.', 415);
  }

  try {
    const stored = await imageStorage(req.env).store(body, format);

    logger.info('upload_stored', {
      provider: stored.provider,
      format: stored.format,
      bytes: stored.bytes,
    });

    res.status(201).json({ success: true, data: stored });
  } catch (error) {
    if (error instanceof UploadError) throw new AppError(error.message, error.statusCode);
    throw error;
  }
}
