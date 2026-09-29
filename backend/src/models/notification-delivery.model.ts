import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * One message ZyCart owes a customer, and what happened to it.
 *
 * ## Why this is a record and not a function call
 *
 * The temptation in Phase 14 was to call a mail library from the shipment
 * service and be done. That design makes email delivery part of the commerce
 * transaction: a mail server that is slow makes marking an order shipped slow,
 * and a mail server that is down makes it fail. ZyCart refuses that trade. The
 * *intent* to communicate is durable state, written in the same transaction as
 * the business change that caused it, and the send is a separate act performed
 * afterwards against this row.
 *
 * So the pair
 *
 *     Order   = SHIPPED
 *     Delivery = FAILED
 *
 * is a state this system can be in, on purpose, and one an operator can see and
 * act on. The reverse — an order that is not shipped because a mail server
 * refused a connection — is not.
 *
 * ## What this is not
 *
 * It is not the audit log. `AuditLog` records what an administrator did;
 * this records what a customer was told. They answer different questions, have
 * different subjects and different retention pressures, and merging them would
 * have produced a feed where "Dhruw approved a return" and "we emailed Priya"
 * were the same kind of row.
 *
 * It is not a job queue either. There is no worker, no lease renewal and no
 * scheduler here, and this phase does not pretend otherwise — see
 * `docs/phase-14.md` for exactly which guarantees that does and does not buy.
 */

/**
 * The customer-facing transitions ZyCart communicates.
 *
 * Four, because four are the ones Phase 13 left a customer having to discover
 * by opening the site. The architecture below would carry twenty; adding
 * nineteen more because it could is how a transactional mail system becomes a
 * mailing list.
 *
 * Each value names a *business transition*, not a database state. That
 * distinction is what stops "your order has shipped" going out because a parcel
 * reached EXCEPTION — an exception implies the order is already SHIPPED, so no
 * transition into SHIPPED occurs and no event is raised.
 *
 * ## Phase 18
 *
 * Seven more, each closing a gap a customer used to fall into:
 *
 * - **ORDER_PLACED** — the order committed: placed on cash on delivery, or paid.
 * - **PAYMENT_FAILED** — an online payment failed and was not retried. Raised
 *   by the reminder job after a grace period, not at the failure, because most
 *   failed attempts are retried within a minute and an email saying "your
 *   payment failed" beside a confirmation saying it succeeded is worse than
 *   silence.
 * - **ABANDONED_CART** — a signed-in customer's cart sat untouched. Also raised
 *   by the reminder job, and the only message here a customer can switch off.
 * - **WELCOME** — an address was verified.
 * - **EMAIL_VERIFICATION**, **PASSWORD_RESET**, **NEWSLETTER_CONFIRMATION** — the
 *   three messages that carry a single-use link. See `NotificationOutbox` for
 *   why those links are never stored here.
 */
export const NOTIFICATION_EVENTS = [
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'RETURN_APPROVED',
  'REFUND_COMPLETED',
  'ORDER_PLACED',
  'PAYMENT_FAILED',
  'ABANDONED_CART',
  'WELCOME',
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
  'NEWSLETTER_CONFIRMATION',
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/**
 * Which collection the event is about. Mirrors `AUDIT_ENTITIES`' vocabulary.
 *
 * USER for account messages, SUBSCRIBER for the newsletter's confirmation —
 * whose recipient is an address, not an account — and CART for reminders.
 */
export const NOTIFICATION_ENTITIES = ['ORDER', 'RETURN', 'USER', 'SUBSCRIBER', 'CART'] as const;
export type NotificationEntity = (typeof NOTIFICATION_ENTITIES)[number];

/**
 * The lifecycle of one delivery.
 *
 * Four states, and deliberately no DELIVERED. ZyCart has no bounce handling and
 * no provider delivery webhooks, so it knows whether a message was *accepted*
 * and nothing beyond that. A DELIVERED state would be a claim about a
 * customer's mail server that this system is in no position to make, and an
 * operator reading it would reasonably conclude the customer had the message.
 *
 * - **PENDING** — the intent exists and no attempt has succeeded. Either
 *   nothing has been tried yet, or every attempt so far failed temporarily with
 *   attempts still left in the budget.
 * - **SENDING** — an attempt is in flight. A claim, held by exactly one caller;
 *   see `STALE_SENDING_MS` for what happens when the process holding it dies.
 * - **SENT** — the configured provider accepted the message for delivery. That
 *   is the whole of the claim. It does not mean the message arrived, was not
 *   filtered, or was read.
 * - **FAILED** — the provider rejected the message outright, or the automatic
 *   attempts were used up without one being accepted. Terminal only in the
 *   sense that nothing automatic will touch it again; an administrator can
 *   still retry it by hand.
 */
export const DELIVERY_STATUSES = ['PENDING', 'SENDING', 'SENT', 'FAILED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/**
 * Whether a failure is worth trying again.
 *
 * A connection timeout is a fact about the network five seconds ago. A rejected
 * recipient address is a fact about the address, and re-sending to it a hundred
 * times produces a hundred rejections and one irritated mail provider. The
 * classification is what stops the automatic retry loop from doing that.
 *
 * `TEMPORARY` is the default for anything unrecognised. Guessing "permanent"
 * for an error nobody anticipated would silently stop retrying messages that
 * would have gone through.
 */
export const FAILURE_KINDS = ['TEMPORARY', 'PERMANENT'] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/**
 * The last thing that went wrong, in ZyCart's words.
 *
 * Summarised by the provider adapter before it gets here, never the raw error
 * object: an SMTP transport's error can carry the command it was running at the
 * time, and that command may be `AUTH PLAIN <base64 credentials>`. Nothing in
 * this sub-document may contain a secret, and the way that is guaranteed is
 * that the adapter builds the sentence rather than the error being stringified
 * into it.
 */
const deliveryFailureSchema = new Schema(
  {
    kind: { type: String, enum: FAILURE_KINDS, required: true },
    /** One sentence an operator can act on. "SMTP connection timed out." */
    reason: { type: String, required: true, maxlength: 300 },
    at: { type: Date, required: true },
  },
  { _id: false },
);

export const MAX_NOTIFICATION_KEY_LENGTH = 120;

const notificationDeliverySchema = new Schema(
  {
    /**
     * The identity of this communication: `EVENT:reference`.
     *
     * `ORDER_SHIPPED:ZY10482`. Unique, and that index is the whole of the
     * duplicate-prevention story — not a check-then-insert, which two
     * concurrent callers both pass.
     *
     * The reference half is the number a customer would quote, not an ObjectId,
     * because that is what makes the key legible in a database shell at two in
     * the morning. Both halves are server-generated; nothing a client sends
     * reaches this field.
     */
    key: { type: String, required: true, maxlength: MAX_NOTIFICATION_KEY_LENGTH },

    event: { type: String, enum: NOTIFICATION_EVENTS, required: true },

    entityType: { type: String, enum: NOTIFICATION_ENTITIES, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    /** How the entity is named to a person: `ZY10482`, `ZYR-000123`. */
    entityLabel: { type: String, required: true },
    /** The order behind a return, so one filter finds everything about a sale. */
    orderNumber: { type: String, default: '' },

    /**
     * The customer, by reference and by resolved address.
     *
     * The address is resolved from the account **at the moment the intent is
     * created**, inside the same transaction, and frozen here. Two consequences,
     * both intended: no browser can ever nominate a recipient, and a customer
     * who changes their email tomorrow does not retroactively change where
     * today's shipping notice was sent — which is what the record has to say to
     * be worth keeping.
     *
     * From Phase 18 the recipient is a customer *or* a newsletter subscriber,
     * and exactly one of these two references is set. The address is resolved
     * from whichever it is, by the service, in the same way.
     */
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    subscriber: { type: Schema.Types.ObjectId, ref: 'Subscriber', default: null },
    recipientEmail: { type: String, required: true, maxlength: 254 },
    /** For the greeting. Empty when the account has no usable name. */
    recipientName: { type: String, default: '', maxlength: 160 },

    /**
     * Which template rendered this, and which revision of it.
     *
     * Stored so a retry six months from now produces the message that was
     * intended then rather than whatever the current template says. Without the
     * version, editing a template would silently rewrite history for every
     * delivery still waiting to go out.
     */
    template: { type: String, required: true, maxlength: 60 },
    templateVersion: { type: Number, required: true, min: 1 },

    /**
     * The data the template was given, as a snapshot.
     *
     * This is the reason a retry is deterministic. It is also the only personal
     * data here beyond the address and the name — product names, a tracking
     * number, a refund amount — and it is bounded by what the message itself
     * contained, which the customer received in any case. The rendered HTML is
     * deliberately **not** stored: it is large, it is reproducible from this,
     * and keeping every body ever sent would turn this collection into a mail
     * archive nobody asked for.
     *
     * Re-validated against the template's schema before every render, because a
     * document read back from the database is input like any other.
     */
    payload: { type: Schema.Types.Mixed, required: true },

    /** The rendered subject line, kept so the console can show it verbatim. */
    subject: { type: String, required: true, maxlength: 200 },

    status: { type: String, enum: DELIVERY_STATUSES, required: true, default: 'PENDING' },

    /**
     * How many sends have been started for this message.
     *
     * Incremented by the same atomic update that claims the row, so it counts
     * attempts actually begun rather than attempts intended — which is the
     * figure that matters when asking whether a customer might have received
     * two copies.
     */
    attempts: { type: Number, required: true, default: 0, min: 0 },
    lastAttemptAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },

    /**
     * Which transport accepted it, recorded at send time rather than read from
     * configuration later. A message sent while the deployment was on the mock
     * provider must not start claiming it went out over SMTP because somebody
     * has since reconfigured the server.
     */
    provider: { type: String, default: '' },
    /** The provider's own id for the message, when it returns one. */
    providerMessageId: { type: String, default: null, maxlength: 200 },

    /** The most recent failure. Kept after a later success; see the schema above. */
    failure: { type: deliveryFailureSchema, default: null },
  },
  baseSchemaOptions,
);

/**
 * One delivery per event per entity.
 *
 * This index *is* the idempotency guarantee. A duplicate webhook, a
 * double-clicked button, a retried request and a `withTransaction` retry all
 * converge on the same key, and exactly one of them gets to create the row.
 *
 * Declared here rather than as `unique: true` on the path so it sits with the
 * other indexes and can carry this explanation — and because declaring it in
 * both places makes Mongoose warn and drop the options on the second
 * definition, which would have left the constraint off entirely.
 */
notificationDeliverySchema.index({ key: 1 }, { unique: true });

/** The console's default view, and its status filter. */
notificationDeliverySchema.index({ status: 1, createdAt: -1 });

/** Filtering the console by what happened. */
notificationDeliverySchema.index({ event: 1, createdAt: -1 });

/** "Everything we have told this customer about this order." */
notificationDeliverySchema.index({ entityId: 1, createdAt: -1 });

export type NotificationDeliveryDocument = InferSchemaType<typeof notificationDeliverySchema>;

export const NotificationDelivery = model('NotificationDelivery', notificationDeliverySchema);
