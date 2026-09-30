/**
 * Reading an image model's answer.
 *
 * Pure, and written against the shape of the response rather than the SDK's
 * class, so it can be tested with plain objects and does not care which
 * vendor's client produced them. Only `gemini-image.provider.ts` imports the
 * SDK itself.
 */

/** An image as bytes the API can carry: base64, with its type. */
export interface InlineImage {
  mimeType: string;
  data: string;
}

export type TryOnOutcome =
  | { kind: 'image'; image: InlineImage }
  /** The model declined — a safety filter, or an image it will not edit. */
  | { kind: 'refused'; reason: string }
  /** An answer with no image in it and no stated refusal. */
  | { kind: 'empty' };

/** The parts of a response this reader looks at. Structural, so the SDK's type satisfies it. */
export interface ImageModelResponse {
  candidates?: {
    finishReason?: string;
    content?: {
      parts?: {
        inlineData?: { mimeType?: string; data?: string };
        thought?: boolean;
      }[];
    };
  }[];
  promptFeedback?: { blockReason?: string };
}

/**
 * Finish reasons that mean "no, on purpose".
 *
 * The same family the assistant's Gemini provider maps to a refusal, plus the
 * image-specific ones. Anything else with no image is merely empty.
 */
const REFUSALS = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'IMAGE_SAFETY',
  'IMAGE_PROHIBITED_CONTENT',
  'IMAGE_RECITATION',
  'RECITATION',
  'IMAGE_OTHER',
]);

/**
 * The finished image, or why there is none.
 *
 * ## Why the last image, and never a thought
 *
 * Image models that reason can return interim images marked `thought: true`
 * before the one they settle on. Those are drafts, not the answer, so they are
 * skipped, and of what remains the last image is the model's final word.
 * Accompanying text is ignored: this feature shows a picture, and a model's
 * commentary on its own edit is nothing a customer asked for.
 */
export function readTryOnResponse(response: ImageModelResponse): TryOnOutcome {
  const blocked = response.promptFeedback?.blockReason;
  if (blocked) return { kind: 'refused', reason: blocked };

  const candidate = response.candidates?.[0];

  const images = (candidate?.content?.parts ?? []).filter(
    (part) =>
      part.thought !== true &&
      typeof part.inlineData?.data === 'string' &&
      part.inlineData.data.length > 0 &&
      (part.inlineData.mimeType ?? '').startsWith('image/'),
  );

  const final = images[images.length - 1]?.inlineData;

  if (final?.data && final.mimeType) {
    return { kind: 'image', image: { mimeType: final.mimeType, data: final.data } };
  }

  const reason = candidate?.finishReason;
  if (reason && REFUSALS.has(reason)) return { kind: 'refused', reason };

  return { kind: 'empty' };
}
