import { GoogleGenAI } from '@google/genai';
import type { TryOnConfig } from '../../config/try-on';
import type { TryOnImageGenerator } from '../try-on/generator';
import { readTryOnResponse } from '../try-on/response';
import { toProviderError, withTimeout } from './gemini.provider';

/**
 * Virtual try-on through a Gemini image model (Phase 19).
 *
 * The one place a try-on reaches Google. It sends three things — the
 * instruction, the customer's photo and the product photo — and hands back
 * whatever `readTryOnResponse` makes of the answer. It keeps nothing: no
 * image, no prompt, no response is logged or stored here, and the SDK is
 * given no file-upload or caching option that would leave a copy at Google
 * beyond the request itself.
 */

export function createGeminiTryOnGenerator(config: TryOnConfig): TryOnImageGenerator {
  const client = new GoogleGenAI({ apiKey: config.apiKey });

  return {
    async generate({ prompt, person, product }) {
      try {
        const response = await client.models.generateContent({
          model: config.model,
          contents: [
            {
              role: 'user',
              // Images first, then the words that refer to them by position.
              parts: [
                { inlineData: { mimeType: person.mimeType, data: person.data } },
                { inlineData: { mimeType: product.mimeType, data: product.data } },
                { text: prompt },
              ],
            },
          ],
          config: {
            // Text is allowed alongside the image because some image models
            // refuse an image-only modality; any text is discarded on the way
            // out, by `readTryOnResponse`.
            responseModalities: ['TEXT', 'IMAGE'],
            abortSignal: withTimeout(undefined, config.timeoutMs),
          },
        });

        return readTryOnResponse(response);
      } catch (error) {
        throw toProviderError(error);
      }
    },
  };
}
