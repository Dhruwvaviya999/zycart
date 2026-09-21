import mongoose, { Types, type QueryFilter } from 'mongoose';
import type { Env } from '../../config/env';
import {
  appOrigin,
  appUrl,
  AUTOMATIC_RETRY_DEADLINE_MS,
  AUTOMATIC_RETRY_DELAYS_MS,
  emailConfig,
  MAX_AUTOMATIC_ATTEMPTS,
  STALE_SENDING_MS,
} from '../../config/notifications';
import {
  NotificationDelivery,
  type DeliveryStatus,
  type NotificationDeliveryDocument,
  type NotificationEntity,
  type NotificationEvent,
} from '../../models/notification-delivery.model';
import { User } from '../../models/user.model';
import { AppError } from '../../utils/AppError';
import { logger, serializeError } from '../../utils/logger';
import { escapeRegex } from '../../validators/common';
import type { AdminNotificationQuery } from '../../validators/notification.validator';
import { startOfDaysAgo } from '../admin/audit.service';
import { EmailDeliveryError, type EmailProvider } from './provider';
import type { EmailBrand } from './render';
import { getEmailProvider } from './runtime';
import { renderNotification, templateFor } from './templates';

/**
 * What ZyCart tells customers, and whether it managed to.
 *
 * ## The one rule everything here serves
 *
 * **Email is never the source of truth.** A shipment is shipped because the
 * shipment document says so, not because a message left the building. So the
 * shape of every integration in this phase is the same:
 *
 *     begin transaction
 *       change the domain state
 *       record the intent to communicate      <- this file, `queueNotification`
 *       write the audit row
 *     commit
 *     attempt delivery                        <- this file, `NotificationOutbox.flush`
 *
 * The send happens *after* the commit and can fail freely. What it cannot do is
 * hold a transaction open across a network call to a mail server, and what it
 * cannot do is take a committed business fact back.
 *
 * ## What this guarantees, precisely
 *
 * - **One intent per event, exactly once.** The unique index on `key` is the
 *   whole mechanism. A duplicate webhook, a double-clicked button, a retried
 *   request and a `withTransaction` retry all resolve to one row.
 * - **Delivery is idempotent, bounded and retryable.** A send is claimed
 *   atomically, attempted a bounded number of times, and left in a state an
 *   operator can see and act on.
 *
 * It does **not** guarantee exactly-once delivery of an email, and this phase
 * does not claim it. SMTP can accept a message and have the acknowledgement
 * lost on the way back, at which point ZyCart genuinely does not know whether
 * the message was sent. That is a property of talking to a remote mail system
 * without provider-side idempotency, not something a better design here would
 * fix — see `docs/phase-14.md`.
 */

/** The customer a message is addressed to, resolved from the account. */
export interface Recipient {
  email: string;
  /** For the greeting. Empty when the account has no usable first name. */
  firstName: string;
  /** For the To header's display name. */
  fullName: string;
}

export interface NotificationIntent {
  event: NotificationEvent;
  entityType: NotificationEntity;
  entityId: Types.ObjectId;
  /** The reference a customer would quote. Forms half of the idempotency key. */
  entityLabel: string;
  /** The order behind a return, so one search finds everything about a sale. */
  orderNumber: string;
  userId: Types.ObjectId;
  /**
   * How to shape the message, given the recipient this service resolved.
   *
   * A function rather than a ready-made payload, because resolving *who* gets a
   * message is this service's job and not the caller's. There is no parameter
   * anywhere in this file through which a caller — let alone a browser — can
   * nominate an address.
   */
  buildPayload: (recipient: Recipient) => unknown;
}

/**
 * The deliveries created by one business operation, to be attempted after it
 * commits.
 *
 * ## Why a collector rather than sending inline
 *
 * `transitionOrderStatus` runs inside somebody else's transaction and has no
 * business performing network I/O. It drops an id in here instead, and the
 * entry point that owns the transaction flushes after committing.
 *
 * ## Why retries and rollbacks need no special handling
 *
 * `withTransaction` may run its callback several times, so the same id can
 * arrive twice and ids from an aborted attempt can arrive for rows that no
 * longer exist. Neither matters: ids are de-duplicated by the map, and delivery
 * begins with an atomic claim that matches nothing for a row that was rolled
 * back or already claimed. Correctness comes from the claim, not from the
 * collector being tidy.
 */
export class NotificationOutbox {
  private readonly ids = new Map<string, Types.ObjectId>();

  collect(id: Types.ObjectId | null): void {
    if (id) this.ids.set(String(id), id);
  }

  get size(): number {
    return this.ids.size;
  }

  /**
   * Attempts every collected delivery. Never throws.
   *
   * A customer must not be told their order could not be marked shipped because
   * a mail server was unreachable, and an administrator must not see a 500 for
   * a business operation that succeeded. Failures are recorded on the delivery
   * rows and logged; the caller's response is unaffected.
   */
  async flush(env: Env): Promise<void> {
    for (const id of this.ids.values()) {
      try {
        await deliverAutomatically(env, id);
      } catch (error) {
        logger.error('notification_failed', {
          reason: 'unexpected',
          notificationId: String(id),
          error: serializeError(error, { stack: true }),
        });
      }
    }

    this.ids.clear();
  }
}

/* ---------------------------------------------------------------- */
/* Creating the intent                                               */
/* ---------------------------------------------------------------- */

/** `ORDER_SHIPPED:ZY10482`. Both halves are server-generated. */
export function notificationKey(event: NotificationEvent, entityLabel: string): string {
  return `${event}:${entityLabel}`;
}

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;

/**
 * The account's address, or nothing.
 *
 * Read from `User` and from nowhere else, inside the caller's transaction, at
 * the moment the intent is created. Three consequences, all deliberate: the
 * browser cannot choose a recipient, a customer who changes their email
 * tomorrow does not retroactively change where today's message went, and the
 * address recorded on the row is the one the message was actually addressed to.
 *
 * A deactivated account still receives these. Deactivation stops somebody
 * signing in; it does not cancel the store's obligation to tell them their
 * refund has completed.
 */
async function resolveRecipient(
  userId: Types.ObjectId,
  session: mongoose.ClientSession,
): Promise<Recipient | null> {
  const user = await User.findById(userId).select('email firstName lastName').session(session);

  if (!user?.email) return null;

  return {
    email: user.email,
    firstName: user.firstName.trim(),
    fullName: `${user.firstName} ${user.lastName}`.trim(),
  };
}

/**
 * Records that ZyCart owes this customer this message.
 *
 * Runs **inside** the caller's transaction, so the intent and the business
 * change it describes commit together or not at all. Nothing here touches the
 * network.
 *
 * Returns the id of a newly created delivery, or null when one already existed
 * — which is the ordinary outcome of a duplicate webhook or a re-run of an
 * operation, and is not an error.
 */
export async function queueNotification(
  intent: NotificationIntent,
  session: mongoose.ClientSession,
  outbox?: NotificationOutbox,
): Promise<Types.ObjectId | null> {
  const key = notificationKey(intent.event, intent.entityLabel);

  /**
   * The cheap check first, so the ordinary duplicate — the same event
   * processed twice in sequence — costs one indexed read and does not disturb
   * the transaction.
   *
   * It is not the guarantee. Two genuinely concurrent transactions can both
   * find nothing here; the unique index below is what decides between them.
   */
  const existing = await NotificationDelivery.findOne({ key }).select('_id').session(session);

  if (existing) return null;

  const recipient = await resolveRecipient(intent.userId, session);
  const template = templateFor(intent.event);

  /**
   * Built even when there is no recipient, so the row still says what would
   * have been sent. A delivery record with no payload would be an operational
   * dead end: an operator could see that something failed and not what.
   */
  const payload = intent.buildPayload(
    recipient ?? { email: '', firstName: '', fullName: '' },
  );

  /**
   * The payload is validated here as well as at send time.
   *
   * Catching a malformed payload now means the failure is attached to the
   * operation that caused it, while the stack still points at the builder that
   * produced it — rather than surfacing minutes later as a mysterious permanent
   * failure on the notifications screen.
   */
  const subject = template.subject(payload);

  const now = new Date();

  const base = {
    key,
    event: intent.event,
    entityType: intent.entityType,
    entityId: intent.entityId,
    entityLabel: intent.entityLabel,
    orderNumber: intent.orderNumber,
    user: intent.userId,
    template: template.name,
    templateVersion: template.version,
    payload,
    subject,
  };

  /**
   * An account with no usable address is a permanent failure recorded honestly,
   * not a thrown error.
   *
   * Aborting the transaction would mean a shipment could not be dispatched
   * because of a problem with a mailbox, which is exactly the coupling this
   * phase exists to prevent. The row says what happened and the console shows
   * it.
   */
  const document = recipient
    ? { ...base, recipientEmail: recipient.email, recipientName: recipient.fullName }
    : {
        ...base,
        recipientEmail: '',
        recipientName: '',
        status: 'FAILED' as DeliveryStatus,
        failure: {
          kind: 'PERMANENT' as const,
          reason: 'This account has no email address on file, so there is nowhere to send this.',
          at: now,
        },
      };

  try {
    const [created] = await NotificationDelivery.create([document], { session });
    if (!created) return null;

    // A row with no recipient is never handed to the outbox: there is nothing
    // to attempt, and a claim on it would only burn an attempt to fail again.
    if (recipient) outbox?.collect(created._id);

    return created._id;
  } catch (error) {
    /**
     * Two concurrent transactions reached the insert with the same key and the
     * unique index refused the second. MongoDB aborts a transaction on a failed
     * write, so this cannot be swallowed and carried on from — and it should
     * not be: the business operation that raced is the duplicate, and refusing
     * it is correct. Reported as the conflict it is rather than as a 500.
     */
    if (isDuplicateKey(error)) {
      throw new AppError(
        'This update was just recorded by another request. Refresh to see the latest state.',
        409,
      );
    }

    throw error;
  }
}

/* ---------------------------------------------------------------- */
/* Delivery                                                          */
/* ---------------------------------------------------------------- */

/** The deployment's identity as an email sees it. Configuration only. */
export function emailBrand(env: Env): EmailBrand {
  const config = emailConfig(env);

  return {
    appOrigin: appOrigin(env),
    // Null unless a real support address is configured; never invented.
    supportEmail: config.replyTo,
    accountUrl: appUrl(env, '/account/orders'),
  };
}

export type AttemptOutcome =
  /** The provider accepted the message. */
  | { result: 'SENT' }
  /** It failed, and another attempt could still help. */
  | { result: 'RETRYABLE'; reason: string }
  /** It failed and will not be retried automatically. */
  | { result: 'FAILED'; reason: string; permanent: boolean }
  /** Nothing to do: already sent, already claimed, out of budget, or gone. */
  | { result: 'NOT_ELIGIBLE' };

/**
 * One attempt at one message.
 *
 * ## The claim is the concurrency control
 *
 * Two administrators pressing Retry at the same moment, or a retry racing the
 * automatic dispatch, both run this. The `findOneAndUpdate` below is atomic:
 * exactly one caller moves the row into SENDING and gets the document back, and
 * everybody else is told NOT_ELIGIBLE before a message can be composed, let
 * alone sent. The attempt counter is incremented by the same update, so it
 * counts sends actually begun.
 *
 * ## Why every subsequent write is conditional on SENDING
 *
 * The row is only this caller's while it holds the claim. Writing the outcome
 * with `status: 'SENDING'` still in the filter means a caller that somehow lost
 * the claim — a stale reclaim by an operator, say — cannot overwrite the state
 * the current holder has since written.
 */
/**
 * Who is asking for a send, and therefore what they are allowed to claim.
 *
 * Three callers, three different eligibility rules, all expressed as database
 * filters so that the rule and the claim are one operation. See
 * `eligibilityFilter` for what each one may take.
 */
export type AttemptMode =
  /** Immediately after the transaction that raised the event. */
  | 'automatic'
  /** An administrator pressing Retry on one message. */
  | 'manual'
  /** `pnpm notifications:drain`, recovering work a crash stranded. */
  | 'drain'
  /** The drain, explicitly told to reclaim abandoned SENDING rows as well. */
  | 'drain-stale';

/** When a SENDING row is old enough to be treated as abandoned. */
export const staleSendingBefore = (now: Date = new Date()): Date =>
  new Date(now.getTime() - STALE_SENDING_MS);

/**
 * What each caller may claim, as a query the database evaluates atomically.
 *
 * ## The rules, and why they differ
 *
 * - **automatic** — PENDING or FAILED, with attempts left in the budget. This
 *   runs in the request that caused the event and is the only mode that loops.
 * - **manual** — anything not already SENT, plus a SENDING row abandoned long
 *   enough that the process holding it must have died. Not bounded by the
 *   automatic budget: a person pressing a button is not a loop.
 * - **drain** — PENDING only, with attempts left. Deliberately *not* FAILED:
 *   a message that has used its budget is one an operator should look at, and a
 *   cron job that quietly kept retrying it would turn a bounded policy into an
 *   unbounded one. See `docs/phase-15.md`.
 * - **drain-stale** — as `drain`, plus abandoned SENDING rows. Separate because
 *   reclaiming one can put a second copy of a message in a customer's inbox;
 *   the operator has to ask for it.
 *
 * `SENT` appears in none of them. A message the provider has accepted is never
 * re-sent by any path in this file.
 */
function eligibilityFilter(
  mode: AttemptMode,
  now: Date,
): QueryFilter<NotificationDeliveryDocument> {
  const withBudget = { attempts: { $lt: MAX_AUTOMATIC_ATTEMPTS } };
  // Typed as the delivery status it is, so the literal narrows for Mongoose
  // rather than widening to `string` inside an object literal.
  const abandoned: QueryFilter<NotificationDeliveryDocument> = {
    status: 'SENDING' as DeliveryStatus,
    lastAttemptAt: { $lt: staleSendingBefore(now) },
  };

  switch (mode) {
    case 'automatic':
      return { status: { $in: ['PENDING', 'FAILED'] }, ...withBudget };
    case 'manual':
      return { $or: [{ status: { $in: ['PENDING', 'FAILED'] } }, abandoned] };
    case 'drain':
      return { status: 'PENDING', ...withBudget };
    case 'drain-stale':
      return { $or: [{ status: 'PENDING', ...withBudget }, abandoned] };
  }
}

/**
 * The ids a drain could work on, without claiming any of them.
 *
 * Reads only, and bounded. Used to page through eligible work and — with
 * `--dry-run` — to report what a real run would do without touching a row.
 * The claim is still what decides ownership: an id returned here may well be
 * claimed by another drain before this one gets to it, which is exactly why the
 * caller must treat a `NOT_ELIGIBLE` outcome as ordinary.
 */
export async function eligibleForDrain(
  mode: 'drain' | 'drain-stale',
  limit: number,
  options: { now?: Date; exclude?: readonly Types.ObjectId[] } = {},
): Promise<Types.ObjectId[]> {
  const now = options.now ?? new Date();
  const exclude = options.exclude ?? [];

  /**
   * `exclude` carries the ids this drain run has already attempted.
   *
   * It is not an optimisation, it is correctness. A temporary failure leaves a
   * message PENDING with one more attempt spent, so it is immediately eligible
   * again — and a page that came back full of rows the caller had just tried
   * would look like "no new work" and stop the run with a backlog still
   * waiting. Excluding them makes an empty page mean what it says.
   *
   * Bounded by the run's own limit, so the `$nin` stays small.
   */
  const filter = {
    ...eligibilityFilter(mode, now),
    ...(exclude.length > 0 ? { _id: { $nin: exclude } } : {}),
  };

  const rows = await NotificationDelivery.find(filter)
    // Oldest first: the customer who has been waiting longest is told first,
    // and the ordering is stable across concurrent drains.
    .sort({ createdAt: 1, _id: 1 })
    .limit(limit)
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();

  return rows.map((row) => row._id);
}

async function attemptDelivery(
  env: Env,
  id: Types.ObjectId,
  options: { mode: AttemptMode },
): Promise<AttemptOutcome> {
  const now = new Date();

  const claimed = await NotificationDelivery.findOneAndUpdate(
    { _id: id, ...eligibilityFilter(options.mode, now) },
    { $set: { status: 'SENDING', lastAttemptAt: now }, $inc: { attempts: 1 } },
    { returnDocument: 'after' },
  );

  if (!claimed) return { result: 'NOT_ELIGIBLE' };

  /**
   * DEBUG, not INFO.
   *
   * A claim is one half of a pair — every claim is followed by a `sent` or a
   * `failed` within the same call, and the outcome carries the same fields. At
   * INFO it would double the volume of the notification log to say nothing the
   * next line does not. It earns its place during an incident, where a claim
   * with no outcome after it is the signature of a process that died mid-send
   * and the one thing that identifies which message it was.
   *
   * The recipient is not here, and is not anywhere: the id and the event say
   * which message this is, and the delivery row holds the address for anyone
   * with a reason to look.
   */
  logger.debug('notification_claimed', {
    notificationId: String(id),
    eventType: claimed.event,
    attempt: claimed.attempts,
    mode: options.mode,
  });

  if (!claimed.recipientEmail) {
    const reason = 'There is no address on this delivery to send to.';
    await recordFailure(id, reason, { terminal: true, permanent: true }, '');
    return { result: 'FAILED', reason, permanent: true };
  }

  let provider: EmailProvider;

  try {
    provider = getEmailProvider(env);
  } catch {
    const reason = 'The email provider is not configured correctly on the server.';
    await recordFailure(id, reason, { terminal: true, permanent: true }, '');
    return { result: 'FAILED', reason, permanent: true };
  }

  let message;

  try {
    const rendered = renderNotification(claimed.event, claimed.payload, emailBrand(env));

    message = {
      to: claimed.recipientEmail,
      toName: claimed.recipientName,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      meta: {
        notificationId: String(claimed._id),
        event: claimed.event,
        template: rendered.template,
      },
    };
  } catch {
    /**
     * The stored snapshot no longer satisfies its template's schema. Permanent
     * by definition: retrying re-reads the same snapshot. The message names the
     * template rather than echoing the validation error, which could otherwise
     * print payload values into a row an operator's browser will render.
     */
    const reason =
      `The saved message data no longer matches the "${claimed.template}" template ` +
      `(version ${String(claimed.templateVersion)}), so it cannot be rendered.`;

    await recordFailure(id, reason, { terminal: true, permanent: true }, provider.name);
    return { result: 'FAILED', reason, permanent: true };
  }

  try {
    const { messageId } = await provider.send(message);

    await NotificationDelivery.updateOne(
      { _id: id, status: 'SENDING' },
      {
        $set: {
          status: 'SENT',
          sentAt: new Date(),
          provider: provider.name,
          providerMessageId: messageId,
        },
      },
    );

    logger.info('notification_sent', {
      notificationId: String(id),
      eventType: claimed.event,
      attempt: claimed.attempts,
      provider: provider.name,
      // Says out loud that the mock provider delivered nothing, on the line
      // that would otherwise read as a successful send.
      delivered: provider.name !== 'mock',
    });

    return { result: 'SENT' };
  } catch (error) {
    const permanent = error instanceof EmailDeliveryError ? error.permanent : false;
    const reason =
      error instanceof EmailDeliveryError
        ? error.reason
        : 'The message could not be handed to the email provider.';

    /**
     * Out of automatic budget counts as failed even for a temporary cause: the
     * distinction the status carries is "will anything try this again by
     * itself", and at this point nothing will.
     */
    const exhausted = claimed.attempts >= MAX_AUTOMATIC_ATTEMPTS;
    const terminal = permanent || exhausted;

    await recordFailure(id, reason, { terminal, permanent }, provider.name);

    // The reason is ZyCart's own sentence, never the provider's raw error. See
    // `classifySmtpError` for why that distinction is a security control — an
    // SMTP rejection frequently quotes the credentials it refused.
    logger.error('notification_failed', {
      notificationId: String(id),
      eventType: claimed.event,
      attempt: claimed.attempts,
      provider: provider.name,
      reason,
      permanent,
      terminal,
    });

    return terminal
      ? { result: 'FAILED', reason, permanent }
      : { result: 'RETRYABLE', reason };
  }
}

/**
 * Writes the outcome of a failed attempt.
 *
 * ## Two independent facts, deliberately two parameters
 *
 * `terminal` answers "will anything try this again by itself?" and decides the
 * status: FAILED means nothing will, PENDING means the budget has attempts
 * left. `permanent` answers "could a further attempt ever succeed?" and decides
 * the classification.
 *
 * They are not the same question, and collapsing them was a real bug: three
 * connection timeouts exhaust the budget, which is terminal, but the cause is
 * as temporary as it was on the first attempt. Recording that as PERMANENT made
 * the console tell an operator a retry was unlikely to help — about a message
 * that would go out on the next attempt.
 *
 * The reason is kept either way, because a delivery that eventually succeeded
 * after two timeouts is worth knowing about.
 */
async function recordFailure(
  id: Types.ObjectId,
  reason: string,
  options: { terminal: boolean; permanent: boolean },
  provider: string,
): Promise<void> {
  await NotificationDelivery.updateOne(
    { _id: id, status: 'SENDING' },
    {
      $set: {
        status: options.terminal ? 'FAILED' : 'PENDING',
        failure: {
          kind: options.permanent ? 'PERMANENT' : 'TEMPORARY',
          reason: reason.slice(0, 300),
          at: new Date(),
        },
        ...(provider ? { provider } : {}),
      },
    },
  );
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One drain attempt at one message.
 *
 * The drain's only route into sending. It performs exactly one attempt with no
 * inline retry loop, because a drain run that retried within itself would spend
 * the automatic budget on a single message while others waited — and because
 * the next scheduled run is the retry.
 *
 * A `NOT_ELIGIBLE` outcome is ordinary and not an error: it means another drain,
 * an administrator or the original request got there between the read that
 * listed this id and the claim that would have taken it.
 */
export function deliverForDrain(
  env: Env,
  id: Types.ObjectId,
  mode: 'drain' | 'drain-stale',
): Promise<AttemptOutcome> {
  return attemptDelivery(env, id, { mode });
}

/**
 * The automatic attempt loop for one message.
 *
 * Bounded twice over: by `MAX_AUTOMATIC_ATTEMPTS`, and by a wall-clock deadline
 * measured from the first attempt. The deadline exists because this runs
 * between a committed transaction and the HTTP response an administrator is
 * waiting for — so a mail server that has gone away must cost a few seconds,
 * not a few minutes.
 *
 * Stopping early is not a failure of the design; it is the design. The delivery
 * is left PENDING with its attempts recorded, visible on the notifications
 * screen, and retryable by hand. What it must never do is loop.
 */
async function deliverAutomatically(env: Env, id: Types.ObjectId): Promise<AttemptOutcome> {
  const startedAt = Date.now();

  for (let round = 0; round < MAX_AUTOMATIC_ATTEMPTS; round += 1) {
    const outcome = await attemptDelivery(env, id, { mode: 'automatic' });

    if (outcome.result !== 'RETRYABLE') return outcome;

    const delay = AUTOMATIC_RETRY_DELAYS_MS[round];
    if (delay === undefined) return outcome;
    if (Date.now() - startedAt + delay > AUTOMATIC_RETRY_DEADLINE_MS) return outcome;

    await sleep(delay);
  }

  return { result: 'NOT_ELIGIBLE' };
}

/* ---------------------------------------------------------------- */
/* Reading, for the console                                          */
/* ---------------------------------------------------------------- */

export interface NotificationRow {
  id: string;
  event: NotificationEvent;
  entityType: NotificationEntity;
  entityLabel: string;
  orderNumber: string;
  customer: { name: string; email: string };
  subject: string;
  status: DeliveryStatus;
  attempts: number;
  createdAt: string;
  lastAttemptAt: string | null;
  sentAt: string | null;
  /** Empty until an attempt has been made. Never a credential or a raw error. */
  failureReason: string;
  /**
   * A SENDING row whose attempt was abandoned longer ago than the stale
   * threshold.
   *
   * Computed rather than stored, and deliberately **not** a fifth status. The
   * fact is "this row has been SENDING for a long time", which is a reading of
   * `status` and `lastAttemptAt` together — storing it would mean a value that
   * has to be kept true by something, and nothing would be keeping it true.
   *
   * It is on the row rather than only the detail because the one question this
   * screen exists to answer is "is anything stuck?", and an operator should be
   * able to see the answer without opening five records.
   */
  stale: boolean;
}

export interface NotificationDetail extends NotificationRow {
  template: string;
  templateVersion: number;
  /** `mock` or `smtp`, as recorded at send time. Empty before the first attempt. */
  provider: string;
  providerMessageId: string | null;
  failureKind: 'TEMPORARY' | 'PERMANENT' | null;
  canRetry: boolean;
  /** Why not, for the operator. Empty when it can. */
  retryBlockedReason: string;
  /** True when the claim looks abandoned rather than active. */
  staleSending: boolean;
}

type DeliveryLean = {
  _id: Types.ObjectId;
  event: NotificationEvent;
  entityType: NotificationEntity;
  entityLabel: string;
  orderNumber?: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  status: DeliveryStatus;
  attempts: number;
  createdAt: Date;
  lastAttemptAt?: Date | null;
  sentAt?: Date | null;
  template: string;
  templateVersion: number;
  provider?: string;
  providerMessageId?: string | null;
  failure?: { kind: 'TEMPORARY' | 'PERMANENT'; reason: string; at: Date } | null;
};

/** `SENDING`, and last touched longer ago than any transport would take. */
const isStale = (entry: DeliveryLean, now: Date): boolean =>
  entry.status === 'SENDING' &&
  (entry.lastAttemptAt?.getTime() ?? 0) < now.getTime() - STALE_SENDING_MS;

function toRow(entry: DeliveryLean, now: Date = new Date()): NotificationRow {
  return {
    id: String(entry._id),
    event: entry.event,
    entityType: entry.entityType,
    entityLabel: entry.entityLabel,
    orderNumber: entry.orderNumber ?? '',
    customer: { name: entry.recipientName ?? '', email: entry.recipientEmail },
    subject: entry.subject,
    status: entry.status,
    attempts: entry.attempts,
    createdAt: entry.createdAt.toISOString(),
    lastAttemptAt: entry.lastAttemptAt?.toISOString() ?? null,
    sentAt: entry.sentAt?.toISOString() ?? null,
    failureReason: entry.failure?.reason ?? '',
    stale: isStale(entry, now),
  };
}

/**
 * Whether Retry would do anything, decided on the server.
 *
 * The console renders this rather than working it out, exactly as the return
 * actions render `allowedStatuses` — so the button is offered only when it
 * would succeed, and the reason is shown when it would not.
 */
function retryability(
  entry: DeliveryLean,
  now: Date,
): { canRetry: boolean; reason: string; stale: boolean } {
  const stale = isStale(entry, now);

  if (entry.status === 'SENT') {
    return { canRetry: false, reason: 'This message was already accepted by the provider.', stale };
  }

  if (entry.status === 'SENDING' && !stale) {
    return { canRetry: false, reason: 'A send is in progress. Refresh in a moment.', stale };
  }

  if (!entry.recipientEmail) {
    return {
      canRetry: false,
      reason: 'There is no address on this delivery, so there is nothing to retry.',
      stale,
    };
  }

  return { canRetry: true, reason: '', stale };
}

function toDetail(entry: DeliveryLean, now: Date = new Date()): NotificationDetail {
  const { canRetry, reason, stale } = retryability(entry, now);

  return {
    ...toRow(entry, now),
    template: entry.template,
    templateVersion: entry.templateVersion,
    provider: entry.provider ?? '',
    providerMessageId: entry.providerMessageId ?? null,
    failureKind: entry.failure?.kind ?? null,
    canRetry,
    retryBlockedReason: reason,
    staleSending: stale,
  };
}

export async function listNotifications(query: AdminNotificationQuery) {
  const filter: Record<string, unknown> = {};

  if (query.status) filter.status = query.status;
  if (query.event) filter.event = query.event;

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    // The three things an operator has in front of them when they come looking:
    // a customer's email, an order number, or a return number.
    filter.$or = [
      { entityLabel: pattern },
      { orderNumber: pattern },
      { recipientEmail: pattern },
    ];
  }

  // Shares `startOfDaysAgo` with the audit and dashboard queries, so "last 7
  // days" cannot mean two different spans on two admin screens.
  if (query.period !== 'all') {
    filter.createdAt = { $gte: startOfDaysAgo(query.period === 'today' ? 1 : query.period === '7d' ? 7 : 30) };
  }

  const now = new Date();

  const [entries, total] = await Promise.all([
    NotificationDelivery.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<DeliveryLean[]>(),
    NotificationDelivery.countDocuments(filter),
  ]);

  return {
    items: entries.map((entry) => toRow(entry, now)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getNotification(id: string): Promise<NotificationDetail> {
  const entry = await NotificationDelivery.findById(id).lean<DeliveryLean | null>();

  if (!entry) throw new AppError('Notification not found', 404);

  return toDetail(entry);
}

export interface RetryResult {
  delivery: NotificationDetail;
  /**
   * Whether the message is now sent — **not** whether this request sent it.
   *
   * The distinction is real and it took two administrators clicking at the same
   * instant to surface it. The loser of that race finds the row already SENT,
   * and "is it sent?" is then true for both callers while only one of them
   * caused it. This flag drives the tone of the message shown, so "it is sent"
   * is the right reading for it; `claimed` is how a caller learns which of the
   * two it was.
   */
  sent: boolean;
  /**
   * Whether this request performed the attempt.
   *
   * Exactly one of two concurrent retries can be true, because exactly one can
   * win the atomic claim. Without this, a count of `sent` responses would say
   * two sends happened when one did.
   */
  claimed: boolean;
  message: string;
}

/**
 * One further attempt, on an administrator's instruction.
 *
 * ## What it is not allowed to do
 *
 * It sends a message. It does not move an order, a shipment, a return, a
 * payment or a unit of stock, and it does not create a second delivery record.
 * The only writes it performs are to this one row's status, attempt count,
 * provider fields and failure — which is why retrying is a safe thing to leave
 * in a console.
 *
 * ## Two administrators, one send
 *
 * Both calls reach `attemptDelivery`, and its atomic claim admits exactly one.
 * The loser composes nothing and sends nothing; it re-reads the row and reports
 * where it got to, which by then may well be SENT. `claimed` is what separates
 * "I sent this" from "this is sent" — see `RetryResult`.
 */
export async function retryNotification(env: Env, id: string): Promise<RetryResult> {
  const before = await NotificationDelivery.findById(id).lean<DeliveryLean | null>();

  if (!before) throw new AppError('Notification not found', 404);

  const { canRetry, reason } = retryability(before, new Date());

  if (!canRetry) throw new AppError(reason, 409);

  const outcome = await attemptDelivery(env, before._id, { mode: 'manual' });
  const delivery = await getNotification(id);

  if (outcome.result === 'SENT') {
    return { delivery, sent: true, claimed: true, message: 'Email sent successfully.' };
  }

  if (outcome.result === 'NOT_ELIGIBLE') {
    /**
     * Something changed between the read above and the claim — almost always
     * another administrator's retry landing first. Not an error: the operator
     * is shown the current state, which may well now be SENT.
     *
     * `claimed: false` says this request did nothing, which is what stops the
     * pair being counted as two sends.
     */
    return {
      delivery,
      sent: delivery.status === 'SENT',
      claimed: false,
      message:
        delivery.status === 'SENT'
          ? 'This message has been sent. Another attempt got there first.'
          : 'This delivery was being handled elsewhere. Refresh to see where it got to.',
    };
  }

  return {
    delivery,
    sent: false,
    claimed: true,
    message:
      'The email could not be sent. The delivery remains failed and can be retried later.',
  };
}

/* ---------------------------------------------------------------- */
/* Operational summary                                               */
/* ---------------------------------------------------------------- */

export interface CommunicationSummary {
  pending: number;
  failed: number;
  sentToday: number;
  /**
   * Deliveries abandoned mid-send.
   *
   * Counted separately from `pending` because they need a different action:
   * nothing — not the automatic loop, not the drain — will touch one without a
   * person deciding to, since reclaiming it can duplicate a message. It is the
   * only genuinely stuck state this subsystem has, and the one number an
   * operator must not have to go looking for.
   */
  stale: number;
  /**
   * The transport this deployment is currently configured with.
   *
   * Reported because "124 sent today" means something very different on `mock`
   * than on `smtp`, and an operator reading the number is entitled to know
   * which. It is a provider name, never a host, a username or a credential.
   */
  provider: string;
  checkedAt: string;
}

export async function getCommunicationSummary(env: Env): Promise<CommunicationSummary> {
  const now = new Date();

  const [pending, failed, sentToday, stale] = await Promise.all([
    // SENDING is counted with PENDING: from an operator's point of view both
    // mean "not yet sent", and separating them would put a transient state on
    // a summary card where it would mostly read zero. An *abandoned* SENDING
    // row is a different matter and is counted on its own, below.
    NotificationDelivery.countDocuments({ status: { $in: ['PENDING', 'SENDING'] } }),
    NotificationDelivery.countDocuments({ status: 'FAILED' }),
    NotificationDelivery.countDocuments({ status: 'SENT', sentAt: { $gte: startOfDaysAgo(1) } }),
    NotificationDelivery.countDocuments({
      status: 'SENDING',
      lastAttemptAt: { $lt: staleSendingBefore(now) },
    }),
  ]);

  return {
    pending,
    failed,
    sentToday,
    stale,
    provider: emailConfig(env).provider,
    checkedAt: now.toISOString(),
  };
}

/**
 * When ZyCart last successfully emailed this customer about this entity.
 *
 * One indexed lookup returning one field, used by the customer's own order and
 * return pages to say "we emailed you an update" — and only when that is true.
 * Deliberately not a list: a customer page has no use for delivery history, and
 * loading one would put an operational subsystem on the critical path of an
 * ordinary page view.
 */
export async function lastNotifiedAt(entityId: Types.ObjectId): Promise<string | null> {
  const entry = await NotificationDelivery.findOne({ entityId, status: 'SENT' })
    .sort({ sentAt: -1 })
    .select('sentAt')
    .lean<{ sentAt?: Date | null } | null>();

  return entry?.sentAt?.toISOString() ?? null;
}
