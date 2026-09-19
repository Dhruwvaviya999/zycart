import { send } from '@/services/api';
import type { SmartSearchRequest, SmartSearchResult } from '@/types/search';

/**
 * The only route from the browser to search interpretation.
 *
 * It goes to Express, never to a model provider — there is no provider SDK in
 * the client bundle and no key in the browser, exactly as in Phase 10.
 *
 * Called on submit and nowhere else. Typing does not reach this function, which
 * is what keeps a search that needs no interpretation free: the server's own
 * classifier sends short literal queries straight to the catalogue, and the
 * browser never asks for interpretation it does not need.
 */

/** Longer than a product query, shorter than the assistant: one bounded call. */
const SMART_SEARCH_TIMEOUT_MS = 20_000;

export function interpretSearch(
  body: SmartSearchRequest,
  signal?: AbortSignal,
): Promise<SmartSearchResult> {
  return send<SmartSearchResult>('post', '/api/search/smart', body, {
    timeoutMs: SMART_SEARCH_TIMEOUT_MS,
    ...(signal ? { signal } : {}),
  });
}
