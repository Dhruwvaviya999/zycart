import type { TryOnConfig } from '../../config/try-on';
import { createCloudflareTryOnGenerator } from '../ai/cloudflare-image.provider';
import { createGeminiTryOnGenerator } from '../ai/gemini-image.provider';
import type { InlineImage, TryOnOutcome } from './response';

/**
 * Who renders a try-on, behind one shape.
 *
 * The service decides everything that is ZyCart's — eligibility, the photo,
 * the allowance, the instruction — and hands a generator three things: the
 * instruction, the customer's photo and the product photo. A generator sends
 * them to its model and says what came back. Neither provider keeps anything:
 * no image, no prompt and no response is logged or stored by either.
 */

export interface TryOnRequest {
  prompt: string;
  person: InlineImage;
  product: InlineImage;
}

/**
 * The seam the try-on service calls.
 *
 * A parameter with a production default, for the reason `PaymentGatewayReads`
 * is one: the service's rules — eligibility, the daily allowance, giving a try
 * back when no picture came out — can then be exercised with a stub, without a
 * call to an image model. Nothing reachable over HTTP can supply one.
 */
export interface TryOnImageGenerator {
  generate(request: TryOnRequest): Promise<TryOnOutcome>;
}

/** The configured provider's generator. */
export function createTryOnGenerator(config: TryOnConfig): TryOnImageGenerator {
  return config.provider === 'cloudflare'
    ? createCloudflareTryOnGenerator(config)
    : createGeminiTryOnGenerator(config);
}
