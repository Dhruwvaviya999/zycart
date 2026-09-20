import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';

/** The one path whose body must survive as bytes. */
export const RAZORPAY_WEBHOOK_PATH = '/api/payments/razorpay/webhook';

/** Builds the Express application. Startup concerns live in server.ts. */
export function createApp(env: Env): Express {
  const app = express();

  // Express only populates req.ip from X-Forwarded-For when it is told to trust
  // the proxy in front of it; without this the rate limiter would see one IP.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: [env.CLIENT_URL], credentials: true }));

  /**
   * The Razorpay webhook body, kept as raw bytes.
   *
   * Razorpay signs the exact payload it sends, so the signature can only be
   * verified against those bytes. `express.json()` would hand the handler an
   * object, and re-serialising it reorders keys and rewrites whitespace — the
   * HMAC would never match again, and the endpoint would either reject every
   * genuine webhook or, far worse, be "fixed" by skipping verification.
   *
   * Scoped to the one path and mounted ahead of the global parser. Body-parser
   * marks a request once it has read the body, so `express.json()` below sees
   * this request as already handled and leaves it alone — every other route
   * keeps normal JSON parsing.
   */
  app.use(RAZORPAY_WEBHOOK_PATH, express.raw({ type: '*/*', limit: '1mb' }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Hands the validated config to handlers, so nothing downstream reads
  // process.env or has to be built as a factory just to see configuration.
  app.use((req, _res, next) => {
    req.env = env;
    next();
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
