import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../utils/AppError';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

/**
 * A deliberately small fixed-window limiter for the credential endpoints.
 *
 * It keeps counters in this process's memory, which is the right size of
 * solution for a single-instance deployment and nothing more: behind a load
 * balancer each instance would count separately, so a horizontally scaled
 * deployment needs a shared store instead. That trade is documented rather than
 * pre-solved, because shared infrastructure is not warranted yet.
 */
export function rateLimit({ windowMs, max, message }: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();

    // Sweep on write rather than on a timer, so an idle process holds nothing.
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }

    const key = `${req.ip ?? 'unknown'}:${req.path}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return next(new AppError(message ?? 'Too many attempts. Please try again shortly.', 429));
    }

    next();
  };
}
