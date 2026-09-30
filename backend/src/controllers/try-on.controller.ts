import type { Request, Response } from 'express';
import { createTryOn, tryOnStatus } from '../services/try-on/try-on.service';
import { AppError } from '../utils/AppError';
import {
  TRY_ON_CONSENT_HEADER,
  TRY_ON_CONSENT_VALUE,
  tryOnParamsSchema,
  tryOnQuerySchema,
} from '../validators/try-on.validator';

/**
 * Whether try-on is offered, and how many tries this customer has left today.
 *
 * Public, because the product page asks before it knows who is looking: a
 * guest learns only that the feature exists, and is asked to sign in.
 */
export async function getStatus(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await tryOnStatus(req.env, req.user?.id ?? null) });
}

/**
 * One try-on. The body is the customer's photo, raw.
 *
 * `no-store` on the answer, because the answer is a picture of a person: it
 * has no business in a shared cache, a proxy's disk or the browser's HTTP
 * cache after the page that asked for it is closed.
 */
export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Not authenticated', 401);

  if (req.get(TRY_ON_CONSENT_HEADER) !== TRY_ON_CONSENT_VALUE) {
    throw new AppError(
      'Confirm that this is a photo of you and that you agree to it being processed.',
      400,
    );
  }

  const { productRef } = tryOnParamsSchema.parse(req.params);
  const { colour } = tryOnQuerySchema.parse(req.query);
  const body: unknown = req.body;

  const result = await createTryOn(req.env, {
    userId: req.user.id,
    productRef,
    colour,
    photo: Buffer.isBuffer(body) ? body : Buffer.alloc(0),
  });

  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json({ success: true, data: result });
}
