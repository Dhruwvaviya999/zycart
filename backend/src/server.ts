import 'dotenv/config';
import mongoose from 'mongoose';

import { connectDatabase } from './config/database';
import { aiConfig, aiUnavailableReason } from './config/ai';
import { loadEnv, razorpayConfig } from './config/env';
import { appOrigin, emailConfig } from './config/notifications';
import { createApp } from './app';

const env = loadEnv();
const app = createApp(env);

/**
 * Reuse the MongoDB connection across requests handled by the same
 * Vercel/Node instance.
 */
let databasePromise: Promise<void> | null = null;

async function ensureDatabase(): Promise<void> {
  // Already connected.
  if (mongoose.connection.readyState === 1) {
    return;
  }

  // A connection attempt is already in progress.
  if (databasePromise) {
    await databasePromise;
    return;
  }

  databasePromise = connectDatabase(env.MONGODB_URI).catch((error) => {
    // Allow the next request to retry if the connection attempt failed.
    databasePromise = null;
    throw error;
  });

  await databasePromise;
}

/**
 * Vercel entrypoint.
 *
 * The database is connected before Express handles the request.
 */
async function handler(
  req: Parameters<typeof app>[0],
  res: Parameters<typeof app>[1],
): Promise<void> {
  try {
    await ensureDatabase();
    app(req, res);
  } catch (error) {
    console.error(
      `Database initialization failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable',
      });
    }
  }
}

/**
 * Local development.
 *
 * Vercel does not use this listener. Locally we preserve the existing
 * `pnpm dev` behaviour.
 */
if (!process.env.VERCEL) {
  ensureDatabase()
    .then(() => {
      app.listen(env.PORT, () => {
        console.log(
          `Server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`,
        );
        console.log(
          `Health check: http://localhost:${env.PORT}/api/health`,
        );
        console.log(`CORS origin: ${env.CLIENT_URL}`);

        const razorpay = razorpayConfig(env);

        if (razorpay) {
          const mode = razorpay.keyId.startsWith('rzp_live_')
            ? 'LIVE'
            : 'test';

          console.log(`Razorpay: ${mode} mode (${razorpay.keyId})`);
          console.log(
            `Webhook endpoint: POST /api/payments/razorpay/webhook`,
          );
        } else {
          console.warn(
            'Razorpay: not configured - online payment is unavailable and checkout offers cash on delivery only.',
          );
        }

        const ai = aiConfig(env);

        if (ai) {
          console.log(`ZyCart AI: ${ai.provider} (${ai.model})`);
        } else {
          console.warn(
            `ZyCart AI: not configured - the assistant is unavailable (${
              aiUnavailableReason(env) ?? 'unknown'
            }).`,
          );
        }

        const email = emailConfig(env);

        if (email.provider === 'smtp') {
          console.log(
            `Transactional email: SMTP via ${
              email.smtp?.host ?? 'unknown host'
            }:${String(email.smtp?.port ?? '')} as ${
              email.fromName
            } <${email.fromAddress}>`,
          );
        } else {
          console.warn(
            'Transactional email: mock provider - messages are rendered and recorded, and nothing is delivered.',
          );
        }

        console.log(`Email links point at: ${appOrigin(env)}`);
      });
    })
    .catch((error: unknown) => {
      console.error(
        `Startup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      process.exit(1);
    });
}

export default handler;