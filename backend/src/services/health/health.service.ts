import mongoose from 'mongoose';
import { aiConfig, type AiConfig } from '../../config/ai';
import { isRazorpayConfigured, type Env } from '../../config/env';
import { emailConfig } from '../../config/notifications';
import { SERVICE_NAME, SERVICE_VERSION } from '../../config/service';

/**
 * What `GET /api/health` knows, and how it decides.
 *
 * ## Two different questions, kept apart
 *
 * **Is the process alive?** Answered by getting any response at all. A dead
 * process does not reply, and no field in a body can say so more truthfully
 * than silence does.
 *
 * **Is it ready to do its job?** That is what `status` answers, and on this
 * API it means one thing: can it reach the database. Everything ZyCart serves
 * beyond this endpoint is a read or a write against MongoDB, so a process that
 * cannot reach it is not serving a store — however healthy the process itself
 * looks.
 *
 * ## Why configuration does not change the verdict
 *
 * The other three checks report configuration, and configuration cannot break
 * at run time: `loadEnv` refuses to start a half-configured process, so
 * whatever is reported here was true when the process booted and will be true
 * until it is replaced.
 *
 * More importantly, "not configured" is frequently correct. A cash-on-delivery
 * store has no Razorpay credentials and is not degraded; it is a store that
 * takes cash. A development machine runs the mock mail provider and is not
 * broken; it is a laptop. A readiness endpoint that returned 503 for either
 * would be removed from the load balancer within a week, which is the failure
 * mode every honest health check is trying to avoid.
 *
 * So configuration is **reported, not judged**. Whether a given deployment is
 * *permitted* to run with mock mail is a deployment question, and it is asked
 * and answered by `checkReadiness` in `config/readiness.ts` — at boot, and by
 * `pnpm smoke:deploy` before the boot happens.
 *
 * ## What is never in the response
 *
 * No connection string, no host, no credential, no file path, no stack, no
 * environment dump, no counts of anything a competitor would want. Every field
 * below is either a fixed enum value or a fact a customer can already observe.
 * `tests/health.test.ts` asserts that by serialising the whole report and
 * searching it for the configured secrets.
 */

/** Reachable, or not. There is no third state worth acting on. */
export type DatabaseStatus = 'ok' | 'unavailable';

/** `mock` records messages and delivers nothing; `configured` has a transport. */
export type EmailStatus = 'configured' | 'mock';

export type PaymentsStatus = 'configured' | 'not_configured';

/** `disabled` is a deployment that turned the assistant off on purpose. */
export type AiStatus = 'configured' | 'disabled' | 'not_configured';

export type HealthStatus = 'ok' | 'unavailable';

export interface HealthChecks {
  database: DatabaseStatus;
  email: EmailStatus;
  payments: PaymentsStatus;
  ai: AiStatus;
}

export interface HealthReport {
  status: HealthStatus;
  service: string;
  /** Null when the manifest could not be read. Never invented. */
  version: string | null;
  environment: Env['NODE_ENV'];
  /** Present even on a 503: it is how a reader tells a restart loop from an outage. */
  uptimeSeconds: number;
  timestamp: string;
  checks: HealthChecks;
}

/* ------------------------------------------------------------------ */
/* The configuration half — pure, and therefore fully testable          */
/* ------------------------------------------------------------------ */

export function emailStatus(env: Env): EmailStatus {
  return emailConfig(env).provider === 'smtp' ? 'configured' : 'mock';
}

export function paymentsStatus(env: Env): PaymentsStatus {
  return isRazorpayConfigured(env) ? 'configured' : 'not_configured';
}

/**
 * Three states, because "off" and "broken" are not the same thing and an
 * operator reading this needs to know which one they are looking at.
 */
export function aiStatus(env: Env): AiStatus {
  if (!env.AI_ENABLED) return 'disabled';

  const config: AiConfig | null = aiConfig(env);
  return config ? 'configured' : 'not_configured';
}

/* ------------------------------------------------------------------ */
/* The database half                                                    */
/* ------------------------------------------------------------------ */

/**
 * How long the readiness probe may take before it counts as a failure.
 *
 * A health endpoint that can hang is worse than one that can be wrong: the
 * caller is a load balancer with a timeout of its own, and a probe that
 * outlives it turns an outage into a pile of stuck sockets. Two seconds is
 * well beyond any healthy round trip to a replica set and well inside any
 * sensible caller's patience.
 */
export const DATABASE_PROBE_TIMEOUT_MS = 2_000;

/** Swappable so the endpoint's behaviour can be tested without a database. */
export type DatabaseProbe = () => Promise<DatabaseStatus>;

/**
 * A real round trip, and deliberately the smallest one there is.
 *
 * `readyState` alone would not do. It says what the driver believes about its
 * socket, which stays `connected` through a network partition until something
 * actually tries to use it — so a health check built on it reports "ok" for
 * precisely as long as nobody is watching. `ping` is the admin command that
 * exists for this: no collection, no index, no documents, no aggregation, and
 * no write. It costs one round trip and touches no data.
 *
 * The `readyState` check is still made first, because when the driver knows it
 * is disconnected there is no reason to spend two seconds confirming it.
 */
export async function pingDatabase(
  timeoutMs: number = DATABASE_PROBE_TIMEOUT_MS,
): Promise<DatabaseStatus> {
  if (mongoose.connection.readyState !== 1) return 'unavailable';

  const database = mongoose.connection.db;
  if (!database) return 'unavailable';

  let timer: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      database.admin().command({ ping: 1 }),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('database ping timed out'));
        }, timeoutMs);
      }),
    ]);

    return 'ok';
  } catch {
    // Why it failed is a question for the log, not for a public endpoint: a
    // driver's message names hosts, ports and sometimes the user.
    return 'unavailable';
  } finally {
    // Without this the process would not exit for the length of the timeout
    // after a fast success, which matters to the deploy smoke command.
    if (timer) clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* The report                                                           */
/* ------------------------------------------------------------------ */

export interface HealthOptions {
  probe?: DatabaseProbe;
  /** Injected so a test does not have to wait for the clock to move. */
  uptimeSeconds?: number;
  now?: Date;
}

export async function buildHealthReport(
  env: Env,
  options: HealthOptions = {},
): Promise<HealthReport> {
  const probe = options.probe ?? (() => pingDatabase());
  const database = await probe();

  return {
    status: database === 'ok' ? 'ok' : 'unavailable',
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    environment: env.NODE_ENV,
    uptimeSeconds: options.uptimeSeconds ?? Math.round(process.uptime()),
    timestamp: (options.now ?? new Date()).toISOString(),
    checks: {
      database,
      email: emailStatus(env),
      payments: paymentsStatus(env),
      ai: aiStatus(env),
    },
  };
}

/**
 * 200 when it can serve, 503 when it cannot. Nothing in between.
 *
 * 503 is the status a load balancer, a container runtime and every uptime
 * checker already understand as "take me out of rotation", and it is the only
 * honest answer from a process that cannot reach its database. A 500 would be
 * wrong — nothing in the health endpoint failed, it successfully found out
 * that something else had.
 */
export const healthHttpStatus = (report: HealthReport): 200 | 503 =>
  report.status === 'ok' ? 200 : 503;
