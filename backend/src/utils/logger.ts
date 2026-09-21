import { LOG_EVENTS, type LogEvent } from './log-events';
import { REDACTED, sanitizeFields, scrubString, type SafeValue } from './redact';
import { currentRequestId } from './request-store';

/**
 * ZyCart's structured log.
 *
 * ## What this is
 *
 * One JSON object per line, on stdout and stderr, and nothing else. No file, no
 * database, no network. That is the entire design, and every part of it is a
 * deliberate refusal:
 *
 *  - **No file.** A log file is a disk that fills, a rotation policy to get
 *    wrong, and a thing that does not exist on the platform this deploys to.
 *    The process writes to its standard streams and whatever runs it decides
 *    where they go — which is the one arrangement that works identically under
 *    `pnpm dev`, under a systemd unit, in a container and on Vercel.
 *
 *  - **No database.** Logging to MongoDB would mean that losing the database —
 *    the single most likely serious incident — also loses the record of it.
 *    Diagnostics must not share a failure domain with the thing being
 *    diagnosed.
 *
 *  - **No remote sink.** An HTTP call inside a log statement puts a third
 *    party's latency on ZyCart's request path and a third party's availability
 *    on ZyCart's. Shipping logs somewhere is a deployment's job, done by
 *    reading these streams.
 *
 * ## The contract
 *
 *     logger.info('payment_finalized', { orderNumber, requestId })
 *
 * An event name from the closed list in `log-events.ts`, then fields. The event
 * is positional and required because a log line whose event has to be inferred
 * from its message is a log line nobody can aggregate; the fields are a flat
 * bag because a log line is a row, not a document.
 *
 * ## Safety
 *
 * Everything written goes through `sanitize` (see `redact.ts`) — key-name
 * redaction, registered-secret replacement, PII masking, control-character
 * removal, depth and length bounds. There is no way to call this module that
 * skips it, which is the point: a redaction policy enforced by convention has
 * already failed.
 *
 * ## Cost
 *
 * A record below the configured level costs one integer comparison and
 * allocates nothing, because the fields object is built by the caller only
 * after the level check — so `logger.debug` on a hot path is free in
 * production. A record that is written costs one synchronous `write` to a
 * stream the runtime buffers. Nothing here awaits anything, and no caller ever
 * waits on a log.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Ordered, so "at least this severe" is a comparison rather than a lookup. */
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const LOG_LEVEL_NAMES = Object.keys(LEVEL_ORDER) as LogLevel[];

export const isLogLevel = (value: unknown): value is LogLevel =>
  typeof value === 'string' && value in LEVEL_ORDER;

/** Fields accompanying an event. Values are sanitised; keys are not invented. */
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(event: LogEvent, fields?: LogFields): void;
  info(event: LogEvent, fields?: LogFields): void;
  warn(event: LogEvent, fields?: LogFields): void;
  error(event: LogEvent, fields?: LogFields): void;
  /** Emits at a level decided at run time — used by the request logger. */
  log(level: LogLevel, event: LogEvent, fields?: LogFields): void;
  /** A logger that stamps `fields` onto everything it writes. */
  child(fields: LogFields): Logger;
  /** Whether a record at this level would be written at all. */
  enabled(level: LogLevel): boolean;
}

/**
 * Where a finished line goes.
 *
 * A seam, and the only one. Tests capture lines through it; production binds it
 * to the standard streams. Nothing else in the codebase may write a log line by
 * another route.
 */
export type LogSink = (level: LogLevel, line: string) => void;

export interface LoggerConfig {
  level: LogLevel;
  /**
   * `json` for one machine-readable object per line — the production format,
   * and the only one anything should ever parse.
   *
   * `text` for a short, aligned, human line. It carries exactly the same
   * fields; it is not a "more detailed" mode, and nothing decides what to log
   * based on which one is active.
   */
  format: 'json' | 'text';
  /** Names the emitting process in every record. */
  service: string;
}

const DEFAULT_CONFIG: LoggerConfig = { level: 'info', format: 'json', service: 'zycart-api' };

/* ------------------------------------------------------------------ */
/* Error serialisation                                                  */
/* ------------------------------------------------------------------ */

export interface SerializedError {
  name: string;
  message: string;
  /** Mongo's numeric code, a Node `code`, or an `AppError`'s HTTP status. */
  code?: string | number;
  statusCode?: number;
  /** Trimmed, and only at `error` level. See below. */
  stack?: string;
}

/** How many frames are worth keeping. The top of a stack is where the fault is. */
const STACK_FRAMES = 8;

/**
 * One error, reduced to what a responder needs and nothing that would leak.
 *
 * ## Why not just log the error
 *
 * Because an error is an object with whatever the library that threw it decided
 * to attach. An Axios error carries the request config, headers included — so
 * `logger.error('…', { error })` on a failed outbound call publishes an
 * `Authorization` header. A Mongo error can carry the connection string. A
 * nodemailer error can quote the credentials it just tried.
 *
 * So errors are never sanitised generically. They are read for four named
 * fields, and everything else is dropped. `redact.ts` reinforces this: any
 * `Error` reached through ordinary field sanitisation collapses to
 * `"name: message"` rather than being walked.
 *
 * ## The stack
 *
 * Kept for `error`, dropped below it. A stack is the most useful field in an
 * incident and the noisiest one everywhere else, and a warning that resolved
 * itself does not need eighty frames on disk. It never reaches a client — see
 * `errorHandler`.
 */
export function serializeError(error: unknown, options: { stack?: boolean } = {}): SerializedError {
  if (!(error instanceof Error)) {
    return { name: 'NonError', message: scrubString(String(error)) };
  }

  const candidate = error as Error & { code?: unknown; statusCode?: unknown };

  const out: SerializedError = {
    name: error.name,
    message: scrubString(error.message),
  };

  if (typeof candidate.code === 'string' || typeof candidate.code === 'number') {
    out.code = candidate.code;
  }

  if (typeof candidate.statusCode === 'number') out.statusCode = candidate.statusCode;

  if (options.stack && typeof error.stack === 'string') {
    out.stack = scrubString(
      error.stack.split('\n').slice(0, STACK_FRAMES + 1).join(' | '),
    );
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Writing                                                              */
/* ------------------------------------------------------------------ */

/**
 * The reserved field names, in the order they are written.
 *
 * Fixed first so every record starts the same way and a reader — human or
 * `jq` — finds the same four things in the same place. A caller cannot
 * overwrite them: `event` is the argument, and `timestamp`, `level` and
 * `service` are stamped after the caller's fields are merged.
 */
interface BaseRecord {
  timestamp: string;
  level: LogLevel;
  event: LogEvent;
  service: string;
}

const TEXT_COLUMN = 28;

/** The human format: level, event, then `key=value` pairs. Still one line. */
function formatText(base: BaseRecord, fields: Record<string, SafeValue>): string {
  const pairs = Object.entries(fields)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ');

  const head = `${base.timestamp} ${base.level.toUpperCase().padEnd(5)} ${base.event.padEnd(
    TEXT_COLUMN,
  )}`;

  return pairs ? `${head} ${pairs}` : head.trimEnd();
}

/**
 * Builds the writer for one configuration.
 *
 * Separated from `Logger` so `child` can share it: a child holds bound fields
 * and delegates, rather than re-reading configuration on every call.
 */
function createWriter(config: LoggerConfig, sink: LogSink) {
  return (level: LogLevel, event: LogEvent, fields: Record<string, SafeValue>): void => {
    const base: BaseRecord = {
      // ISO-8601, UTC, always. A locale-formatted timestamp in a log is a
      // timestamp two people reading the same incident will disagree about.
      timestamp: new Date().toISOString(),
      level,
      event,
      service: config.service,
    };

    /**
     * The ambient correlation id, for the lines written too deep to have been
     * handed one. A caller that supplied `requestId` explicitly — a child
     * logger, or the request record itself — wins, because it was chosen.
     */
    const requestId = currentRequestId();
    const correlated =
      requestId !== undefined && fields.requestId === undefined
        ? { requestId, ...fields }
        : fields;

    sink(
      level,
      config.format === 'json'
        ? JSON.stringify({ ...base, ...correlated })
        : formatText(base, correlated),
    );
  };
}

/* ------------------------------------------------------------------ */
/* The logger                                                           */
/* ------------------------------------------------------------------ */

export function createLogger(
  overrides: Partial<LoggerConfig> = {},
  sink: LogSink = processSink,
): Logger {
  const config: LoggerConfig = { ...DEFAULT_CONFIG, ...overrides };
  const write = createWriter(config, sink);
  const threshold = LEVEL_ORDER[config.level];

  const build = (bound: Record<string, SafeValue>): Logger => {
    const log = (level: LogLevel, event: LogEvent, fields?: LogFields): void => {
      if (LEVEL_ORDER[level] < threshold) return;

      write(level, event, fields ? { ...bound, ...sanitizeFields(fields) } : bound);
    };

    return {
      debug: (event, fields) => {
        log('debug', event, fields);
      },
      info: (event, fields) => {
        log('info', event, fields);
      },
      warn: (event, fields) => {
        log('warn', event, fields);
      },
      error: (event, fields) => {
        log('error', event, fields);
      },
      log,
      child: (fields) => build({ ...bound, ...sanitizeFields(fields) }),
      enabled: (level) => LEVEL_ORDER[level] >= threshold,
    };
  };

  return build({});
}

/**
 * stdout for the ordinary, stderr for the wrong.
 *
 * The split exists so that a deployment can route the two differently and so
 * that `2>/dev/null` on a console does what a reader expects. `warn` counts as
 * wrong: a warning ZyCart emits is always something an operator may need to
 * act on — a slow request, a rejected webhook, a stale delivery.
 */
const processSink: LogSink = (level, line) => {
  const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
};

/* ------------------------------------------------------------------ */
/* The process logger                                                   */
/* ------------------------------------------------------------------ */

/**
 * The shared instance.
 *
 * Mutable behind a stable export: callers hold `logger`, and `configureLogger`
 * swaps what it delegates to. The alternative — passing a logger through every
 * service signature — would have meant touching every function in the
 * repository to add observability to eight of them, and would have made the one
 * call site that could not reach a logger fall back to `console` and escape
 * redaction.
 */
let current = createLogger();

/**
 * Applies validated configuration, once, at startup.
 *
 * Secrets are registered separately by `configureObservability` in
 * `config/logging.ts`, which is the only place that has both the environment
 * and the licence to read it.
 */
export function configureLogger(overrides: Partial<LoggerConfig>, sink?: LogSink): void {
  current = createLogger(overrides, sink);
}

export const logger: Logger = {
  debug: (event, fields) => {
    current.debug(event, fields);
  },
  info: (event, fields) => {
    current.info(event, fields);
  },
  warn: (event, fields) => {
    current.warn(event, fields);
  },
  error: (event, fields) => {
    current.error(event, fields);
  },
  log: (level, event, fields) => {
    current.log(level, event, fields);
  },
  child: (fields) => current.child(fields),
  enabled: (level) => current.enabled(level),
};

/** Re-exported so a caller needs one import to log. */
export { LOG_EVENTS, REDACTED };
export type { LogEvent };
