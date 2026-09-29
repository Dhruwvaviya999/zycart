import { z } from 'zod';
import type { EmailBrand, EmailContent } from '../render';
import {
  emailLineSchema,
  greeting,
  ownUrl,
  storeUrl,
  toItemBlock,
  type EmailTemplate,
} from './shared';

/**
 * "You left something in your cart."
 *
 * ## No prices, on purpose
 *
 * A cart stores what was chosen, never what it cost — prices are read from the
 * catalogue on every request. A price printed here would be a snapshot that is
 * wrong the moment anything is repriced, in an email that cannot be corrected.
 * So the message names the items and sends the customer to the cart, which
 * shows what they would pay today.
 *
 * ## The only optional message ZyCart sends
 *
 * Every other message is about something the customer did. This one is a nudge,
 * so it carries a one-click way to stop it, and the reminder job never composes
 * one for a customer who has used it.
 */

export const abandonedCartSchema = z.object({
  customerName: z.string(),
  items: z.array(emailLineSchema),
  hiddenItemCount: z.number().int().min(0),
  /** A signed link that switches cart reminders off for this account. */
  optOutUrl: z.string(),
});

export type AbandonedCartEmailData = z.infer<typeof abandonedCartSchema>;

export const abandonedCartTemplate: EmailTemplate<AbandonedCartEmailData> = {
  name: 'abandoned-cart',
  version: 1,
  schema: abandonedCartSchema,

  subject: () => 'You left something in your ZyCart cart',

  content(data, brand: EmailBrand): EmailContent {
    const optOut = ownUrl(brand, data.optOutUrl);

    return {
      preview: 'Your cart is saved and waiting.',
      heading: 'Still thinking it over?',
      greeting: greeting(data.customerName),
      paragraphs: [
        'The items below are still in your cart. We cannot hold them for you — stock and ' +
          'prices can change — but your cart is saved and they are one tap away.',
      ],
      facts: [],
      items: toItemBlock(data.items, data.hiddenItemCount),
      primary: { label: 'Return to your cart', url: storeUrl(brand, '/cart') },
      footer: {
        reason:
          'You are receiving this because you left items in your ZyCart cart while signed in.',
        showAccountLink: true,
        optOut: optOut ? { label: 'Stop cart reminders', url: optOut } : undefined,
      },
    };
  },
};
