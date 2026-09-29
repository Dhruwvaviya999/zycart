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
 * "Reset your password."
 *
 * The most sensitive message ZyCart sends: the link in it is, for its lifetime,
 * as good as the account's password. It is therefore a declared secret — never
 * stored on the delivery record, never retried from the console — and it is
 * short-lived and single-use on the server side.
 *
 * The wording tells somebody who did not ask for it that nothing happens if
 * they do nothing, which is true: requesting a reset changes nothing until the
 * link is used.
 */

export const passwordResetSchema = z.object({
  customerName: z.string(),
  expiresInMinutes: z.number().int().min(1),
});

export type PasswordResetEmailData = z.infer<typeof passwordResetSchema>;

export const passwordResetTemplate: EmailTemplate<PasswordResetEmailData, TokenSecret> = {
  name: 'password-reset',
  version: 1,
  schema: passwordResetSchema,
  secrets: tokenSecretSchema,

  subject: () => 'Reset your ZyCart password',

  content(data, brand: EmailBrand, secrets): EmailContent {
    return {
      preview: 'Use this link to choose a new password.',
      heading: 'Reset your password',
      greeting: greeting(data.customerName),
      paragraphs: [
        'We received a request to reset the password for your ZyCart account. Use the button ' +
          'below to choose a new one.',
      ],
      facts: [],
      primary: {
        label: 'Choose a new password',
        url: storeUrl(brand, '/reset-password', { token: secrets.token }),
      },
      notes: [
        `This link works once and expires in ${String(data.expiresInMinutes)} minutes.`,
        'If you did not ask to reset your password, ignore this email — your password will not ' +
          'change.',
      ],
      footer: {
        reason:
          'You are receiving this because a password reset was requested for the ZyCart account ' +
          'with this address.',
        showAccountLink: false,
      },
    };
  },
};
