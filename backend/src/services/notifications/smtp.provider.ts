import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailConfig } from '../../config/notifications';
import { EmailDeliveryError, type EmailMessage, type EmailProvider } from './provider';

/**
 * Real mail, over SMTP.
 *
 * SMTP rather than a vendor SDK, because SMTP is the one transport every mail
 * provider speaks. A store on Amazon SES, Postmark, Mailgun, Brevo, Zoho or its
 * own Postfix configures the same five variables and this file does not change.
 * Picking one vendor's REST API would have made ZyCart depend on that vendor's
 * account, pricing and SDK for a feature that has a universal protocol.
 *
 * Nothing in this file is imported anywhere except `runtime.ts`. That is what
 * keeps `nodemailer` out of the shipment service, the return service and the
 * templates — the provider boundary is real, not decorative.
 */

/**
 * How long one attempt may take.
 *
 * Three separate ceilings, because a mail server can hang at three different
 * points and a single overall timeout would let the slowest of them define the
 * wait. Kept deliberately tight: a send runs after the transaction has
 * committed but before the response reaches the administrator who clicked the
 * button, so this is somebody's spinner. A message that cannot be handed over
 * in five seconds is recorded and retried rather than waited on.
 */
const CONNECTION_TIMEOUT_MS = 5_000;
const GREETING_TIMEOUT_MS = 5_000;
const SOCKET_TIMEOUT_MS = 5_000;

/**
 * SMTP failures worth trying again, by nodemailer's error code.
 *
 * Everything here is a fact about the network or the server's mood a moment
 * ago, and a second attempt a second later routinely succeeds.
 */
const TEMPORARY_CODES = new Set([
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'EDNS',
  'ESOCKET',
  'ETIMEDOUT',
  'ETIME',
  'EPIPE',
  'EAI_AGAIN',
]);

/**
 * Failures a retry cannot fix.
 *
 * `EAUTH` is here because wrong credentials will be wrong on the next attempt
 * too — it is a configuration fault, and retrying it only delays the moment an
 * operator sees it on the notifications screen. `EENVELOPE` is the server
 * refusing the addresses; when it carries a 4xx reply code the reply code wins,
 * which is why the code table is consulted after `responseCode`.
 */
const PERMANENT_CODES = new Set(['EAUTH', 'EENVELOPE', 'EMESSAGE']);

interface SmtpError {
  code?: unknown;
  responseCode?: unknown;
  response?: unknown;
  message?: unknown;
}

/**
 * Turns a transport error into a sentence and a verdict.
 *
 * ## Why the sentence is built rather than stringified
 *
 * A nodemailer error can carry the SMTP command that was in flight when it
 * failed, and during authentication that command is `AUTH PLAIN
 * <base64(user\0user\0password)>`. `String(error)` on the wrong error therefore
 * writes the mail password into a database row that an administrator's browser
 * will later render. So nothing from the error is copied verbatim: the code and
 * the numeric reply code are used to *select* a sentence ZyCart wrote, and the
 * server's own reply text is appended only after being scrubbed and truncated.
 *
 * ## The reply code decides first
 *
 * 5xx is the server saying "no, and asking again will not change that". 4xx is
 * "not now". That distinction comes from the protocol and is more reliable than
 * any library's error code, so it is consulted before the code tables.
 */
export function classifySmtpError(error: unknown): { reason: string; permanent: boolean } {
  const smtp = (typeof error === 'object' && error !== null ? error : {}) as SmtpError;

  const code = typeof smtp.code === 'string' ? smtp.code : '';
  const replyCode = typeof smtp.responseCode === 'number' ? smtp.responseCode : null;
  const detail = scrubServerReply(smtp.response);

  if (replyCode !== null && replyCode >= 500) {
    return {
      reason: `The mail server rejected the message (SMTP ${String(replyCode)})${detail}`,
      permanent: true,
    };
  }

  if (replyCode !== null && replyCode >= 400) {
    return {
      reason: `The mail server was temporarily unable to accept the message (SMTP ${String(replyCode)})${detail}`,
      permanent: false,
    };
  }

  if (code === 'EAUTH') {
    return {
      reason:
        'The mail server refused the configured SMTP credentials. Check SMTP_USER and ' +
        'SMTP_PASSWORD - retrying will not help until they are corrected.',
      permanent: true,
    };
  }

  if (code === 'EENVELOPE') {
    return {
      reason: `The mail server would not accept the sender or recipient address${detail}`,
      permanent: true,
    };
  }

  if (code === 'ETIMEDOUT' || code === 'ETIME') {
    return { reason: 'The mail server did not respond in time (SMTP timeout).', permanent: false };
  }

  if (TEMPORARY_CODES.has(code)) {
    return { reason: `Could not reach the mail server (${code}).`, permanent: false };
  }

  if (PERMANENT_CODES.has(code)) {
    return { reason: `The mail server refused the message (${code})${detail}`, permanent: true };
  }

  /**
   * Unrecognised, and therefore temporary.
   *
   * Guessing "permanent" for an error nobody anticipated would quietly stop
   * ZyCart retrying messages that would have gone through on the next attempt.
   * The bounded attempt count is what stops this being an infinite loop, so
   * erring towards "try again" costs at most two more attempts.
   */
  return { reason: 'The message could not be handed to the mail server.', permanent: false };
}

/**
 * The server's own reply, made safe to store.
 *
 * SMTP reply text is written by the remote server, not by ZyCart, so it is
 * untrusted input: it is truncated, stripped of control characters, and any
 * run that looks like a credential blob is removed rather than trusted to be
 * harmless. It is rendered as text in the console, never as markup.
 */
function scrubServerReply(response: unknown): string {
  if (typeof response !== 'string') return '.';

  const cleaned = response
    .replace(/\bAUTH\b[^\r\n]*/gi, 'AUTH [redacted]')
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

  return cleaned ? `: ${cleaned}` : '.';
}

export function createSmtpProvider(config: EmailConfig): EmailProvider {
  if (!config.smtp) {
    /**
     * Unreachable through `loadEnv`, which refuses to boot on incomplete SMTP
     * settings. Kept because the type permits it, and because a provider that
     * silently did nothing would be exactly the "pretend emails were sent"
     * failure this phase exists to rule out.
     */
    throw new Error('SMTP is selected but no SMTP settings were resolved');
  }

  const { host, port, user, password, secure } = config.smtp;

  const transporter: Transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass: password },
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    // One connection per message. Pooling is a throughput optimisation, and
    // ZyCart sends a handful of messages a day; a long-lived pool would only
    // add a class of stale-socket failure for no gain at this volume.
    pool: false,
  });

  return {
    name: 'smtp',

    async send(message: EmailMessage) {
      try {
        const info = await transporter.sendMail({
          from: { name: config.fromName, address: config.fromAddress },
          to: message.toName
            ? { name: message.toName, address: message.to }
            : { address: message.to, name: '' },
          ...(config.replyTo ? { replyTo: config.replyTo } : {}),
          subject: message.subject,
          text: message.text,
          html: message.html,
        });

        /**
         * A `messageId` with no accepted recipient is the case that looks like
         * success and is not: the server took the message and refused the only
         * address on it. Treated as a permanent failure, because the address is
         * the thing it objected to.
         */
        if (Array.isArray(info.rejected) && info.rejected.length > 0) {
          throw new EmailDeliveryError(
            'The mail server accepted the message but rejected the recipient address.',
            true,
          );
        }

        return { messageId: typeof info.messageId === 'string' ? info.messageId : null };
      } catch (error) {
        if (error instanceof EmailDeliveryError) throw error;

        const { reason, permanent } = classifySmtpError(error);
        throw new EmailDeliveryError(reason, permanent, error);
      }
    },
  };
}
