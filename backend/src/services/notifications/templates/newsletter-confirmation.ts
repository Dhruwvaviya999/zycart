import { z } from 'zod';
import type { EmailBrand, EmailContent } from '../render';
import {
  greeting,
  storeUrl,
  tokenSecretSchema,
  type EmailTemplate,
  type TokenSecret,
} from './shared';

/**
 * "Confirm your newsletter subscription" — the second half of double opt-in.
 *
 * Anybody can type any address into a sign-up form, so the form proves nothing
 * about consent. This message is the only thing ZyCart sends to an address
 * that has not confirmed, and it asks exactly one question. An address that
 * never answers is never exported and never mailed again.
 *
 * Addressed to nobody by name, because a subscriber is an address and not an
 * account, and with no account link in the footer for the same reason.
 */

export const newsletterConfirmationSchema = z.object({
  expiresInHours: z.number().int().min(1),
});

export type NewsletterConfirmationEmailData = z.infer<typeof newsletterConfirmationSchema>;

export const newsletterConfirmationTemplate: EmailTemplate<
  NewsletterConfirmationEmailData,
  TokenSecret
> = {
  name: 'newsletter-confirmation',
  version: 1,
  schema: newsletterConfirmationSchema,
  secrets: tokenSecretSchema,

  subject: () => 'Confirm your ZyCart newsletter subscription',

  content(data, brand: EmailBrand, secrets): EmailContent {
    return {
      preview: 'One click and you are subscribed.',
      heading: 'One more step',
      greeting: greeting(''),
      paragraphs: [
        'Please confirm that you would like the ZyCart newsletter: new arrivals, restocks and ' +
          'member pricing, one email a week.',
      ],
      facts: [],
      primary: {
        label: 'Confirm subscription',
        url: storeUrl(brand, '/newsletter/confirm', { token: secrets.token }),
      },
      notes: [
        `This link expires in ${String(data.expiresInHours)} hours.`,
        'If you did not sign up, ignore this email and you will not hear from us again.',
      ],
      footer: {
        reason:
          'You are receiving this because this address was entered in the ZyCart newsletter ' +
          'sign-up form.',
        showAccountLink: false,
      },
    };
  },
};
