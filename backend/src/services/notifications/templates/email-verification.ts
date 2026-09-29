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
 * "Confirm your email address."
 *
 * The link carries a single-use token that proves whoever opens it can read
 * this inbox. It is a declared secret, so it is handed to this template at send
 * time and never stored — see `EmailTemplate.secrets`.
 *
 * No account link in the footer: whoever receives this may not be the person
 * who registered, and the honest thing to offer them is to ignore it.
 */

export const emailVerificationSchema = z.object({
  customerName: z.string(),
  expiresInHours: z.number().int().min(1),
});

export type EmailVerificationEmailData = z.infer<typeof emailVerificationSchema>;

export const emailVerificationTemplate: EmailTemplate<EmailVerificationEmailData, TokenSecret> = {
  name: 'email-verification',
  version: 1,
  schema: emailVerificationSchema,
  secrets: tokenSecretSchema,

  subject: () => 'Confirm your email address for ZyCart',

  content(data, brand: EmailBrand, secrets): EmailContent {
    return {
      preview: 'One click to confirm this is your address.',
      heading: 'Confirm your email address',
      greeting: greeting(data.customerName),
      paragraphs: [
        'Welcome to ZyCart. Please confirm that this is your email address, so we know your ' +
          'order updates and receipts are reaching the right inbox.',
      ],
      facts: [],
      primary: {
        label: 'Confirm email address',
        url: storeUrl(brand, '/verify-email', { token: secrets.token }),
      },
      notes: [
        `This link works once and expires in ${String(data.expiresInHours)} hours.`,
        'If you did not create a ZyCart account, you can ignore this email.',
      ],
      footer: {
        reason: 'You are receiving this because this address was used to create a ZyCart account.',
        showAccountLink: false,
      },
    };
  },
};
