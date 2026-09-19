import { z } from 'zod';
import * as cartService from '../../cart.service';
import * as productService from '../../product.service';
import { AppError } from '../../../utils/AppError';
import { objectIdSchema } from '../../../validators/common';
import { MAX_CART_QUANTITY, addCartItemSchema } from '../../../validators/cart.validator';
import { defineTool, ToolError } from './types';
import { remember, toProductDetailView, type CatalogueProduct } from './product-view';

/**
 * The one tool in Phase 10 that changes anything.
 *
 * It writes through `cartService.addItem` — the same function the Add-to-cart
 * button calls — so every rule the cart has ever enforced still applies:
 * the product must exist and be active, it must be in stock, a chosen colour
 * or size must be one the product actually offers, quantity is clamped to
 * what is available, and the line folds into a matching one instead of
 * duplicating. None of that is re-implemented here, and none of it can be
 * argued out of the model, because the model never touches MongoDB.
 *
 * Ownership comes from the verified session. There is no `userId` argument for
 * a model to hallucinate, and the registry refuses this tool outright when
 * nobody is signed in.
 */
const input = z
  .object({
    productId: objectIdSchema.describe('Id of a product from an earlier tool result.'),
    quantity: z
      .number()
      .int()
      .min(1)
      .max(MAX_CART_QUANTITY)
      .default(1)
      .describe(
        `How many, 1 to ${String(MAX_CART_QUANTITY)}. Default 1 unless the customer said otherwise.`,
      ),
    selectedColor: z
      .string()
      .trim()
      .max(60)
      .nullish()
      .describe('Exact colour name from the product. Required if the product has colours.'),
    selectedSize: z
      .string()
      .trim()
      .max(60)
      .nullish()
      .describe('Exact size label from the product. Required if the product has sizes.'),
  })
  .strict();

export const addToCartTool = defineTool({
  name: 'add_to_cart',
  description:
    "Add a product to the signed-in customer's cart. Only call this when the customer has explicitly asked for it — recommending a product is not permission to add it. If the product has sizes or colours and the customer has not said which, ask them first; never choose for them. This cannot check out, pay or place an order.",
  requiresAuth: true,
  input,

  async execute(args, context) {
    // Belt and braces: the registry has already refused an unauthenticated
    // call, so reaching here without a user is a bug, not a request.
    if (!context.userId) throw new AppError('Not authenticated', 401);

    const product = toProductDetailView(
      (await productService.getProduct(args.productId)) as CatalogueProduct,
    );
    remember(context.shown, [product]);

    /**
     * The cart would refuse a missing variant on its own — this only makes the
     * refusal answerable. "Please choose a size" leaves the assistant guessing
     * which sizes exist; handing it the list lets it ask a question the
     * customer can answer in one word, without ever picking a size itself.
     */
    if (product.colors.length > 0 && !args.selectedColor) {
      throw new ToolError(
        `${product.name} comes in several colours. Ask the customer which one they want — do not choose.`,
        { availableColors: product.colors },
      );
    }

    if (product.sizes.length > 0 && !args.selectedSize) {
      throw new ToolError(
        `${product.name} comes in several sizes. Ask the customer which size they want — do not choose.`,
        { availableSizes: product.sizes.filter((size) => size.inStock).map((size) => size.label) },
      );
    }

    // Parsed again through the cart's own schema, so the assistant is held to
    // the identical contract as the HTTP endpoint rather than a parallel one.
    const payload = addCartItemSchema.parse({
      productId: args.productId,
      quantity: args.quantity,
      selectedColor: args.selectedColor ?? null,
      selectedSize: args.selectedSize ?? null,
    });

    const cart = await cartService.addItem(context.userId, payload);

    const line = cart.items.find(
      (item) =>
        item.product?.id === args.productId &&
        item.selectedColor === payload.selectedColor &&
        item.selectedSize === payload.selectedSize,
    );

    return {
      added: true,
      product: { id: product.id, name: product.name, brand: product.brand },
      requestedQuantity: payload.quantity,
      /**
       * What the cart ended up holding, not what was asked for. When stock cut
       * the quantity short this is the number the assistant must report — the
       * whole point of returning it separately from `requestedQuantity`.
       */
      quantityInCart: line?.quantity ?? payload.quantity,
      selectedColor: payload.selectedColor,
      selectedSize: payload.selectedSize,
      cartItemCount: cart.itemCount,
      cartSubtotal: cart.subtotal,
      notices: cart.notices,
      note: 'Tell the customer exactly what the cart now holds. Checkout and payment are theirs to do from the cart page.',
    };
  },
});
