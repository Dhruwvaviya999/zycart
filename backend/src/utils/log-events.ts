/**
 * Every event name ZyCart emits, in one list.
 *
 * ## Why a closed list and not a free string
 *
 * An event name is the thing an operator greps for at three in the morning. It
 * is also the thing that silently rots: one file writes `payment_failed`, a
 * second writes `paymentFailed`, a third writes `payment-failed`, and a search
 * for any of them now finds a third of the truth. That failure is invisible in
 * review and expensive in an incident.
 *
 * So the names live here, the type is derived from the array, and
 * `logger.info('payment_finalised', …)` with a name that is not in this list is
 * a **compile error**. Adding an event is a deliberate edit to one file, which
 * is exactly the friction that keeps the vocabulary stable.
 *
 * ## The convention
 *
 * `snake_case`, `subject_verb`, past tense for things that happened
 * (`payment_finalized`) and present for things that are true
 * (`notification_stale`). American `-ized` spellings throughout, matching the
 * outcome strings the payment service already returns to callers
 * (`FINALIZED`), so a log line and an API response name the same event the same
 * way. `tests/logger.test.ts` enforces the casing mechanically.
 *
 * ## What does not belong here
 *
 * A name per function. Phase 16 instruments boundaries — startup, requests,
 * payments, refunds, notifications, inventory, catalogue — not call sites. An
 * event that would only ever be emitted from one line, and that no operator
 * would ever search for, is a comment wearing a log line's clothes.
 */
export const LOG_EVENTS = [
  /* Process lifecycle ------------------------------------------------ */
  'server_started',
  'server_start_failed',
  'server_stopping',
  'server_stopped',
  'uncaught_exception',
  'unhandled_rejection',

  /* Database --------------------------------------------------------- */
  'database_connected',
  'database_connection_failed',

  /* HTTP ------------------------------------------------------------- */
  'request_completed',
  'request_failed',

  /* Health ----------------------------------------------------------- */
  'health_degraded',

  /* Payments --------------------------------------------------------- */
  'payment_webhook_received',
  'payment_webhook_rejected',
  'payment_webhook_duplicate',
  'payment_webhook_ignored',
  'payment_verification_attempted',
  'payment_rejected',
  'payment_finalized',
  'payment_marked_failed',
  'payment_gateway_failed',
  'payment_gateway_order_created',

  /* Refunds ---------------------------------------------------------- */
  'refund_initiated',
  'refund_processed',
  'refund_failed',

  /* Notifications ---------------------------------------------------- */
  'notification_claimed',
  'notification_sent',
  'notification_failed',
  'notification_stale',
  'notification_provider_failed',

  /* Inventory -------------------------------------------------------- */
  'inventory_adjusted',
  'inventory_restocked',
  'inventory_threshold_changed',

  /* Activity and discovery ------------------------------------------- */
  'activity_record_failed',
  'search_completed',
  'search_interpretation_failed',

  /* ZyCart AI -------------------------------------------------------- */
  'ai_request_completed',
  'ai_request_failed',
  'ai_provider_failed',
] as const;

/** The only names `logger.*` will accept. */
export type LogEvent = (typeof LOG_EVENTS)[number];
