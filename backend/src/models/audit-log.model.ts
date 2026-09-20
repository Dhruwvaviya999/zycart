import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * What an administrator did.
 *
 * One row per *successful* mutation. Nothing is written speculatively and
 * nothing is written for a failure — an audit trail that records attempts
 * alongside outcomes cannot answer "did this happen?", which is the only
 * question it exists for. Every write below therefore happens inside the same
 * transaction as the change it describes, or immediately after a change that
 * has already committed.
 *
 * This is a record of administrative action, not a request log. There is no
 * method, no path, no headers and no body here: `PATCH /api/admin/products/671…`
 * tells an operator nothing they can act on six weeks later, whereas "Stock
 * adjusted for Nike Air Max: 24 → 34 (Restock)" tells them everything.
 */
export const AUDIT_ACTIONS = [
  'INVENTORY_ADJUSTED',
  'ORDER_STATUS_CHANGED',
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_DELETED',
  'REVIEW_MODERATED',
  'CUSTOMER_STATUS_CHANGED',

  /**
   * Post-purchase, from Phase 13.
   *
   * Each one is a distinct administrative decision with a distinct consequence,
   * which is why they are separate actions rather than one RETURN_UPDATED with
   * the detail buried in a summary string. An operator filtering for "who has
   * been approving returns this week" is asking a question the filter should be
   * able to answer directly.
   *
   * There is no RETURN_REQUESTED here, and there should not be. A customer
   * asking for a return is not an administrative action, and putting shoppers
   * in the staff audit trail would both dilute it and record an identity the
   * operational log has no use for. The request's own `requestedAt` is where
   * that fact lives.
   */
  'SHIPMENT_CREATED',
  'SHIPMENT_UPDATED',
  'SHIPMENT_STATUS_CHANGED',
  'RETURN_APPROVED',
  'RETURN_REJECTED',
  'RETURN_RECEIVED',
  'RETURN_REFUND_INITIATED',
  'RETURN_REFUND_COMPLETED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITIES = [
  'PRODUCT',
  'ORDER',
  'REVIEW',
  'CUSTOMER',
  'SHIPMENT',
  'RETURN',
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

/**
 * A single before/after pair.
 *
 * Both sides are strings the interface can render directly, produced by the
 * service that made the change — never a raw document diff. That restriction is
 * the protection: a diff of `req.body` against a Mongoose document would
 * cheerfully record a password hash, a session field or a payment identifier
 * the first time somebody widened an endpoint. Naming each field by hand means
 * a new sensitive field cannot arrive here by accident.
 */
const auditChangeSchema = new Schema(
  {
    field: { type: String, required: true },
    from: { type: String, default: '' },
    to: { type: String, default: '' },
  },
  { _id: false },
);

const auditLogSchema = new Schema(
  {
    /**
     * The administrator, by reference and by name.
     *
     * The reference is the truth; the name is a snapshot, because a log that
     * reads "Deleted account changed stock" has lost the point. Email is stored
     * because two staff members may share a first name and an operator needs to
     * tell them apart — it is staff contact detail, already visible to any
     * administrator through the customers screen.
     */
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, required: true, default: 'System' },
    actorEmail: { type: String, default: '' },

    action: { type: String, enum: AUDIT_ACTIONS, required: true },

    entityType: { type: String, enum: AUDIT_ENTITIES, required: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    /** How the entity is named to a person: an order number, a product name. */
    entityLabel: { type: String, default: '' },

    /** One sentence, written by the service, safe to render anywhere. */
    summary: { type: String, required: true, maxlength: 300 },

    changes: { type: [auditChangeSchema], default: [] },

    /** The operator's own words, where the action asked for them. */
    note: { type: String, trim: true, maxlength: 300, default: '' },
  },
  baseSchemaOptions,
);

/** The activity feed, and the audit page's default ordering. */
auditLogSchema.index({ createdAt: -1 });

/** Filtering the audit page by action or by who performed it. */
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

/** "Everything that has happened to this order." */
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;

export const AuditLog = model('AuditLog', auditLogSchema);
