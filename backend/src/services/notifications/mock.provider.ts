import type { EmailConfig } from '../../config/notifications';
import { EmailDeliveryError, type EmailMessage, type EmailProvider } from './provider';

/**
 * A transport that keeps messages instead of sending them.
 *
 * It exists so the whole of Phase 14 — templates, escaping, idempotency,
 * retries, the admin console — can be exercised with no mail server, no
 * credentials and no network. That is what makes the notification tests
 * deterministic, and what lets a contributor without an SMTP account click
 * through the admin screens and see real rendered mail.
 *
 * Every delivery it accepts records `provider: "mock"`, so nothing in the
 * console can be mistaken for a real send. The startup banner says so too.
 */

export interface CapturedEmail {
  to: string;
  toName: string;
  subject: string;
  text: string;
  html: string;
  event: string;
  template: string;
  notificationId: string;
  at: Date;
}

/**
 * How many captured messages are kept.
 *
 * A bound rather than an unbounded array, because in development this process
 * runs for days and an array that only ever grows is a slow leak. Oldest are
 * dropped first; a test that needs more than this has a different problem.
 */
const CAPTURE_LIMIT = 200;

const captured: CapturedEmail[] = [];

/** Every message the mock has accepted, oldest first. */
export function capturedEmails(): readonly CapturedEmail[] {
  return captured;
}

/** The most recent captured message, or undefined. */
export function lastCapturedEmail(): CapturedEmail | undefined {
  return captured[captured.length - 1];
}

/** Test seam: forget everything captured so far. */
export function resetCapturedEmails(): void {
  captured.length = 0;
}

/**
 * Forces the next `n` sends to fail, so failure paths can be tested.
 *
 * A counter rather than a flag, because the case worth testing is "attempt one
 * fails, attempt two succeeds" — which needs the failure to stop on its own.
 * Nothing in the application sets this; it is reachable only from tests and the
 * verification script.
 */
let failures = { remaining: 0, permanent: false };

export function failNextSends(count: number, options: { permanent?: boolean } = {}): void {
  failures = { remaining: Math.max(0, count), permanent: options.permanent === true };
}

export function clearForcedFailures(): void {
  failures = { remaining: 0, permanent: false };
}

export function createMockProvider(_config: EmailConfig): EmailProvider {
  return {
    name: 'mock',

    send(message: EmailMessage) {
      if (failures.remaining > 0) {
        failures.remaining -= 1;

        return Promise.reject(
          new EmailDeliveryError(
            failures.permanent
              ? 'The mock provider rejected the recipient address.'
              : 'The mock provider was told to fail this attempt.',
            failures.permanent,
          ),
        );
      }

      captured.push({
        to: message.to,
        toName: message.toName,
        subject: message.subject,
        text: message.text,
        html: message.html,
        event: message.meta.event,
        template: message.meta.template,
        notificationId: message.meta.notificationId,
        at: new Date(),
      });

      if (captured.length > CAPTURE_LIMIT) captured.splice(0, captured.length - CAPTURE_LIMIT);

      /**
       * A message id shaped like a real one, derived from the delivery's own
       * id so it is stable across a retry of the same row rather than random.
       * Determinism is the point: a template test that asserted on a random
       * value would have to ignore it, and an operator comparing two runs
       * should see the same id for the same message.
       */
      return Promise.resolve({ messageId: `mock-${message.meta.notificationId}` });
    },
  };
}
