import { api } from '@/services/api';

/**
 * Tells the server that a product page was opened.
 *
 * Deliberately the whole of this file. There is no `track(event, payload)` here
 * and there must not be one: the event type is fixed by the route, the customer
 * comes from the session cookie, and the product is resolved server-side — so
 * none of the three things that matter are the browser's to claim.
 *
 * Never awaited by the page, and every failure is swallowed. A product page
 * renders whether or not this succeeds, and a shopper is never told that a
 * recommendation-feeding write did not happen.
 */
export function recordProductView(slug: string): void {
  void api
    .post(
      `/api/products/${encodeURIComponent(slug)}/view`,
      /**
       * `undefined`, not `null`.
       *
       * Axios serialises an explicit `null` body to the four characters
       * `null`, sends them with `Content-Type: application/json`, and
       * `express.json()` rejects that as malformed before any handler runs. The
       * endpoint takes no body at all, so the request must carry none.
       *
       * This was silently swallowing every view: the `.catch()` below hides the
       * 400, so the write looked optional and simply never happened. Found
       * while regression-testing Phase 13 — see `docs/phase-13.md`.
       */
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => {
      // A signed-out visitor gets a 401 here, which is the expected answer
      // rather than a problem. Either way the shopper sees nothing.
    });
}
