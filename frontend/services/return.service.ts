import { request, requestList, send, type RequestOptions } from '@/services/api';
import type { Pagination } from '@/types/product';
import type {
  CreateReturnInput,
  ReturnRequest,
  ReturnStatus,
  ReturnSummary,
} from '@/types/fulfillment';

/**
 * The customer's return calls.
 *
 * ## What is not in this file
 *
 * No eligibility check, no window arithmetic, no refund amount. Every one of
 * those is decided on the server and arrives already decided — the order detail
 * carries a `returnability` block that says whether a return may be started and
 * why not, and the return itself carries the refund the server computed. A
 * browser that worked any of it out would be a second copy of the policy, free
 * to drift from the one that actually enforces it.
 *
 * What the browser sends is what only the customer knows: which lines, how
 * many, and why.
 */

/**
 * Raises a return against one of the caller's own orders.
 *
 * Addressed by order reference in the path rather than in the body: the order
 * is what ownership is checked against, and there is no request shape in which
 * it can be absent or mismatched.
 */
export function createReturn(orderRef: string, input: CreateReturnInput): Promise<ReturnRequest> {
  return send<ReturnRequest>(
    'post',
    `/api/orders/${encodeURIComponent(orderRef)}/returns`,
    input,
  );
}

export interface ReturnListParams {
  page?: number;
  limit?: number;
  status?: ReturnStatus;
}

export async function getReturns(
  params: ReturnListParams = {},
  options?: RequestOptions,
): Promise<{ items: ReturnSummary[]; pagination: Pagination }> {
  const query: Record<string, string | number> = {};
  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.status) query.status = params.status;

  return requestList<ReturnSummary>('/api/returns', query, options);
}

/** Accepts a return number or an id; either way it is scoped to its owner. */
export function getReturnByRef(
  returnRef: string,
  options?: RequestOptions,
): Promise<ReturnRequest> {
  return request<ReturnRequest>(
    `/api/returns/${encodeURIComponent(returnRef)}`,
    undefined,
    options,
  );
}

/**
 * Withdraws a request the customer no longer wants.
 *
 * No body: there is nothing to say. Whether it is still withdrawable is the
 * server's call, and the page offers the button only when the server said so
 * through `canCancel`.
 */
export function cancelReturn(returnRef: string): Promise<ReturnRequest> {
  return send<ReturnRequest>('post', `/api/returns/${encodeURIComponent(returnRef)}/cancel`);
}
