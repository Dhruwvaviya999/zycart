import { z } from 'zod';
import * as cartService from '../../cart.service';
import { AppError } from '../../../utils/AppError';
import { defineTool } from './types';

/**
 * The signed-in customer's own cart, priced by the same code that prices the
 * cart page — so the total the assistant quotes is the total on screen.
 *
 * Line ids are left out. They are storage keys the assistant has no use for,
 * and it has no tool that could act on one.
 */
const input = z.object({}).strict();

export const getCartTool = defineTool({
  name: 'get_cart',
  description:
    "Read the signed-in customer's cart: what is in it, how many items, and the current subtotal. Use this whenever they ask what they have, or after adding something if they want the running total.",
  requiresAuth: true,
  input,

  async execute(_args, context) {
    if (!context.userId) throw new AppError('Not authenticated', 401);

    const cart = await cartService.getCart(context.userId);

    return {
      itemCount: cart.itemCount,
      subtotal: cart.subtotal,
      savings: cart.savings,
      items: cart.items.map((item) => ({
        name: item.product?.name ?? 'No longer available',
        brand: item.product?.brand ?? '',
        quantity: item.quantity,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        unitPrice: item.product?.price ?? null,
        lineTotal: item.lineTotal,
        availability: item.availability,
      })),
      notices: cart.notices,
    };
  },
});
