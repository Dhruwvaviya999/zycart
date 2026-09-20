import type { Metadata } from 'next';
import { Activity } from 'lucide-react';
import { AdminEmpty, AdminError, AdminPageHeader } from '@/components/admin/admin-ui';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { AuditFilters } from '@/components/admin/audit-filters';
import { AuditLogList } from '@/components/admin/audit-log-list';
import { toErrorMessage } from '@/services/api';
import { getAuditActors, getAuditLogs } from '@/services/admin.service';
import { getSessionCookie } from '@/lib/server-auth';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  type AuditAction,
  type AuditEntity,
  type AuditQuery,
} from '@/types/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Activity log' };

/**
 * Who did what, to which thing, and when.
 *
 * One row per *successful* administrative change. Nothing is recorded for an
 * attempt that failed or a transaction that rolled back — a log that mixes
 * intentions with outcomes cannot answer "did this happen?", which is the only
 * question it exists for.
 *
 * What is deliberately absent: request paths, headers, bodies, tokens, and
 * anything a diff of a document might have swept up. Each row's sentence and
 * its before/after pairs are written by the service that made the change, from
 * a named list of fields, so a sensitive field added later cannot arrive here
 * by accident.
 */
type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const PERIODS = ['today', '7d', '30d', 'all'] as const;

function toQuery(params: Params): AuditQuery {
  const page = Number(one(params.page));
  const action = one(params.action);
  const entityType = one(params.entityType);
  const period = one(params.period);

  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: 25,
    search: one(params.search)?.trim() || undefined,
    action: AUDIT_ACTIONS.includes(action as AuditAction) ? (action as AuditAction) : undefined,
    entityType: AUDIT_ENTITIES.includes(entityType as AuditEntity)
      ? (entityType as AuditEntity)
      : undefined,
    // Dropped unless it looks like an id, so a hand-edited URL is an empty
    // filter rather than a 400 from a `.strict()` schema.
    actor: /^[0-9a-fA-F]{24}$/.test(one(params.actor) ?? '') ? one(params.actor) : undefined,
    period: PERIODS.includes(period as AuditQuery['period'] & string)
      ? (period as AuditQuery['period'])
      : undefined,
  };
}

export default async function AdminActivityPage({ searchParams }: PageProps<'/admin/activity'>) {
  const params = await searchParams;
  const query = toQuery(params);
  const cookie = await getSessionCookie();

  const [result, actors] = await Promise.all([
    getAuditLogs(query, { cookie }).catch((error: unknown) => ({ error })),
    // Filter options, not page data. Without them the filter bar simply offers
    // one control fewer.
    getAuditActors({ cookie }).catch(() => []),
  ]);

  const header = (
    <AdminPageHeader
      title="Activity log"
      description="Every change made from the admin console, and who made it."
    />
  );

  if ('error' in result) {
    return (
      <>
        {header}
        <AdminError message={toErrorMessage(result.error)} />
      </>
    );
  }

  const { items, pagination } = result;
  const filtered = Object.keys(params).some((key) => key !== 'page');

  return (
    <>
      {header}

      <AuditFilters actors={actors} />

      {items.length === 0 ? (
        <AdminEmpty
          icon={Activity}
          title={filtered ? 'Nothing matches these filters' : 'No recent administrative activity'}
          body={
            filtered
              ? 'Try a wider period, or clear the filters to see everything that has been recorded.'
              : 'Stock adjustments, order changes, product edits and moderation decisions will appear here as they happen.'
          }
        />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-surface/40 p-4 sm:p-5">
            <AuditLogList entries={items} />
          </div>

          <AdminPagination pagination={pagination} shown={items.length} noun="entries" />
        </>
      )}
    </>
  );
}
