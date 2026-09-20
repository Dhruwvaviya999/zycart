import 'dotenv/config';
import type { Server } from 'node:http';
import mongoose from 'mongoose';

import { connectDatabase } from './config/database';
import { aiConfig, aiUnavailableReason } from './config/ai';
import { loadEnv, razorpayConfig } from './config/env';
import { configureObservability, resolveLogFormat } from './config/logging';
import { appOrigin, emailConfig } from './config/notifications';
import { checkReadiness, formatReadiness } from './config/readiness';
import { SERVICE_VERSION } from './config/service';
import { createApp } from './app';
import { logger, serializeError } from './utils/logger';

const env = loadEnv();

/**
 * Before anything else can log.
 *
 * Configuring observability first means the startup banner, the readiness
 * findings and any failure in the lines below are all structured and all
 * redacted. A process that logged its first few lines through `console` and
 * then switched would have a window — short, but real — in which redaction was
 * not yet in force.
 */
configureObservability(env);

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
 * Said once per cold start, and only once.
 *
 * On a server the startup record is written by the `listen` callback. Vercel
 * never reaches that callback — there is no listener — so without this flag a
 * Vercel deployment would log nothing about itself at all: not the version, not
 * the mail provider, and not the readiness findings, which are the records an
 * operator wants first when the API is answering 500 and nobody knows why.
 *
 * It is deliberately after `ensureDatabase`, because `mongoose.connection.name`
 * is one of the fields and it is not known before the connection is open.
 */
let announced = false;

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

    if (!announced) {
      announced = true;
      logStartup();
    }

    app(req, res);
  } catch (error) {
    logger.error('database_connection_failed', {
      phase: 'request',
      error: serializeError(error, { stack: true }),
    });

    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable',
      });
    }
  }
}

/**
 * What the process says about itself once it is up.
 *
 * ## Why this is structured and not a banner
 *
 * It used to be nine `console.log` lines. They were readable by a person
 * sitting in front of the terminal that produced them, and by nothing else — so
 * "which build is running, with which mail provider, against which storefront"
 * was a question that could only be answered by scrolling. One record answers
 * it, and answers it the same way whether it is read by a human, a `jq` filter
 * or a log search a week later.
 *
 * ## What is in it
 *
 * Only what is already public or already decided: the port, the environment,
 * the version, the names of the providers in use, the storefront origin, and
 * whether the Razorpay key is a live one. Not the key. Not the host. Not the
 * connection string. `configureObservability` has registered every credential
 * with the redactor by this point, so even a mistake here would be caught —
 * but the field list is chosen so there is no mistake to catch.
 */
function logStartup(port?: number): void {
  const razorpay = razorpayConfig(env);
  const ai = aiConfig(env);
  const email = emailConfig(env);

  logger.info('server_started', {
    // Absent under Vercel, where nothing listens on a port and a number here
    // would describe a socket that does not exist.
    ...(port === undefined ? {} : { port }),
    environment: env.NODE_ENV,
    version: SERVICE_VERSION,
    storefront: appOrigin(env),
    logLevel: env.LOG_LEVEL,
    logFormat: resolveLogFormat(env),
    slowRequestMs: env.SLOW_REQUEST_MS,
    database: mongoose.connection.name,
    // The mode, not the key. `rzp_live_` versus `rzp_test_` is the one fact
    // about it worth knowing at a glance, and it is the fact that turns a
    // misconfiguration into an obvious one.
    payments: razorpay
      ? razorpay.keyId.startsWith('rzp_live_')
        ? 'live'
        : 'test'
      : 'not_configured',
    emailProvider: email.provider,
    assistant: ai ? ai.provider : 'not_configured',
    assistantModel: ai?.model,
  });

  /**
   * Said loudly, every time, because neither is visible from the console.
   *
   * A store running the mock mail provider records every message as sent and
   * delivers none of them; a store with no gateway offers cash only. Both are
   * legitimate, and both are the sort of thing somebody discovers a fortnight
   * later.
   */
  if (email.provider !== 'smtp') {
    logger.warn('server_started', {
      notice: 'email_mock',
      detail: 'Transactional email is mocked — messages are recorded and nothing is delivered.',
    });
  }

  if (!razorpay) {
    logger.warn('server_started', {
      notice: 'payments_unconfigured',
      detail: 'Razorpay is not configured — checkout offers cash on delivery only.',
    });
  }

  if (!ai && env.AI_ENABLED) {
    logger.warn('server_started', {
      notice: 'assistant_unavailable',
      detail: aiUnavailableReason(env) ?? 'unknown',
    });
  }

  /**
   * Fitness for the environment, separately from what is configured.
   *
   * A warning here does not stop the process — a developer must be able to run
   * ZyCart on a laptop with mock mail and no gateway — but a production
   * deployment that trips an *error* is one that will disappoint a customer,
   * and saying so at startup is the last chance to notice before it does.
   * `pnpm smoke:deploy` refuses the same findings before a build even starts.
   */
  const readiness = checkReadiness(env);

  for (const finding of readiness.findings) {
    logger.log(finding.severity === 'error' ? 'error' : 'warn', 'server_started', {
      notice: 'readiness',
      severity: finding.severity,
      key: finding.key,
      detail: finding.message,
    });
  }
}

/**
 * Stopping on purpose.
 *
 * A container runtime sends SIGTERM and then waits; a terminal sends SIGINT.
 * Both mean the same thing here — stop accepting connections, let the requests
 * in flight finish, close the database, exit — and both should produce a record
 * saying which one it was, because "the process vanished" and "the platform
 * asked it to stop" look identical in a log that does not distinguish them.
 *
 * The timeout exists because a graceful shutdown that never completes is an
 * outage with better manners. A request still open after it loses.
 */
const SHUTDOWN_GRACE_MS = 10_000;

function installShutdown(server: Server): void {
  let stopping = false;

  const stop = (signal: NodeJS.Signals): void => {
    // A second Ctrl-C is a person asking more firmly. Honour it.
    if (stopping) {
      logger.warn('server_stopping', { signal, notice: 'forced' });
      process.exit(1);
    }

    stopping = true;
    logger.info('server_stopping', { signal });

    const forced = setTimeout(() => {
      logger.warn('server_stopped', { signal, graceful: false, graceMs: SHUTDOWN_GRACE_MS });
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);

    // Do not hold the event loop open purely to wait for the deadline.
    forced.unref();

    server.close(() => {
      void mongoose
        .disconnect()
        .catch(() => undefined)
        .finally(() => {
          clearTimeout(forced);
          logger.info('server_stopped', { signal, graceful: true });
          process.exit(0);
        });
    });
  };

  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

/**
 * The two ways a Node process dies without being asked.
 *
 * Both were previously silent beyond whatever Node prints, which is a stack on
 * stderr and nothing structured. An operator looking at why a container
 * restarted deserves the same record shape as everything else.
 *
 * Neither handler swallows the fault. An uncaught exception has left the
 * process in a state nobody reasoned about, so it exits — after saying why,
 * which is the only thing this adds.
 */
function installFaultHandlers(): void {
  process.on('uncaughtException', (error) => {
    logger.error('uncaught_exception', { error: serializeError(error, { stack: true }) });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled_rejection', { error: serializeError(reason, { stack: true }) });
    process.exit(1);
  });
}

/**
 * Local development and any ordinary server.
 *
 * Vercel does not use this listener.
 */
if (!process.env.VERCEL) {
  installFaultHandlers();

  ensureDatabase()
    .then(() => {
      const server = app.listen(env.PORT, () => {
        logStartup(env.PORT);
      });

      installShutdown(server);
    })
    .catch((error: unknown) => {
      logger.error('server_start_failed', { error: serializeError(error, { stack: true }) });

      // Printed unstructured as well, because this is the one failure whose
      // reader is always a person at a terminal, and the findings are long
      // sentences that a single-line JSON record makes hard to read.
      const readiness = checkReadiness(env);
      if (readiness.findings.length > 0) {
        process.stderr.write(`\nConfiguration\n${formatReadiness(readiness)}\n`);
      }

      process.exit(1);
    });
}

export default handler;
