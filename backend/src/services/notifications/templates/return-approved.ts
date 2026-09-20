import { z } from 'zod';
import type { EmailBrand, EmailContent } from '../render';
import {
  emailLineSchema,
  greeting,
  orderUrl,
  returnUrl,
  toItemBlock,
  type EmailTemplate,
} from './shared';

/**
 * "Your return has been approved."
 *
 * ## Approved quantities, not requested ones
 *
 * An operator may agree to one of the two units a customer asked to send back.
 * The lines below carry `approvedQuantity`, which is also what the refund is
 * computed from — telling a customer both units were approved and then
 * refunding one is precisely the mistake the two-field design in the return
 * model exists to prevent, and it would be a lie in writing rather than on a
 * screen.
 *
 * ## The note is the customer's note
 *
 * `ReturnRequest` carries two: `resolutionNote`, written for the customer, and
 * `adminNote`, written for colleagues. Only the first is in this template's
 * data contract, so internal commentary cannot reach a customer's inbox by
 * somebody widening a projection later. The payload builder never reads the
 * other field.
 */

export const returnApprovedSchema = z.object({
  customerName: z.string(),
  returnNumber: z.string(),
  orderNumber: z.string(),
  /** Approved quantities, never requested ones. */
  items: z.array(emailLineSchema),
  hiddenItemCount: z.number().int().min(0),
  /** The operator's customer-facing note, or empty. Never `adminNote`. */
  resolutionNote: z.string(),
});

export type ReturnApprovedEmailData = z.infer<typeof returnApprovedSchema>;

export const returnApprovedTemplate: EmailTemplate<ReturnApprovedEmailData> = {
  name: 'return-approved',
  version: 1,
  schema: returnApprovedSchema,

  subject: (data) => `Your ZyCart return ${data.returnNumber} has been approved`,

  content(data, brand: EmailBrand): EmailContent {
    const paragraphs = [
      'We have approved your return request. The next step is to send the items back to us.',
      'Once they arrive and have been checked, we will start your refund and email you again ' +
        'when it is complete.',
    ];

    if (data.resolutionNote) paragraphs.push(`A note from our team: ${data.resolutionNote}`);

    return {
      preview: `Return ${data.returnNumber} approved.`,
      heading: 'Your return has been approved',
      greeting: greeting(data.customerName),
      paragraphs,
      facts: [
        { label: 'Return', value: data.returnNumber },
        { label: 'Order', value: data.orderNumber },
      ],
      items: toItemBlock(data.items, data.hiddenItemCount),
      primary: { label: 'View your return', url: returnUrl(brand, data.returnNumber) },
      secondary: { label: 'View the order', url: orderUrl(brand, data.orderNumber) },
      /**
       * No packing instructions, no courier and no return label.
       *
       * ZyCart has no reverse-logistics integration, so any of those would be a
       * process invented by this email. The return page is where the current
       * state and anything an operator has actually said about it live.
       */
      notes: ['Your return page always shows the latest status of this request.'],
    };
  },
};
