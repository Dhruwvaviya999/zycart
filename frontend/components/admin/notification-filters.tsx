'use client';

import {
  AdminSearch,
  AdminSelect,
  FilterBar,
  useAdminFilters,
} from '@/components/admin/admin-filters';
import {
  DELIVERY_STATUSES,
  DELIVERY_STATUS_LABEL,
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_LABEL,
} from '@/types/admin';

const STATUS_OPTIONS = DELIVERY_STATUSES.map((status) => ({
  value: status,
  label: DELIVERY_STATUS_LABEL[status],
}));

const EVENT_OPTIONS = NOTIFICATION_EVENTS.map((event) => ({
  value: event,
  label: NOTIFICATION_EVENT_LABEL[event],
}));

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

/**
 * Filters for the email log.
 *
 * Status, event, window and a reference search — the four things an operator
 * arrives with. "Show me what failed" is the overwhelmingly common one, which
 * is why status comes first and why the operations page links straight to it.
 *
 * Search covers the order number, the return number and the customer's address,
 * because somebody chasing a specific message has exactly one of those in front
 * of them. Filtering happens on the server; nothing here loads a page of rows
 * and narrows it in the browser.
 */
export function NotificationFilters() {
  const { get, set, clear, searchParams } = useAdminFilters();
  const active = [...searchParams.keys()].some((key) => key !== 'page');

  return (
    <FilterBar active={active} onClear={clear}>
      <AdminSearch
        value={get('search')}
        onChange={(value) => set({ search: value })}
        placeholder="Order, return or email"
        className="w-full sm:w-72"
      />

      <AdminSelect
        label="Status"
        value={get('status')}
        options={STATUS_OPTIONS}
        onChange={(value) => set({ status: value })}
        allLabel="Any status"
        className="w-full sm:w-40"
      />

      <AdminSelect
        label="Event"
        value={get('event')}
        options={EVENT_OPTIONS}
        onChange={(value) => set({ event: value })}
        allLabel="Any event"
        className="w-full sm:w-48"
      />

      <AdminSelect
        label="Period"
        value={get('period')}
        options={PERIOD_OPTIONS}
        onChange={(value) => set({ period: value })}
        allLabel="Last 30 days"
        className="w-full sm:w-40"
      />
    </FilterBar>
  );
}
