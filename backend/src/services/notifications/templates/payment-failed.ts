import { z } from 'zod';
import { formatRupees } from '../../../utils/money';
import type { EmailBrand, EmailContent } from '../render';
import {
  emailLineSchema,
  greeting,
  orderUrl,
  rupeesSchema,
  toItemBlock,
  type EmailTemplate,
} from './shared';

/**
 * "Your payment didn't go through."
 *
 * ## Why it is late on purpose
 *
 * Raised by the reminder job for an online order whose payment failed and was
 * not retried within a grace period — not at the moment of failure. Most
 * failures are a declined card retried with another a minute later, and an
 * email announcing a failure that has already been put right, landing beside
 * the confirmation for the payment that worked, is worse than no email at all.
 * By the time this is composed the job has re-read the order and found it still
 * unpaid.
 *
 * ## What it does not claim
 *
 * That money was or was not taken. A failed attempt normally takes nothing, but
 * a bank can hold funds for one and release them later, and ZyCart has no way
 * to see which. The message says what a customer can do about either.
 */

export const paymentFailedSchema = z.object({
  customerName: z.string(),
  orderNumber: z.string(),
  total: rupeesSchema,
  items: z.array(emailLineSchema),
  hiddenItemCount: z.number().int().min(0),
});

export type PaymentFailedEmailData = z.infer<typeof paymentFailedSchema>;

export const paymentFailedTemplate: EmailTemplate<PaymentFailedEmailData> = {
  name: 'payment-failed',
  version: 1,
  schema: paymentFailedSchema,

  subject: (data) => `Your payment for ZyCart order ${data.orderNumber} did not go through`,

  content(data, brand: EmailBrand): EmailContent {
    return {
      preview: `${data.orderNumber} is waiting for payment.`,
      heading: 'Your payment did not go through',
      greeting: greeting(data.customerName),
      paragraphs: [
        'We could not take the payment for your order, so it has not been confirmed yet. Your ' +
          'order is saved, and you can complete the payment from the order page.',
        'If your bank shows a deduction for the failed attempt, it is normally reversed ' +
          'automatically. Contact your bank if it is not.',
      ],
      facts: [
        { label: 'Order', value: data.orderNumber },
        { label: 'Amount due', value: formatRupees(data.total, 'order total') },
      ],
      items: toItemBlock(data.items, data.hiddenItemCount),
      primary: { label: 'Complete your payment', url: orderUrl(brand, data.orderNumber) },
      notes: ['Items are not reserved until the payment is complete, and may sell out.'],
    };
  },
};
