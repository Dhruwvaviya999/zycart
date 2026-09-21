import type { Env } from './env';

/**
 * How ZyCart sends transactional email, and where the links in it point.
 *
 * Everything here is decided once, on the server, from validated environment
 * variables. Nothing in this file reaches the browser, and no SMTP credential
 * is ever logged, printed at startup, returned from an API or written to a
 * delivery record. The provider *name* is all any of those ever see.
 *
 * The same reasoning that put `razorpayConfig` and `aiConfig` in their own
 * modules applies: "is mail configured, and with what?" should be one decision
 * made in one place, not a set of optional fields every caller re-checks.
 */

export type EmailProviderName = 'mock' | 'smtp';

/** SMTP credentials, narrowed to the shape the transport needs. */
export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  secure: boolean;
}

export interface EmailConfig {
  provider: EmailProviderName;
  fromName: string;
  fromAddress: string;
  /** Null unless the deployment has a real, monitored support mailbox. */
  replyTo: string | null;
  /** Present only for the SMTP provider; the mock needs no credentials. */
  smtp: SmtpConfig | null;
}

/**
 * The sender the mock provider stamps on captured messages.
 *
 * Deliberately a `.invalid` address — the reserved TLD from RFC 2606, which can
 * never resolve. A placeholder that looked deliverable is how a fake sender
 * ends up on real mail the day somebody switches the provider without setting
 * `EMAIL_FROM_ADDRESS`; this one is unmistakable in any inspector.
 */
const MOCK_FROM_ADDRESS = 'no-reply@zycart.invalid';

/**
 * The mail configuration for this process.
 *
 * Never null, which is the one place this differs from `aiConfig`. A store
 * without an assistant simply has no assistant; a store without mail still has
 * post-purchase events that must be *recorded* as communication, whether or not
 * a message leaves the building. So there is always a provider — and when it is
 * the mock, every delivery record says so, and so does the admin console.
 *
 * Incomplete SMTP settings never reach here: `loadEnv` refuses to boot on them.
 */
export function emailConfig(env: Env): EmailConfig {
  const smtp: SmtpConfig | null =
    env.EMAIL_PROVIDER === 'smtp' &&
    env.SMTP_HOST &&
    env.SMTP_USER &&
    env.SMTP_PASSWORD !== undefined
      ? {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
          secure: env.SMTP_SECURE,
        }
      : null;

  return {
    provider: env.EMAIL_PROVIDER,
    fromName: env.EMAIL_FROM_NAME,
    fromAddress: env.EMAIL_FROM_ADDRESS ?? MOCK_FROM_ADDRESS,
    replyTo: env.EMAIL_REPLY_TO ?? null,
    smtp,
  };
}

/**
 * The origin every link in an email is built from.
 *
 * Read from configuration and from nowhere else. Building an absolute URL from
 * an incoming `Host` or `X-Forwarded-Host` header is how a link in a
 * transactional email ends up pointing at whatever host an attacker put in the
 * request that triggered it — and an email is the worst possible place for that,
 * because it outlives the request, arrives with the store's branding on it and
 * cannot be recalled. ZyCart's proxy configuration (`trust proxy`) exists to
 * resolve client IPs for rate limiting, not to decide what the store is called.
 *
 * Trailing slashes are stripped so `appUrl('/account')` cannot produce `//`.
 */
export function appOrigin(env: Env): string {
  return env.CLIENT_URL.replace(/\/+$/, '');
}

/**
 * An absolute storefront URL for a path this codebase controls.
 *
 * Takes a path, never a full URL, so there is no shape of call through which a
 * caller could hand this an off-site address and have it rendered as a ZyCart
 * link. External links — a carrier's tracking page — go through
 * `safeExternalUrl` instead, which re-validates the protocol.
 */
export function appUrl(env: Env, path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${appOrigin(env)}${suffix}`;
}

/**
 * How many times one message may be attempted automatically.
 *
 * Three, and then the delivery is FAILED. The bound is the point: a provider
 * that is refusing everything must not have this process hammering it, and a
 * delivery that cannot succeed must end up somewhere an operator can see it
 * rather than in a loop nobody is watching.
 *
 * An administrator pressing Retry is not bound by this. That is a person making
 * a decision about one message, not an automatic loop, and each press buys
 * exactly one further attempt.
 */
export const MAX_AUTOMATIC_ATTEMPTS = 3;

/**
 * How long the automatic attempts may take, measured from the first one.
 *
 * Delivery happens after the database transaction has committed but before the
 * HTTP response is written, so this is time an administrator spends watching a
 * spinner after clicking "Mark shipped". Four seconds buys a retry over a brief
 * network blip without making a mail server's timeout into the console's.
 *
 * It gates the *start* of an attempt, not its duration — an attempt already in
 * flight is allowed to finish, because abandoning a send whose outcome is
 * unknown is strictly worse than waiting for it. The per-attempt ceiling is the
 * transport's own timeout; see `smtp.provider.ts`.
 */
export const AUTOMATIC_RETRY_DEADLINE_MS = 4_000;

/** Backoff before the second and third automatic attempts. */
export const AUTOMATIC_RETRY_DELAYS_MS: readonly number[] = [300, 900];

/**
 * When a delivery stuck in SENDING may be claimed again.
 *
 * SENDING means a send is in flight. If the process dies mid-send the row is
 * left there, and nothing else would ever touch it — so after this long an
 * administrator may reclaim it by hand. Ten minutes is far longer than any
 * transport timeout, so a record this old is a crashed attempt rather than a
 * slow one.
 *
 * It is deliberately not automatic. A send whose outcome nobody observed may
 * well have been accepted, and re-sending it would put a second copy of the
 * same message in a customer's inbox. That is a judgement for a person, made in
 * front of a screen that says exactly what is and is not known.
 */
export const STALE_SENDING_MS = 10 * 60 * 1_000;
