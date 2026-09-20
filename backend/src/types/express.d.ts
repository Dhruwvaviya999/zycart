import type { Env } from '../config/env';
import type { AuthenticatedUser } from './auth';
import type { Logger, SerializedError } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      /** Attached by `createApp` so handlers never reach for process.env. */
      env: Env;
      /** Present only after `requireAuth` has run. */
      user?: AuthenticatedUser;
      /**
       * The correlation id for this request (Phase 16).
       *
       * Opaque, generated per request unless the caller supplied a well-formed
       * `X-Request-Id`, and returned on the response under the same header. It
       * is not derived from anything — not the session, not the account, not
       * the address the request came from — so it identifies a request and
       * nothing else.
       */
      requestId: string;
      /** `logger` with `requestId` already bound. Use it inside a request. */
      log: Logger;
      /**
       * Set by `errorHandler` so the one request record can carry the fault.
       *
       * The error is logged where the request is logged, once, rather than in
       * two places that would have to be correlated by timestamp.
       */
      loggedError?: SerializedError;
    }
  }
}

export {};
