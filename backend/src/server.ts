import 'dotenv/config';
import { connectDatabase } from './config/database';
import { aiConfig, aiUnavailableReason } from './config/ai';
import { loadEnv, razorpayConfig } from './config/env';
import { createApp } from './app';

async function bootstrap(): Promise<void> {
  const env = loadEnv();

  await connectDatabase(env.MONGODB_URI);

  const app = createApp(env);

  app.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    console.log(`Health check: http://localhost:${env.PORT}/api/health`);
    console.log(`CORS origin: ${env.CLIENT_URL}`);

    /**
     * Stated at startup, because "payments are off" must never be something an
     * operator discovers from a customer. Half-configured credentials do not
     * reach here at all — env validation refuses to boot on those.
     *
     * The key id is printed; it is the same value the browser receives. Neither
     * secret is printed, here or anywhere else.
     */
    const razorpay = razorpayConfig(env);

    if (razorpay) {
      const mode = razorpay.keyId.startsWith('rzp_live_') ? 'LIVE' : 'test';
      console.log(`Razorpay: ${mode} mode (${razorpay.keyId})`);
      console.log(`Webhook endpoint: POST /api/payments/razorpay/webhook`);
    } else {
      console.warn(
        'Razorpay: not configured - online payment is unavailable and checkout offers cash on delivery only.',
      );
      console.warn(
        '  Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET in backend/.env to enable it.',
      );
    }

    /**
     * Same rule as Razorpay: whether a customer-facing feature is on must be
     * something an operator reads here, not something they learn from a
     * shopper. The model name is printed because it is a configuration choice;
     * AI_API_KEY is not, here or anywhere else.
     */
    const ai = aiConfig(env);

    if (ai) {
      console.log(`ZyCart AI: ${ai.provider} (${ai.model})`);
    } else {
      console.warn(
        `ZyCart AI: not configured - the assistant is unavailable (${aiUnavailableReason(env) ?? 'unknown'}).`,
      );
      console.warn('  The storefront is unaffected. Set AI_API_KEY in backend/.env to enable it.');
    }
  });
}

bootstrap().catch((error: unknown) => {
  console.error(`Startup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
