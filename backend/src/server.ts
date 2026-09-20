import 'dotenv/config';
import { connectDatabase } from './config/database';
import { aiConfig, aiUnavailableReason } from './config/ai';
import { loadEnv, razorpayConfig } from './config/env';
import { appOrigin, emailConfig } from './config/notifications';
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

    /**
     * The mail transport, stated plainly at startup.
     *
     * Same rule as Razorpay and the assistant: whether a customer-facing
     * feature is real must be something an operator reads here, not something
     * they infer from a support ticket. The provider name, the sender address
     * and the SMTP host are printed because they are configuration choices an
     * operator needs to confirm; SMTP_USER and SMTP_PASSWORD are not printed,
     * here or anywhere else.
     *
     * The mock provider is a warning rather than a refusal. A store with no
     * mail server is a legitimate deployment — post-purchase events are still
     * recorded, and every delivery row and every admin screen says the
     * transport was `mock` — whereas refusing to boot the whole shop over an
     * unconfigured mailbox would take the store down for a subsidiary feature.
     */
    const email = emailConfig(env);

    if (email.provider === 'smtp') {
      console.log(
        `Transactional email: SMTP via ${email.smtp?.host ?? 'unknown host'}:` +
          `${String(email.smtp?.port ?? '')} as ${email.fromName} <${email.fromAddress}>`,
      );
    } else {
      console.warn(
        'Transactional email: mock provider - messages are rendered and recorded, and nothing ' +
          'is delivered.',
      );
      console.warn(
        '  Set EMAIL_PROVIDER=smtp with SMTP_HOST, SMTP_USER, SMTP_PASSWORD and ' +
          'EMAIL_FROM_ADDRESS in backend/.env to send real mail.',
      );
    }

    // The origin every link in an email is built from. Printed because an email
    // pointing at localhost is a mistake that is invisible until it is in an
    // inbox, and printing it is the cheapest possible way to catch it.
    console.log(`Email links point at: ${appOrigin(env)}`);
  });
}

bootstrap().catch((error: unknown) => {
  console.error(`Startup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
