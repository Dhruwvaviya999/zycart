'use client';

import {
  AdminSearch,
  AdminSelect,
  FilterBar,
  useAdminFilters,
} from '@/components/admin/admin-filters';
import { AUDIT_ACTION_LABEL, AUDIT_ACTIONS, AUDIT_ENTITIES } from '@/types/admin';

/**
 * The audit trail's filters.
 *
 * The actor filter is a picker built from who has actually performed an action,
 * rather than a text box: there is nothing to spell, nothing to guess, and no
 * ambiguity between two members of staff who share a first name. Free text
 * still matches names through the search box, for anyone who would rather type.
 */
export function AuditFilters({ actors }: { actors: { id: string; name: string }[] }) {
  const { get, set, clear, searchParams } = useAdminFilters();

  const active = [...searchParams.keys()].some((key) => key !== 'page');

  return (
    <FilterBar active={active} onClear={clear}>
      <AdminSearch
        value={get('search')}
        onChange={(search) => set({ search })}
        placeholder="Search what happened"
        className="w-full sm:max-w-xs"
      />

      <AdminSelect
        label="Action"
        value={get('action')}
        onChange={(action) => set({ action })}
        allLabel="Every action"
        options={AUDIT_ACTIONS.map((action) => ({
          value: action,
          label: AUDIT_ACTION_LABEL[action],
        }))}
      />

      <AdminSelect
        label="Area"
        value={get('entityType')}
        onChange={(entityType) => set({ entityType })}
        allLabel="Everywhere"
        options={AUDIT_ENTITIES.map((entity) => ({
          value: entity,
          label: entity.charAt(0) + entity.slice(1).toLowerCase(),
        }))}
      />

      {actors.length > 0 && (
        <AdminSelect
          label="Performed by"
          value={get('actor')}
          onChange={(actor) => set({ actor })}
          allLabel="Anyone"
          options={actors.map((actor) => ({ value: actor.id, label: actor.name }))}
        />
      )}

      <AdminSelect
        label="When"
        value={get('period')}
        onChange={(period) => set({ period })}
        // The default is 30 days rather than all time, so the first page of a
        // long-lived log is the part somebody is actually looking for.
        allLabel="Last 30 days"
        options={[
          { value: 'today', label: 'Today' },
          { value: '7d', label: 'Last 7 days' },
          { value: 'all', label: 'All time' },
        ]}
      />
    </FilterBar>
  );
}
