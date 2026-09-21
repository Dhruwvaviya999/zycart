import type { NotificationEvent } from '../../../models/notification-delivery.model';
import {
  renderEmail,
  sanitizeSubject,
  type EmailBrand,
  type EmailContent,
  type RenderedEmail,
} from '../render';
import { orderDeliveredTemplate } from './order-delivered';
import { orderShippedTemplate } from './order-shipped';
import { refundCompletedTemplate } from './refund-completed';
import { returnApprovedTemplate } from './return-approved';
import type { EmailTemplate } from './shared';

export { orderShippedTemplate, type OrderShippedEmailData } from './order-shipped';
export { orderDeliveredTemplate, type OrderDeliveredEmailData } from './order-delivered';
export { returnApprovedTemplate, type ReturnApprovedEmailData } from './return-approved';
export { refundCompletedTemplate, type RefundCompletedEmailData } from './refund-completed';
export type { EmailTemplate } from './shared';

/**
 * A template with its data type erased, so four differently-typed templates can
 * live in one lookup table.
 *
 * The erasure is safe precisely because it happens *through* the schema:
 * `render` takes `unknown`, parses it with the template's own Zod schema, and
 * only then hands the result to code that expects that template's data. There
 * is no cast anywhere in this file, and no path by which one event's payload
 * could be rendered by another event's template without failing validation
 * first.
 */
interface ErasedTemplate {
  readonly name: string;
  readonly version: number;
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
  render(payload: unknown, brand: EmailBrand): { subject: string; content: EmailContent };
}

function erase<TData>(template: EmailTemplate<TData>): ErasedTemplate {
  return {
    name: template.name,
    version: template.version,
    subject(payload) {
      return sanitizeSubject(template.subject(template.schema.parse(payload)));
    },
    render(payload, brand) {
      const data = template.schema.parse(payload);
      return { subject: template.subject(data), content: template.content(data, brand) };
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
 * events can ZyCart send?" is answered by reading four lines.
 *
 * Typed as a total mapping over `NotificationEvent`, so adding a fifth event to
 * the model without adding a template here is a compile error rather than a
 * message nobody notices is missing.
 */
export const TEMPLATE_REGISTRY: Readonly<Record<NotificationEvent, ErasedTemplate>> = {
  ORDER_SHIPPED: erase(orderShippedTemplate),
  ORDER_DELIVERED: erase(orderDeliveredTemplate),
  RETURN_APPROVED: erase(returnApprovedTemplate),
  REFUND_COMPLETED: erase(refundCompletedTemplate),
};

/** The template for an event — its name and version, without rendering anything. */
export function templateFor(event: NotificationEvent): ErasedTemplate {
  return TEMPLATE_REGISTRY[event];
}

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
 * Throws on a payload that does not fit. The caller records that as a permanent
 * failure — retrying cannot repair a snapshot.
 */
export function renderNotification(
  event: NotificationEvent,
  payload: unknown,
  brand: EmailBrand,
): RenderedNotification {
  const template = TEMPLATE_REGISTRY[event];
  const { subject, content } = template.render(payload, brand);

  return {
    ...renderEmail(content, brand),
    // Sanitised even though every subject in this phase interpolates only
    // server-generated references: the sanitiser is what keeps that true of
    // whatever the fifth template turns out to interpolate.
    subject: sanitizeSubject(subject),
    template: template.name,
    templateVersion: template.version,
  };
}
