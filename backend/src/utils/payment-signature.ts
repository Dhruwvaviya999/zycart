import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The two HMAC checks that stand between ZyCart and a forged payment.
 *
 * Razorpay signs both the checkout response and every webhook with HMAC-SHA256
 * under a secret only the server holds. Verifying them is the only reason to
 * believe a payment happened: the browser saying "success" is a claim, and a
 * POST arriving at the webhook URL is a claim. A matching signature is proof.
 *
 * Both comparisons are constant-time. A `===` on a hex digest leaks how much of
 * a guess was correct through its timing, which is enough to forge a signature
 * byte by byte given enough attempts.
 */

/** HMAC-SHA256 of `payload` under `secret`, lowercase hex, as Razorpay computes it. */
function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Constant-time comparison of two hex digests.
 *
 * `timingSafeEqual` throws on a length mismatch, which would itself be a timing
 * signal, so the length is checked first and both paths cost the same for any
 * input of the expected length. A non-hex or wrong-length candidate is simply
 * not equal.
 */
function safeEqualHex(candidate: string, expected: string): boolean {
  if (typeof candidate !== 'string' || candidate.length !== expected.length) return false;

  const candidateBytes = Buffer.from(candidate, 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');

  // A malformed hex string decodes short; it cannot be a valid digest.
  if (candidateBytes.length !== expectedBytes.length || candidateBytes.length === 0) return false;

  return timingSafeEqual(candidateBytes, expectedBytes);
}

/**
 * Verifies the signature Razorpay Checkout hands back to the browser.
 *
 * The signed payload is `order_id|payment_id`, keyed with the API secret. Only
 * Razorpay and this server can produce it, so a match means these two ids were
 * genuinely issued together — not that the payment is captured, which is a
 * separate question answered against the API.
 *
 * @see https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/build-integration/#validate-payment-signature
 */
export function verifyCheckoutSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
  keySecret: string;
}): boolean {
  const { razorpayOrderId, razorpayPaymentId, signature, keySecret } = params;

  if (!razorpayOrderId || !razorpayPaymentId || !signature) return false;

  return safeEqualHex(signature, sign(`${razorpayOrderId}|${razorpayPaymentId}`, keySecret));
}

/**
 * Verifies the `X-Razorpay-Signature` header on a webhook.
 *
 * The signed payload is the **raw request body, byte for byte**, keyed with the
 * webhook secret — which is a different secret from the API key secret. This
 * takes a `Buffer` rather than a string precisely so that nothing between the
 * socket and here can have re-encoded it: `JSON.parse` followed by
 * `JSON.stringify` reorders keys and rewrites whitespace, and the signature
 * would never match again.
 *
 * @see https://razorpay.com/docs/webhooks/validate-test/
 */
export function verifyWebhookSignature(params: {
  rawBody: Buffer;
  signature: string;
  webhookSecret: string;
}): boolean {
  const { rawBody, signature, webhookSecret } = params;

  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || !signature) return false;

  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  return safeEqualHex(signature, expected);
}
