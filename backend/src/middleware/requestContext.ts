import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { withRequestId } from '../utils/request-store';

/**
 * Correlation and request logging.
 *
 * ## What one request produces
 *
 * Exactly one log record, written when the response ends, carrying the method,
 * the matched route, the status, how long it took, and the correlation id. If
 * the request failed, that same record carries the error. One record rather
 * than two — a "started" line and a "finished" line — because a start line is
 * only useful for requests that never finish, and those are already visible as
 * the absence of a completion.
 *
 * ## Why this is one middleware
 *
 * The id, the response header and the timer have to be established before
 * anything else can go wrong, including body parsing. Splitting them into three
 * middlewares would create three places in the chain whose order matters and
 * nothing to enforce it. Mounted first in `createApp`, this reads headers and
 * writes one response header; it never touches the body, which is what makes it
 * safe to sit ahead of the raw-body mount the Razorpay webhook depends on.
 */

/** The header read on the way in and written on the way out. */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * What an incoming correlation id may look like.
 *
 * Deliberately narrow. This value is attacker-controlled — anyone can put
 * anything in a header — and it ends up in every log line for the request, so
 * it is the single most direct log-injection vector the API has. The character
 * class admits UUIDs, ULIDs, base64url ids and the common tracing formats, and
 * admits no whitespace, no control characters and no punctuation a log parser
 * treats as structure.
 *
 * The length bounds matter as much as the characters: without an upper bound a
 * caller could put a megabyte in a header and have it written to disk on every
 * line. The lower bound rejects the ids that are too short to be unique, which
 * would silently collapse unrelated requests together.
 *
 * Anything that does not match is not rejected — the request is served
 * normally — it is simply **replaced** with a generated id. A malformed
 * correlation header is a client's problem to notice, and failing a customer's
 * checkout over it would be absurd.
 */
const ACCEPTABLE_REQUEST_ID = /^[A-Za-z0-9_.:-]{8,64}$/;

/**
 * Sixteen characters of base64url — 96 bits of randomness.
 *
 * Opaque by construction. It is not a JWT, not a session id, not an account id,
 * not an order number and not an address: a request id that carried any of
 * those would turn every log line and every error response into a disclosure,
 * and would let anyone holding one correlate a customer across requests.
 */
export const generateRequestId = (): string => randomBytes(12).toString('base64url');

export function resolveRequestId(header: unknown): string {
  return typeof header === 'string' && ACCEPTABLE_REQUEST_ID.test(header)
    ? header
    : generateRequestId();
}

/* ------------------------------------------------------------------ */
/* What gets logged, and at what level                                  */
/* ------------------------------------------------------------------ */

/**
 * Health is polled. By a load balancer, by a container runtime, by the deploy
 * smoke command — every few seconds, forever. At INFO that is the entire log.
 *
 * So a *successful* health check is DEBUG. A failing one is not: it keeps the
 * level its status earns, because the one time health matters is the time it
 * stops being boring.
 */
const QUIET_PATHS = new Set(['/api/health']);

/**
 * The full path, without the query string.
 *
 * `req.path` is relative to whatever router is handling the request, so inside
 * a mounted router it reports `/health` rather than `/api/health` — which reads
 * as a different endpoint in a log and, worse, would have made the quiet-path
 * check above silently never match. `originalUrl` is the path as the caller
 * sent it, and is the same string whether a router matched or nothing did.
 *
 * The query string is cut off deliberately. It is unbounded,
 * attacker-controlled, and on this API it carries search terms — a customer's
 * own words, which are not ZyCart's to keep in a log file.
 */
export function requestPath(originalUrl: string): string {
  const query = originalUrl.indexOf('?');
  return query === -1 ? originalUrl : originalUrl.slice(0, query);
}

export interface RequestOutcome {
  status: number;
  durationMs: number;
  slow: boolean;
  quiet: boolean;
  /** CORS preflight, which is chatter rather than traffic. */
  preflight: boolean;
}

/**
 * The level for a finished request.
 *
 * Exported and pure because this is the rule most likely to be argued about,
 * and an argument about a rule is much easier when the rule is one function
 * with tests on it.
 */
export function outcomeLevel(outcome: RequestOutcome): 'debug' | 'info' | 'warn' | 'error' {
  if (outcome.status >= 500) return 'error';
  // A 4xx is the client being told no. That is the API working, but it is also
  // the shape of an attack in progress, so it stays above the noise floor.
  if (outcome.status >= 400) return 'warn';
  // Succeeded, and took too long. The request is not a failure and is not
  // logged as one; the duration is the finding.
  if (outcome.slow) return 'warn';
  if (outcome.quiet || outcome.preflight) return 'debug';
  return 'info';
}

/**
 * The route pattern, when Express matched one.
 *
 * `/api/products/:idOrSlug`, not `/api/products/blue-linen-shirt`. The pattern
 * is what aggregates: a thousand product pages are one route with a latency
 * distribution, and a thousand distinct strings are a thousand rows nobody can
 * read. The concrete path is logged too, because during an incident the
 * specific one is the question.
 */
function matchedRoute(req: Request): string | undefined {
  const route = (req as { route?: { path?: unknown } }).route;
  if (!route || typeof route.path !== 'string') return undefined;

  return `${req.baseUrl}${route.path}`;
}

/* ------------------------------------------------------------------ */
/* The middleware                                                       */
/* ------------------------------------------------------------------ */

/**
 * Establishes the correlation id and logs the request when it ends.
 *
 * `slowRequestMs` is passed rather than read from the environment here, so this
 * module has no configuration of its own and the threshold stays defined in
 * exactly one place — `SLOW_REQUEST_MS` in `config/env.ts`.
 */
export function requestContext(slowRequestMs: number) {
  return function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req.get(REQUEST_ID_HEADER));

    req.requestId = requestId;
    req.log = logger.child({ requestId });

    // Set before anything downstream runs, so the id is on the response even
    // if the next middleware throws — and so a customer looking at a 500 has a
    // reference to quote.
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const startedAt = process.hrtime.bigint();

    /**
     * `finish` is the response completing. `close` is the socket going away,
     * which happens *instead* when a client disconnects mid-response — a
     * customer closing a tab during checkout, or a load balancer timing out.
     * Both are listened for, and the latch makes sure one request is one
     * record however it ended.
     */
    let recorded = false;

    const record = (aborted: boolean): void => {
      if (recorded) return;
      recorded = true;

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const rounded = Math.round(durationMs * 100) / 100;

      const path = requestPath(req.originalUrl);

      const outcome: RequestOutcome = {
        status: res.statusCode,
        durationMs: rounded,
        slow: rounded > slowRequestMs,
        quiet: QUIET_PATHS.has(path) && res.statusCode < 400,
        preflight: req.method === 'OPTIONS',
      };

      const level = outcomeLevel(outcome);

      req.log.log(level, res.statusCode >= 500 ? 'request_failed' : 'request_completed', {
        method: req.method,
        route: matchedRoute(req),
        path,
        status: res.statusCode,
        durationMs: rounded,
        // Present only when true, so the ordinary line stays short and a
        // search for `slow` finds only what is slow.
        slow: outcome.slow || undefined,
        slowThresholdMs: outcome.slow ? slowRequestMs : undefined,
        aborted: aborted || undefined,
        // Attached by `errorHandler`. Absent on every successful request.
        error: req.loggedError,
      });
    };

    res.on('finish', () => {
      record(false);
    });

    res.on('close', () => {
      record(true);
    });

    /**
     * Everything downstream runs inside the correlation scope.
     *
     * `next()` is called *within* `withRequestId`, so every middleware,
     * handler and service call that follows — through every `await` — can read
     * the id without being handed it. See `request-store.ts` for why that is
     * worth ambient state and why nothing else is allowed in it.
     */
    withRequestId(requestId, next);
  };
}
