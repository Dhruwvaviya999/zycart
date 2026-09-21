import { z } from 'zod';
import type { EmailBrand, EmailContent } from '../render';
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
 * "Your order has been delivered."
 *
 * ## The return call-to-action is conditional, and the condition is the real one
 *
 * `returnsOpen` is not "the order says DELIVERED, so returns are probably
 * allowed". It is the answer `returnability` gives — the same pure function the
 * storefront, the API and the return service all consult — evaluated against
 * this order at the moment the message was composed. An email that offers a
 * return the server would refuse is worse than an email that offers nothing: it
 * sends a customer to a page that tells them no, having promised otherwise in
 * writing.
 *
 * Where the window is known, its closing date is printed. Where it is not — an
 * order delivered before ZyCart recorded delivery dates — no date appears and
 * no window is implied.
 */

export const orderDeliveredSchema = z.object({
  customerName: z.string(),
  orderNumber: z.string(),
  /** When delivery was actually recorded. Null for orders that predate it. */
  deliveredAt: optionalInstant,
  items: z.array(emailLineSchema),
  hiddenItemCount: z.number().int().min(0),
  /** Decided by `returnability`, not by the order's status. */
  returnsOpen: z.boolean(),
  returnWindowEndsAt: optionalInstant,
});

export type OrderDeliveredEmailData = z.infer<typeof orderDeliveredSchema>;

export const orderDeliveredTemplate: EmailTemplate<OrderDeliveredEmailData> = {
  name: 'order-delivered',
  version: 1,
  schema: orderDeliveredSchema,

  subject: (data) => `Your ZyCart order ${data.orderNumber} has been delivered`,

  content(data, brand: EmailBrand): EmailContent {
    const deliveredOn = formatEmailDate(data.deliveredAt);
    const windowEnds = formatEmailDate(data.returnWindowEndsAt);

    const facts = [{ label: 'Order', value: data.orderNumber }];
    if (deliveredOn) facts.push({ label: 'Delivered', value: deliveredOn });
    if (data.returnsOpen && windowEnds) {
      facts.push({ label: 'Returns open until', value: windowEnds });
    }

    const paragraphs = ['Your order has been delivered. We hope everything is as you expected.'];

    if (data.returnsOpen) {
      paragraphs.push(
        windowEnds
          ? `If something is not right, you can start a return from your order page until ${windowEnds}.`
          : 'If something is not right, you can start a return from your order page.',
      );
    }

    return {
      preview: `${data.orderNumber} has been delivered.`,
      heading: 'Your order has been delivered',
      greeting: greeting(data.customerName),
      paragraphs,
      facts,
      items: toItemBlock(data.items, data.hiddenItemCount),
      primary: { label: 'View your order', url: orderUrl(brand, data.orderNumber) },
      // Deliberately absent when returns are closed. The order page is still
      // linked above, and it explains why in the customer's own case.
      secondary: data.returnsOpen
        ? { label: 'Start a return', url: `${orderUrl(brand, data.orderNumber)}#returns` }
        : undefined,
      notes: data.returnsOpen
        ? undefined
        : ['Returns for this order are closed. Your order page has the details.'],
    };
  },
};
