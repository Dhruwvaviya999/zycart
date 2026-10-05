import type { NotificationEvent } from '../../../models/notification-delivery.model';
import {
  renderEmail,
  sanitizeSubject,
  type EmailBrand,
  type EmailContent,
  type RenderedEmail,
} from '../render';
import { abandonedCartTemplate } from './abandoned-cart';
import { backInStockTemplate } from './back-in-stock';
import { emailVerificationTemplate } from './email-verification';
import { newsletterConfirmationTemplate } from './newsletter-confirmation';
import { orderDeliveredTemplate } from './order-delivered';
import { orderPlacedTemplate } from './order-placed';
import { orderShippedTemplate } from './order-shipped';
import { passwordResetTemplate } from './password-reset';
import { paymentFailedTemplate } from './payment-failed';
import { priceDropTemplate } from './price-drop';
import { refundCompletedTemplate } from './refund-completed';
import { returnApprovedTemplate } from './return-approved';
import type { EmailTemplate } from './shared';
import { welcomeTemplate } from './welcome';

export { orderShippedTemplate, type OrderShippedEmailData } from './order-shipped';
export { orderDeliveredTemplate, type OrderDeliveredEmailData } from './order-delivered';
export { returnApprovedTemplate, type ReturnApprovedEmailData } from './return-approved';
export { refundCompletedTemplate, type RefundCompletedEmailData } from './refund-completed';
export { orderPlacedTemplate, type OrderPlacedEmailData } from './order-placed';
export { paymentFailedTemplate, type PaymentFailedEmailData } from './payment-failed';
export { abandonedCartTemplate, type AbandonedCartEmailData } from './abandoned-cart';
export { welcomeTemplate, type WelcomeEmailData } from './welcome';
export { emailVerificationTemplate, type EmailVerificationEmailData } from './email-verification';
export { passwordResetTemplate, type PasswordResetEmailData } from './password-reset';
export {
  newsletterConfirmationTemplate,
  type NewsletterConfirmationEmailData,
} from './newsletter-confirmation';
export { backInStockTemplate, type BackInStockEmailData } from './back-in-stock';
export { priceDropTemplate, type PriceDropEmailData } from './price-drop';
export type { EmailTemplate } from './shared';

/**
 * A secret-bearing message was asked to render without its secret.
 *
 * Not a malformed payload — the stored data may be perfectly valid. It means
 * the one value this message existed to carry was never written down, and the
 * process that held it has moved on. Permanent by definition: no retry can
 * recover a token nobody kept.
 */
export class MissingSecretsError extends Error {
  constructor(template: string) {
    super(`The "${template}" message needs a single-use link that is not stored.`);
    this.name = 'MissingSecretsError';
  }
}

/**
 * A template with its data type erased, so differently-typed templates can
 * live in one lookup table.
 *
 * The erasure is safe precisely because it happens *through* the schema:
 * `render` takes `unknown`, parses it with the template's own Zod schema, and
 * only then hands the result to code that expects that template's data. There
 * is no path by which one event's payload could be rendered by another event's
 * template without failing validation first. Secrets are parsed the same way,
 * against the template's own secret schema.
 */
interface ErasedTemplate {
  readonly name: string;
  readonly version: number;
  /**
   * Whether a send needs a value that is never stored (Phase 18).
   *
   * Read by the console and the drain as well as by delivery: a message whose
   * secret is gone cannot be re-sent by anybody, and saying so up front is
   * better than offering a Retry button that is certain to fail.
   */
  readonly requiresSecrets: boolean;
  /**
   * The subject alone, for callers that have no brand to hand.
   *
   * Creating an intent happens inside a database transaction, where the
   * application's own origin is not in scope and does not need to be — a
   * subject line contains no links. It still parses the payload, so a builder
   * that produced the wrong shape fails at the operation that caused it rather
   * than minutes later during delivery.
   */
  subject(payload: unknown): string;
  render(
    payload: unknown,
    brand: EmailBrand,
    secrets?: unknown,
  ): { subject: string; content: EmailContent };
}

function erase<TData, TSecrets>(template: EmailTemplate<TData, TSecrets>): ErasedTemplate {
  return {
    name: template.name,
    version: template.version,
    requiresSecrets: template.secrets !== undefined,
    subject(payload) {
      return sanitizeSubject(template.subject(template.schema.parse(payload)));
    },
    render(payload, brand, secrets) {
      const data = template.schema.parse(payload);

      let parsed: TSecrets | undefined;

      if (template.secrets) {
        if (secrets === undefined || secrets === null) {
          throw new MissingSecretsError(template.name);
        }
        parsed = template.secrets.parse(secrets);
      }

      return {
        subject: template.subject(data),
        // `parsed` is only undefined for a template that declares no secrets,
        // whose `content` does not read its third argument.
        content: template.content(data, brand, parsed as TSecrets),
      };
    },
  };
}

/**
 * Which template answers which event.
 *
 * A table, not a `switch` scattered through the services that raise events. The
 * shipment service knows it has shipped an order; it does not know, and must
 * not need to know, that there is a file called `order-shipped.ts`. Everything
 * that maps an event to words goes through this object, which also means "which
 * events can ZyCart send?" is answered by reading these lines.
 *
 * Typed as a total mapping over `NotificationEvent`, so adding an event to the
 * model without adding a template here is a compile error rather than a message
 * nobody notices is missing.
 */
export const TEMPLATE_REGISTRY: Readonly<Record<NotificationEvent, ErasedTemplate>> = {
  ORDER_SHIPPED: erase(orderShippedTemplate),
  ORDER_DELIVERED: erase(orderDeliveredTemplate),
  RETURN_APPROVED: erase(returnApprovedTemplate),
  REFUND_COMPLETED: erase(refundCompletedTemplate),
  ORDER_PLACED: erase(orderPlacedTemplate),
  PAYMENT_FAILED: erase(paymentFailedTemplate),
  ABANDONED_CART: erase(abandonedCartTemplate),
  WELCOME: erase(welcomeTemplate),
  EMAIL_VERIFICATION: erase(emailVerificationTemplate),
  PASSWORD_RESET: erase(passwordResetTemplate),
  NEWSLETTER_CONFIRMATION: erase(newsletterConfirmationTemplate),
  BACK_IN_STOCK: erase(backInStockTemplate),
  PRICE_DROP: erase(priceDropTemplate),
};

/** The template for an event — its name and version, without rendering anything. */
export function templateFor(event: NotificationEvent): ErasedTemplate {
  return TEMPLATE_REGISTRY[event];
}

/** The events whose messages carry a single-use link that is never stored. */
export const SECRET_BEARING_EVENTS: readonly NotificationEvent[] = (
  Object.keys(TEMPLATE_REGISTRY) as NotificationEvent[]
).filter((event) => TEMPLATE_REGISTRY[event].requiresSecrets);

export interface RenderedNotification extends RenderedEmail {
  subject: string;
  template: string;
  templateVersion: number;
}

/**
 * Renders one message from an event and a payload.
 *
 * ## The payload is validated here, every time
 *
 * `payload` arrives as `unknown` because that is what it genuinely is: on the
 * first send it came from a builder in this codebase, and on a retry it came
 * back out of MongoDB, possibly months later and possibly written by an older
 * version of this file. Parsing it against the template's own schema turns "the
 * data is probably right" into a checked fact, and makes a mismatch a clear,
 * permanent, diagnosable failure instead of an email containing the word
 * `undefined`.
 *
 * Throws on a payload that does not fit, and `MissingSecretsError` for a
 * secret-bearing message rendered without its secret. The caller records both
 * as permanent failures — retrying cannot repair a snapshot, nor recover a
 * token nobody kept.
 */
export function renderNotification(
  event: NotificationEvent,
  payload: unknown,
  brand: EmailBrand,
  secrets?: unknown,
): RenderedNotification {
  const template = TEMPLATE_REGISTRY[event];
  const { subject, content } = template.render(payload, brand, secrets);

  return {
    ...renderEmail(content, brand),
    // Sanitised even though every subject interpolates only server-generated
    // references: the sanitiser is what keeps that true of whatever the next
    // template turns out to interpolate.
    subject: sanitizeSubject(subject),
    template: template.name,
    templateVersion: template.version,
  };
}
