import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { REQUEST_ID_HEADER, requestContext } from './middleware/requestContext';
import { apiRouter } from './routes';
import { LOCAL_UPLOAD_ROOT, LOCAL_UPLOAD_ROUTE } from './services/uploads/storage';

/** The paths whose bodies must survive as bytes. */
export const RAZORPAY_WEBHOOK_PATH = '/api/payments/razorpay/webhook';
export const CLERK_WEBHOOK_PATH = '/api/webhooks/clerk';

/** Builds the Express application. Startup concerns live in server.ts. */
export function createApp(env: Env): Express {
  const app = express();

  // Express only populates req.ip from X-Forwarded-For when it is told to trust
  // the proxy in front of it; without this the rate limiter would see one IP.
  app.set('trust proxy', 1);

  /**
   * First, and deliberately.
   *
   * It establishes the correlation id and starts the timer, so every record
   * this request produces carries the id — including the ones written when a
   * later middleware refuses the request. A malformed JSON body rejected by
   * `express.json()` is still a request somebody has to be able to find.
   *
   * Safe at this position because it reads two headers and writes one, and
   * never reads the body. The raw-body mount below is untouched: body-parser's
   * "already read" marking depends on the order of the *parsers*, and this is
   * not one.
   */
  app.use(requestContext(env.SLOW_REQUEST_MS));

  app.use(helmet());
  app.use(
    cors({
      origin: [env.CLIENT_URL],
      credentials: true,
      /**
       * Without this the browser can see the header but JavaScript cannot, and
       * the storefront would be unable to show a customer the reference that
       * the error response already contains. Exposing it discloses nothing:
       * the id is random and belongs to the request the caller just made.
       */
      //
      // `Content-Disposition` for the same reason, from Phase 18: the console's
      // subscriber export is a download, and without it a cross-origin browser
      // cannot read the file name the server chose.
      exposedHeaders: [REQUEST_ID_HEADER, 'Content-Disposition'],
    }),
  );

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

  // Clerk's webhooks are signed the same way, through Svix, and for the same
  // reason must be verified against the bytes that arrived.
  app.use(CLERK_WEBHOOK_PATH, express.raw({ type: '*/*', limit: '1mb' }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Hands the validated config to handlers, so nothing downstream reads
  // process.env or has to be built as a factory just to see configuration.
  app.use((req, _res, next) => {
    req.env = env;
    next();
  });

  /**
   * Images stored by the local upload provider (Phase 18).
   *
   * Mounted only when that provider is in use, so a Cloudinary deployment has
   * no route that serves files off its own disk at all. The headers are the
   * point: `Cross-Origin-Resource-Policy: cross-origin` lets the storefront on
   * another port render them (Helmet's default would block it), and a
   * `sandbox` CSP means that even a file that somehow was not an image could
   * run nothing if it were opened directly. No directory listings, no dotfiles.
   */
  if (env.UPLOAD_PROVIDER === 'local') {
    app.use(
      LOCAL_UPLOAD_ROUTE,
      express.static(LOCAL_UPLOAD_ROOT, {
        index: false,
        dotfiles: 'deny',
        immutable: true,
        maxAge: '30d',
        setHeaders(res) {
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        },
      }),
    );
  }

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
