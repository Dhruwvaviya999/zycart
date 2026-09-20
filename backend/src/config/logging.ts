import { emailConfig } from './notifications';
import { razorpayConfig, type Env } from './env';
import { SERVICE_NAME } from './service';
import { registerSecrets } from '../utils/redact';
import { configureLogger, type LoggerConfig } from '../utils/logger';

/**
 * Turning validated configuration into a configured logger.
 *
 * One function, called once, from the two places a ZyCart process can begin:
 * `server.ts` and any CLI entry that wants structured output. It is the only
 * code that reads credentials for the purpose of logging — and it reads them in
 * order to make sure they are *never* logged.
 */

/**
 * Which format, when nothing says.
 *
 * JSON in production because something is going to parse it. A short aligned
 * line everywhere else, because in development the reader is a person with a
 * terminal, and a wall of JSON is a wall. Both carry identical fields; the
 * choice changes punctuation, never content.
 */
export function resolveLogFormat(env: Env): LoggerConfig['format'] {
  return env.LOG_FORMAT ?? (env.NODE_ENV === 'production' ? 'json' : 'text');
}

/**
 * Every value this process holds that must never appear in a log line.
 *
 * Collected from validated configuration rather than from `process.env`, so a
 * variable that was renamed or removed cannot leave a stale entry behind, and
 * so nothing here depends on a name matching by luck.
 *
 * `MONGODB_URI` is on the list because it carries a password in every
 * deployment that has one, and because it is the value most likely to arrive
 * inside somebody else's error message — the driver quotes it back on a
 * connection failure, which is exactly the moment something will be logged.
 *
 * `CLIENT_URL`, `RAZORPAY_KEY_ID` and the sender address are deliberately
 * absent: they are public facts about the deployment, they appear in responses
 * a browser can already read, and redacting them would cost diagnostics for no
 * gain.
 */
export function secretValues(env: Env): string[] {
  const razorpay = razorpayConfig(env);
  const email = emailConfig(env);

  return [
    env.MONGODB_URI,
    env.JWT_SECRET,
    env.AI_API_KEY,
    razorpay?.keySecret,
    razorpay?.webhookSecret,
    email.smtp?.password,
    email.smtp?.user,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

/**
 * Configures logging for this process. Idempotent; safe to call more than once.
 *
 * Secrets are registered **before** the logger is swapped in, so there is no
 * window — however short — in which a configured logger exists that does not
 * yet know what to redact.
 */
export function configureObservability(env: Env): void {
  registerSecrets(secretValues(env));

  configureLogger({
    level: env.LOG_LEVEL,
    format: resolveLogFormat(env),
    service: SERVICE_NAME,
  });
}
