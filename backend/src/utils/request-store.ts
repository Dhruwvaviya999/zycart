import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The correlation id, available to code that was never handed it.
 *
 * ## The problem this solves
 *
 * A request id is only useful if it appears on *every* line that request
 * caused. The HTTP record is easy — the middleware has both. The lines that
 * matter in an incident are not: `payment_webhook_rejected` is written four
 * calls deep in `payment.service`, and `notification_failed` is written from a
 * function that runs after the response has been composed.
 *
 * There are two honest ways to get the id there. Thread a logger through every
 * service signature, or carry it in ambient context.
 *
 * ## Why ambient context won
 *
 * Threading would have meant a new parameter on roughly a hundred functions,
 * nearly all of which do not log, in order to reach the eight that do. Every
 * one of those signatures is part of how this codebase reads; every one of
 * them has tests. Changing all of it so that observability could be added to a
 * handful of boundaries is the wrong trade — and the *first* call site that
 * could not reach a threaded logger would quietly log without an id, which is
 * the failure the whole exercise was meant to prevent.
 *
 * `AsyncLocalStorage` is Node's own answer, needs no dependency, and survives
 * `await`, promise chains and callbacks — which is exactly the shape of the
 * code that needs it.
 *
 * ## What it is not
 *
 * It is not a request-scoped service locator, and nothing but the correlation
 * id may be put in it. Ambient state is genuinely dangerous — code that reads
 * it behaves differently depending on who called it, which is the hardest kind
 * of bug to reproduce. One immutable string, written once per request, read
 * only by the logger, is a bound small enough to keep that from happening. The
 * type below enforces it.
 *
 * ## Cost
 *
 * One `run()` per request, and one map lookup per log call. Nothing is
 * allocated per `await`, and code outside a request — a CLI script, a test —
 * simply gets `undefined` and logs without the field.
 */

interface RequestStore {
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

/** Runs `callback` with `requestId` visible to everything it awaits. */
export function withRequestId<T>(requestId: string, callback: () => T): T {
  return storage.run({ requestId }, callback);
}

/** The current request's id, or undefined outside a request. */
export const currentRequestId = (): string | undefined => storage.getStore()?.requestId;
