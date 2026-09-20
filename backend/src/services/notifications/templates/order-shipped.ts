import { z } from 'zod';
import { safeExternalUrl, type EmailBrand, type EmailContent } from '../render';
import {
  emailLineSchema,
  formatEmailDate,
  greeting,
  optionalInstant,
  orderUrl,
  toItemBlock,
  type EmailTemplate,
} from './shared';

/**
 * "Your order has shipped."
 *
 * ## Nothing here is invented
 *
 * The carrier, the tracking number, the tracking link and the estimated
 * delivery date are all fields an operator either filled in or did not. Where
 * one is absent the email says less; it never says "Estimated delivery:
 * 25 September" because a date looked plausible. That rule is Phase 13's and it
 * matters more here than anywhere else in ZyCart — a wrong fact on a screen can
 * be corrected by refreshing it, and a wrong fact in an inbox is permanent.
 *
 * ## The link, and why it is re-checked
 *
 * `trackingUrl` was validated as an absolute `https:` address before it was
 * stored. It is validated again at render, because this template also runs on a
 * retry of a record written long ago, and a stored value is untrusted input by
 * the time it is read back. A value that fails produces no link rather than a
 * broken or dangerous one.
 */

export const orderShippedSchema = z.object({
  customerName: z.string(),
  orderNumber: z.string(),
  /** Empty when the operator recorded none. Never a guess. */
  carrier: z.string(),
  trackingNumber: z.string(),
  trackingUrl: z.string(),
  estimatedDeliveryAt: optionalInstant,
  items: z.array(emailLineSchema),
  hiddenItemCount: z.number().int().min(0),
});

export type OrderShippedEmailData = z.infer<typeof orderShippedSchema>;

export const orderShippedTemplate: EmailTemplate<OrderShippedEmailData> = {
  name: 'order-shipped',
  version: 1,
  schema: orderShippedSchema,

  /**
   * Fixed wording, one server-generated reference.
   *
   * No carrier name, no tracking number and no customer name in the subject:
   * every one of those is a value that varies in length and content, and a
   * subject assembled from them is a subject that is sometimes truncated to
   * nonsense in a phone's notification.
   */
  subject: (data) => `Your ZyCart order ${data.orderNumber} has shipped`,

  content(data, brand: EmailBrand): EmailContent {
    const tracking = safeExternalUrl(data.trackingUrl);
    const estimate = formatEmailDate(data.estimatedDeliveryAt);

    const facts = [{ label: 'Order', value: data.orderNumber }];

    if (data.carrier) facts.push({ label: 'Carrier', value: data.carrier });
    if (data.trackingNumber) facts.push({ label: 'Tracking number', value: data.trackingNumber });
    if (estimate) facts.push({ label: 'Estimated delivery', value: estimate });

    const paragraphs = [
      tracking
        ? 'Your parcel is on its way. You can follow it with the carrier using the link below.'
        : data.trackingNumber
          ? 'Your parcel is on its way. The tracking number below can be used on the carrier’s own website.'
          : 'Your parcel is on its way. We will email you again when it has been delivered.',
    ];

    return {
      preview: `${data.orderNumber} is on its way.`,
      heading: 'Your order is on its way',
      greeting: greeting(data.customerName),
      paragraphs,
      facts,
      items: toItemBlock(data.items, data.hiddenItemCount),
      // Tracking is the more useful action when there is one, so it takes the
      // primary button and the order page moves to the secondary.
      primary: tracking
        ? { label: 'Track your order', url: tracking }
        : { label: 'View your order', url: orderUrl(brand, data.orderNumber) },
      secondary: tracking
        ? { label: 'View your order', url: orderUrl(brand, data.orderNumber) }
        : undefined,
      notes: estimate
        ? ['Estimated delivery dates come from the carrier and can change.']
        : undefined,
    };
  },
};
