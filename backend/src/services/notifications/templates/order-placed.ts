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
 * "Your order is confirmed."
 *
 * ## When it is sent
 *
 * When the order *commits*, which depends on how it is paid. A cash-on-delivery
 * order commits when it is placed, so the message is raised in that
 * transaction. An online order is only an intention until the money arrives —
 * most Razorpay windows that open are never completed — so its message is
 * raised by payment finalisation, in the transaction that marks it paid. A
 * customer who abandons a payment is never told their order is confirmed.
 *
 * ## The money in it
 *
 * The total, the discount and the delivery charge are copied from the order's
 * stored pricing — the figures that were charged, not recomputed from anything.
 * The subject carries none of them, for the reason `refund-completed` gives.
 */

export const orderPlacedSchema = z.object({
  customerName: z.string(),
  orderNumber: z.string(),
  paymentMethod: z.enum(['COD', 'RAZORPAY']),
  total: rupeesSchema,
  shipping: rupeesSchema,
  discount: rupeesSchema,
  /** Empty when no coupon was used. */
  couponCode: z.string(),
  /** "Ahmedabad, Gujarat" — enough to recognise the address, not the whole of it. */
  deliverTo: z.string(),
  items: z.array(emailLineSchema),
  hiddenItemCount: z.number().int().min(0),
});

export type OrderPlacedEmailData = z.infer<typeof orderPlacedSchema>;

export const orderPlacedTemplate: EmailTemplate<OrderPlacedEmailData> = {
  name: 'order-placed',
  version: 1,
  schema: orderPlacedSchema,

  subject: (data) => `Your ZyCart order ${data.orderNumber} is confirmed`,

  content(data, brand: EmailBrand): EmailContent {
    const total = formatRupees(data.total, 'order total');
    const cash = data.paymentMethod === 'COD';

    const facts = [
      { label: 'Order', value: data.orderNumber },
      { label: cash ? 'To pay on delivery' : 'Paid', value: total },
    ];

    if (data.discount > 0) {
      facts.push({
        label: data.couponCode ? `Coupon ${data.couponCode}` : 'Discount',
        value: `−${formatRupees(data.discount, 'discount')}`,
      });
    }

    facts.push({
      label: 'Delivery',
      value: data.shipping > 0 ? formatRupees(data.shipping, 'delivery charge') : 'Free',
    });

    if (data.deliverTo) facts.push({ label: 'Delivering to', value: data.deliverTo });

    return {
      preview: `${data.orderNumber} is confirmed.`,
      heading: 'Thanks for your order',
      greeting: greeting(data.customerName),
      paragraphs: [
        cash
          ? `We have your order and will email you again when it ships. You will pay ${total} in ` +
            'cash when it is delivered.'
          : `We have received your payment of ${total}, and will email you again when your order ` +
            'ships.',
      ],
      facts,
      items: toItemBlock(data.items, data.hiddenItemCount),
      primary: { label: 'View your order', url: orderUrl(brand, data.orderNumber) },
      notes: ['Prices include GST. Your tax invoice will be available once the order ships.'],
    };
  },
};
