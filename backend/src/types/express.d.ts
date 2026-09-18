import type { Env } from '../config/env';
import type { AuthenticatedUser } from './auth';

declare global {
  namespace Express {
    interface Request {
      /** Attached by `createApp` so handlers never reach for process.env. */
      env: Env;
      /** Present only after `requireAuth` has run. */
      user?: AuthenticatedUser;
    }
  }
}

export {};
