import { z } from 'zod';
import type { EmailBrand, EmailContent } from '../render';
import { greeting, storeUrl, type EmailTemplate } from './shared';

/**
 * "Welcome to ZyCart."
 *
 * Sent once per account, when its address is verified rather than when it is
 * registered. Verification is the moment ZyCart knows the address is real and
 * belongs to the person who signed up; welcoming an address nobody has
 * confirmed is how a store ends up greeting strangers who were signed up by
 * somebody else.
 */

export const welcomeSchema = z.object({
  customerName: z.string(),
});

export type WelcomeEmailData = z.infer<typeof welcomeSchema>;

export const welcomeTemplate: EmailTemplate<WelcomeEmailData> = {
  name: 'welcome',
  version: 1,
  schema: welcomeSchema,

  subject: () => 'Welcome to ZyCart',

  content(data, brand: EmailBrand): EmailContent {
    return {
      preview: 'Your email is verified and your account is ready.',
      heading: 'You are all set',
      greeting: greeting(data.customerName),
      paragraphs: [
        'Thanks for confirming your email address. Your ZyCart account is ready, and order ' +
          'updates, receipts and return details will all arrive at this address.',
      ],
      facts: [],
      primary: { label: 'Start shopping', url: storeUrl(brand, '/shop') },
      secondary: { label: 'Your account', url: storeUrl(brand, '/account') },
      footer: {
        reason: 'You are receiving this because you created a ZyCart account with this address.',
        showAccountLink: true,
      },
    };
  },
};
