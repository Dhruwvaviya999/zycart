'use client';

import {
  AdminSearch,
  AdminSelect,
  FilterBar,
  useAdminFilters,
} from '@/components/admin/admin-filters';
import { RETURN_ADMIN_LABEL, RETURN_STATUSES } from '@/types/fulfillment';

const STATUS_OPTIONS = RETURN_STATUSES.map((status) => ({
  value: status,
  label: RETURN_ADMIN_LABEL[status],
}));

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  // Oldest is the one the queue actually wants: work the backlog from the end
  // that has been waiting longest, which is what every link from the
  // operations panel points at.
  { value: 'oldest', label: 'Oldest first' },
];

/**
 * Return filters.
 *
 * Status and a reference search, and nothing else. The queue's job is "what do
 * I work on next", and a date range or a customer filter would be answering a
 * reporting question on a screen that exists for a queue.
 *
 * Search is prefix-anchored on the server against both the return number and
 * the order number, because an operator searching here has one of them in hand
 * — usually read off an email or quoted on the phone.
 */
export function ReturnFilters() {
  const { get, set, clear, searchParams } = useAdminFilters();
  const active = [...searchParams.keys()].some((key) => key !== 'page');

  return (
    <FilterBar active={active} onClear={clear}>
      <AdminSearch
        value={get('search')}
        onChange={(value) => set({ search: value })}
        placeholder="Return or order number"
        className="w-full sm:w-72"
      />

      <AdminSelect
        label="Status"
        value={get('status')}
        options={STATUS_OPTIONS}
        onChange={(value) => set({ status: value })}
        allLabel="Any status"
        className="w-full sm:w-44"
      />

      <AdminSelect
        label="Sort"
        value={get('sort')}
        options={SORT_OPTIONS}
        onChange={(value) => set({ sort: value })}
        allLabel="Newest"
        className="w-full sm:w-40"
      />
    </FilterBar>
  );
}
