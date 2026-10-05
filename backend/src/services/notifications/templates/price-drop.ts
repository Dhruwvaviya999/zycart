import { z } from 'zod';
import { formatRupees } from '../../../utils/money';
import type { EmailBrand, EmailContent } from '../render';
import { greeting, rupeesSchema, storeUrl, type EmailTemplate } from './shared';

/**
 * "It's cheaper now." (Phase 20)
 *
 * ## Why this message prints prices when the others avoid them
 *
 * The cart reminder and the restock alert leave prices out, because a printed
 * price goes stale in an email that cannot be corrected. Here the price *is*
 * the news, so both figures are printed — and the message says they were
 * correct when it was sent, rather than promising them.
 *
 * Both figures come from the server: the earlier one was copied from the
 * catalogue when the customer set the alert, the later one when the sweep
 * found it lower. Neither ever came from a request.
 */

export const priceDropSchema = z
  .object({
    customerName: z.string(),
    productName: z.string().min(1),
    productSlug: z.string().min(1),
    previousPrice: rupeesSchema,
    currentPrice: rupeesSchema,
  })
  .refine((data) => data.currentPrice < data.previousPrice, {
    message: 'a price drop must be a drop',
    path: ['currentPrice'],
  });

export type PriceDropEmailData = z.infer<typeof priceDropSchema>;

export const priceDropTemplate: EmailTemplate<PriceDropEmailData> = {
  name: 'price-drop',
  version: 1,
  schema: priceDropSchema,

  subject: (data) => `Price drop: ${data.productName}`,

  content(data, brand: EmailBrand): EmailContent {
    const now = formatRupees(data.currentPrice, 'current price');
    const was = formatRupees(data.previousPrice, 'previous price');
    const saving = formatRupees(data.previousPrice - data.currentPrice, 'saving');

    return {
      preview: `${data.productName} is now ${now}, down from ${was}.`,
      heading: 'The price has dropped',
      greeting: greeting(data.customerName),
      paragraphs: [
        `You asked us to tell you if ${data.productName} got cheaper. It is now ${now}, ` +
          `${saving} less than when you asked.`,
        'Prices were correct when this email was sent and can change again. The product page ' +
          'always shows the current price.',
      ],
      facts: [
        { label: 'Product', value: data.productName },
        { label: 'Was', value: was },
        { label: 'Now', value: now },
      ],
      primary: {
        label: 'View the product',
        url: storeUrl(brand, `/products/${encodeURIComponent(data.productSlug)}`),
      },
      secondary: { label: 'Manage your alerts', url: storeUrl(brand, '/account/alerts') },
      footer: {
        reason:
          'You are receiving this because you asked ZyCart to tell you if this item’s price ' +
          'dropped. We send it once; ask again on the product page to keep watching.',
        showAccountLink: true,
      },
    };
  },
};
