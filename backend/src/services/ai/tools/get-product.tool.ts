import { z } from 'zod';
import * as productService from '../../product.service';
import { OBJECT_ID_PATTERN } from '../../../validators/common';
import { defineTool, ToolError } from './types';
import { remember, toProductDetailView, type CatalogueProduct } from './product-view';

/**
 * One product, in full.
 *
 * The handle is re-resolved against MongoDB every time, which is what makes a
 * detail answer current: a product opened five turns ago and asked about now is
 * read again, so the stock figure in the reply is today's rather than the one
 * the assistant happened to mention earlier.
 */
const input = z
  .object({
    productId: z
      .string()
      .trim()
      .regex(OBJECT_ID_PATTERN, 'must be a product id from an earlier result')
      .optional()
      .describe('The id of a product you have already seen in a tool result.'),
    slug: z
      .string()
      .trim()
      .max(200)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a product slug')
      .optional()
      .describe('The product slug, if you have that instead of an id.'),
  })
  .strict()
  .refine((value) => Boolean(value.productId ?? value.slug), {
    error: 'give either productId or slug',
  });

export const getProductTool = defineTool({
  name: 'get_product',
  description:
    'Look up one product in full: description, specifications, highlights, every colour and size, live price and stock. Use this before answering a question about a specific product, and before adding one to a cart. Never answer a specification question from memory.',
  requiresAuth: false,
  input,

  async execute(args, context) {
    const handle = args.productId ?? args.slug;
    if (!handle) throw new ToolError('Give either productId or slug.');

    // A 404 arrives here as an AppError and is relayed as a tool error, so a
    // product id the model invented comes back as "not found" rather than as
    // anything the assistant could mistake for a real product.
    const product = (await productService.getProduct(handle)) as CatalogueProduct;
    const view = toProductDetailView(product);

    remember(context.shown, [view]);

    return {
      product: view,
      // Stated as a rule the model is reading rather than left for it to infer
      // from an absent key, which is where invented specifications come from.
      note: 'Only the fields present here are known. If the customer asks about something not listed, say you do not have it.',
    };
  },
});
