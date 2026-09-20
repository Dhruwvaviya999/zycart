import type mongoose from 'mongoose';
import { Types } from 'mongoose';
import {
  AuditLog,
  type AuditAction,
  type AuditEntity,
  type AuditLogDocument,
} from '../../models/audit-log.model';
import { User } from '../../models/user.model';
import { escapeRegex } from '../../validators/common';
import type { AdminAuditQuery } from '../../validators/admin.validator';

/**
 * The administrative audit trail.
 *
 * Two rules govern every write here, and they are the opposite of the activity
 * service's:
 *
 *  1. **A row means it happened.** Audit writes are on the critical path. Where
 *     the mutation runs in a transaction the audit row is written inside it, so
 *     a rolled-back change leaves no claim that it succeeded — and a failure to
 *     record the change fails the change. A ledger that silently drops entries
 *     under load is a ledger that cannot be used as evidence.
 *  2. **The service writes the sentence.** Callers hand over a summary already
 *     phrased for a person, and named before/after pairs. Nothing here inspects
 *     a request body or diffs a document, which is what keeps a field nobody
 *     thought about — a hash, a token, a gateway secret — from arriving in the
 *     log the day somebody widens an endpoint.
 */

/** Who performed the action, resolved from the session by the controller. */
export interface AuditActor {
  id: string;
  name: string;
  email: string;
}

export interface AuditChange {
  field: string;
  from: string;
  to: string;
}

export interface AuditInput {
  actor: AuditActor;
  action: AuditAction;
  entityType: AuditEntity;
  entityId?: Types.ObjectId | string | null;
  entityLabel?: string;
  summary: string;
  changes?: AuditChange[];
  note?: string;
}

const toObjectId = (value: Types.ObjectId | string | null | undefined): Types.ObjectId | null => {
  if (!value) return null;
  if (value instanceof Types.ObjectId) return value;
  return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : null;
};

/**
 * Writes one audit row.
 *
 * `session` is not optional in spirit: every caller that has a transaction open
 * must pass it, so the record and the change it describes commit or abort
 * together. It is optional in the signature only because two callers genuinely
 * have no transaction to join — product creation and deletion are
 * single-document writes that have already committed by the time this runs, and
 * opening a transaction purely to write a log would be ceremony.
 */
export async function recordAudit(
  input: AuditInput,
  session?: mongoose.ClientSession,
): Promise<void> {
  await AuditLog.create(
    [
      {
        actor: toObjectId(input.actor.id),
        actorName: input.actor.name || input.actor.email || 'Administrator',
        actorEmail: input.actor.email ?? '',
        action: input.action,
        entityType: input.entityType,
        entityId: toObjectId(input.entityId),
        entityLabel: input.entityLabel ?? '',
        summary: input.summary.slice(0, 300),
        changes: input.changes ?? [],
        note: input.note?.trim().slice(0, 300) ?? '',
      },
    ],
    session ? { session } : {},
  );
}

/**
 * One before/after pair, or none when nothing moved.
 *
 * A helper rather than a loop over `Object.keys(body)`, for the reason in the
 * header: the allow-list is the protection, and it has to be written out by the
 * service that knows what is safe to show.
 */
export function changed(field: string, from: unknown, to: unknown): AuditChange[] {
  const before = String(from ?? '');
  const after = String(to ?? '');

  return before === after ? [] : [{ field, from: before, to: after }];
}

export interface AuditLogRow {
  id: string;
  actor: { id: string | null; name: string; email: string };
  action: AuditAction;
  entityType: AuditEntity;
  entityId: string | null;
  entityLabel: string;
  summary: string;
  changes: AuditChange[];
  note: string;
  createdAt: string;
}

type AuditLean = AuditLogDocument & { _id: Types.ObjectId };

function toRow(entry: AuditLean): AuditLogRow {
  return {
    id: String(entry._id),
    actor: {
      id: entry.actor ? String(entry.actor) : null,
      name: entry.actorName,
      email: entry.actorEmail ?? '',
    },
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ? String(entry.entityId) : null,
    entityLabel: entry.entityLabel ?? '',
    summary: entry.summary,
    changes: (entry.changes ?? []).map((change) => ({
      field: change.field,
      from: change.from ?? '',
      to: change.to ?? '',
    })),
    note: entry.note ?? '',
    createdAt: entry.createdAt.toISOString(),
  };
}

/**
 * Resolves an actor filter typed as a name or an email.
 *
 * Capped the same way the order search's customer lookup is: a one-character
 * term matching every account would otherwise build an enormous `$in`.
 */
async function actorIdsMatching(term: string): Promise<Types.ObjectId[]> {
  const pattern = new RegExp(escapeRegex(term), 'i');

  const users = await User.find({
    role: 'ADMIN',
    $or: [{ firstName: pattern }, { lastName: pattern }, { email: pattern }],
  })
    .select('_id')
    .limit(100);

  return users.map((user) => user._id);
}

/**
 * Where an audit window starts, at midnight.
 *
 * Shares `startOfDaysAgo` with the dashboard and the operations service, so
 * "last 7 days" cannot mean two different spans on two admin screens.
 */
export function auditPeriodStart(period: AdminAuditQuery['period']): Date | null {
  if (period === 'all') return null;
  return startOfDaysAgo(period === 'today' ? 1 : period === '7d' ? 7 : 30);
}

/**
 * Midnight, `days - 1` days ago — so "7 days" is seven whole days including
 * today rather than a rolling 168 hours.
 *
 * The timezone is the server process's, which is the honest description of what
 * this does. It is consistent (every admin query resolves through this one
 * function, so no two panels disagree) rather than configurable, because a
 * business-timezone setting that only some queries honoured would be worse than
 * none. Deploy the API with `TZ` set to the store's timezone and every boundary
 * on every admin screen moves together.
 */
export function startOfDaysAgo(days: number): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

export async function listAuditLogs(query: AdminAuditQuery) {
  const filter: Record<string, unknown> = {};

  if (query.action) filter.action = query.action;
  if (query.entityType) filter.entityType = query.entityType;
  if (query.actor) filter.actor = new Types.ObjectId(query.actor);

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    const actors = await actorIdsMatching(query.search);

    // The summary is the sentence an operator read on the feed, so searching
    // for what they remember seeing is the search that actually gets used.
    filter.$or = [
      { summary: pattern },
      { entityLabel: pattern },
      { actorName: pattern },
      ...(actors.length > 0 ? [{ actor: { $in: actors } }] : []),
    ];
  }

  const from = auditPeriodStart(query.period);
  if (from) filter.createdAt = { $gte: from };

  const [entries, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean<AuditLean[]>(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items: entries.map(toRow),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

/** The newest few entries, for the dashboard's activity panel. */
export async function recentActivity(limit: number): Promise<AuditLogRow[]> {
  const entries = await AuditLog.find()
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean<AuditLean[]>();

  return entries.map(toRow);
}

/** Everyone who has performed an audited action, for the audit page's filter. */
export async function listAuditActors(): Promise<{ id: string; name: string }[]> {
  const rows = await AuditLog.aggregate<{ _id: Types.ObjectId | null; name: string }>([
    { $match: { actor: { $ne: null } } },
    { $group: { _id: '$actor', name: { $last: '$actorName' } } },
    { $sort: { name: 1 } },
    { $limit: 50 },
  ]);

  return rows
    .filter((row) => row._id !== null)
    .map((row) => ({ id: String(row._id), name: row.name || 'Administrator' }));
}
