import { request, send, type RequestOptions } from '@/services/api';
import type { AlertView, CreateAlertInput } from '@/types/alert';

/**
 * Every call the storefront makes about alerts (Phase 20).
 *
 * All of them need a session, and all of them are scoped to it by the server:
 * there is no way to name another customer, and an alert id that is not this
 * customer's answers 404 exactly as one that does not exist.
 */

/**
 * This customer's alerts, waiting ones first.
 *
 * `productId` narrows the list to one product, which is how the product page
 * learns whether it is already being watched without fetching everything.
 */
export function getAlerts(
  query: { productId?: string } = {},
  options?: RequestOptions,
): Promise<AlertView[]> {
  return request<AlertView[]>(
    '/api/alerts',
    query.productId ? { productId: query.productId } : undefined,
    options,
  );
}

/**
 * Asks to be told. Idempotent: asking twice for the same thing answers with
 * the alert that already exists rather than a second one.
 *
 * Refused with a 409 when a restock is asked about something that is in stock
 * now, or when the customer already has as many alerts waiting as the shop
 * allows — both messages are written to be shown as they are.
 */
export function createAlert(input: CreateAlertInput): Promise<AlertView> {
  const body =
    input.type === 'BACK_IN_STOCK'
      ? {
          productId: input.productId,
          type: input.type,
          selectedColor: input.selectedColor ?? null,
          selectedSize: input.selectedSize ?? null,
        }
      : { productId: input.productId, type: input.type };

  return send<AlertView>('post', '/api/alerts', body);
}

export async function deleteAlert(alertId: string): Promise<void> {
  await send<null>('delete', `/api/alerts/${encodeURIComponent(alertId)}`);
}
