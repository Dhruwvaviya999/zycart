import { z } from 'zod';
import type { EmailBrand, EmailContent } from '../render';
import { greeting, storeUrl, type EmailTemplate } from './shared';

/**
 * "It's back." (Phase 20)
 *
 * ## What it promises, and what it does not
 *
 * That the thing the customer asked about could be bought at the moment the
 * alert sweep looked. Not that it still can by the time they read this: stock
 * is not held for anybody, and the message says so rather than implying a
 * reservation that does not exist.
 *
 * ## No price
 *
 * A price printed here is wrong the moment the product is repriced, in an
 * email nobody can correct. The product page shows what it costs today.
 */

export const backInStockSchema = z.object({
  customerName: z.string(),
  productName: z.string().min(1),
  productSlug: z.string().min(1),
  /** `Black · Size 9`, or empty when the alert was about the product as a whole. */
  variant: z.string(),
});

export type BackInStockEmailData = z.infer<typeof backInStockSchema>;

export const backInStockTemplate: EmailTemplate<BackInStockEmailData> = {
  name: 'back-in-stock',
  version: 1,
  schema: backInStockSchema,

  subject: (data) => `Back in stock: ${data.productName}`,

  content(data, brand: EmailBrand): EmailContent {
    const what = data.variant ? `${data.productName} in ${data.variant}` : data.productName;

    return {
      preview: `${what} is available again.`,
      heading: 'It’s back in stock',
      greeting: greeting(data.customerName),
      paragraphs: [
        `You asked us to tell you when ${what} was available again. It is.`,
        'We cannot hold it for you, and popular items can sell out again quickly.',
      ],
      facts: [
        { label: 'Product', value: data.productName },
        ...(data.variant ? [{ label: 'Option', value: data.variant }] : []),
      ],
      primary: {
        label: 'View the product',
        url: storeUrl(brand, `/products/${encodeURIComponent(data.productSlug)}`),
      },
      secondary: { label: 'Manage your alerts', url: storeUrl(brand, '/account/alerts') },
      footer: {
        reason:
          'You are receiving this because you asked ZyCart to tell you when this item was back ' +
          'in stock. We send it once; ask again on the product page to hear about the next restock.',
        showAccountLink: true,
      },
    };
  },
};
