import { z } from 'zod';

/** The product being tried on: an id or a slug, as the product page has it. */
export const tryOnParamsSchema = z.object({
  productRef: z.string().trim().min(1).max(200),
});

/**
 * The query beside the photo.
 *
 * Only the colourway travels here — the product, its name, its photo and the
 * instruction to the model are all read or written on the server. There is no
 * field through which a client can hand the model a prompt of its own.
 */
export const tryOnQuerySchema = z
  .object({
    colour: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

/**
 * The customer's statement that this is their own photo and that they agree to
 * it being processed.
 *
 * Sent as a header because the body is the photo itself. Required rather than
 * assumed: the storefront collects it with a checkbox, and a client that
 * skipped the step — by mistake or otherwise — is refused rather than trusted.
 */
export const TRY_ON_CONSENT_HEADER = 'x-try-on-consent';
export const TRY_ON_CONSENT_VALUE = 'granted';
