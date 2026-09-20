import { z } from 'zod';
import { formatRupees } from '../../../utils/money';
import type { EmailBrand, EmailContent } from '../render';
import { greeting, orderUrl, returnUrl, type EmailTemplate } from './shared';

/**
 * "Your refund is complete."
 *
 * ## Where the number comes from
 *
 * `amount` is copied from `ReturnRequest.refund.amount` — the figure the server
 * computed from approved quantities and the order's own historical unit prices,
 * capped against what had already been refunded, and then actually sent to
 * Razorpay. It is never recomputed from a catalogue price, never taken from a
 * request body, and never rounded here. It is stored in whole rupees, as every
 * amount in ZyCart is, and formatted by the one function that formats money.
 *
 * ## When this is sent
 *
 * Only when a refund has genuinely completed: the gateway reported `processed`,
 * either on the original call or later through the `refund.processed` webhook.
 * A refund that Razorpay accepted but has not settled is REFUND_PENDING and
 * sends nothing, and a `refund.failed` event sends nothing — it moves the
 * return back so it can be tried again. Telling a customer their money is back
 * when it is not is the single worst message this system could produce.
 */

export const refundCompletedSchema = z.object({
  customerName: z.string(),
  returnNumber: z.string(),
  orderNumber: z.string(),
  /** Whole rupees, from the authoritative refund record. */
  amount: z.number().int().min(0),
});

export type RefundCompletedEmailData = z.infer<typeof refundCompletedSchema>;

export const refundCompletedTemplate: EmailTemplate<RefundCompletedEmailData> = {
  name: 'refund-completed',
  version: 1,
  schema: refundCompletedSchema,

  /**
   * The amount is deliberately not in the subject.
   *
   * A sum of money in a subject line is what a phishing message looks like, and
   * it puts a figure on a lock screen for anyone to read. The reference is
   * enough to identify the message; the amount is one line inside it.
   */
  subject: (data) => `Your ZyCart refund for ${data.returnNumber} is complete`,

  content(data, brand: EmailBrand): EmailContent {
    const amount = formatRupees(data.amount, 'refund amount');

    return {
      preview: `Refund for ${data.returnNumber} completed.`,
      heading: 'Your refund is complete',
      greeting: greeting(data.customerName),
      paragraphs: [
        `We have refunded ${amount} for your return. The payment provider has confirmed it.`,
        'Depending on your bank or card issuer, it can take a few working days to appear on ' +
          'your statement.',
      ],
      facts: [
        { label: 'Refund', value: amount },
        { label: 'Return', value: data.returnNumber },
        { label: 'Order', value: data.orderNumber },
      ],
      primary: { label: 'View refund details', url: returnUrl(brand, data.returnNumber) },
      secondary: { label: 'View the order', url: orderUrl(brand, data.orderNumber) },
      notes: [
        // Honest about where the money goes: ZyCart reverses the original
        // payment and has no ability to send it anywhere else.
        'Refunds are returned to the payment method used for the original order.',
      ],
    };
  },
};
