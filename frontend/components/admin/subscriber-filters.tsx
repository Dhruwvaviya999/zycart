'use client';

import {
  AdminSearch,
  AdminSelect,
  FilterBar,
  useAdminFilters,
} from '@/components/admin/admin-filters';
import { SUBSCRIBER_STATUS_LABEL, type SubscriberStatus } from '@/types/admin';

/** In the order the page's counts are shown in: the list itself first. */
const STATUS_ORDER: SubscriberStatus[] = ['SUBSCRIBED', 'PENDING', 'UNSUBSCRIBED'];

const STATUS_OPTIONS = STATUS_ORDER.map((status) => ({
  value: status,
  label: SUBSCRIBER_STATUS_LABEL[status],
}));

/**
 * Filters for the newsletter list.
 *
 * An address and a status, because the list holds nothing else worth asking
 * about. The search matches any part of the address on the server, so a
 * domain finds everybody at it as well as a full address finding one person.
 */
export function SubscriberFilters() {
  const { get, set, clear, searchParams } = useAdminFilters();
  const active = [...searchParams.keys()].some((key) => key !== 'page');

  return (
    <FilterBar active={active} onClear={clear}>
      <AdminSearch
        value={get('search')}
        onChange={(value) => set({ search: value })}
        placeholder="Email address"
        className="w-full sm:w-72"
      />

      <AdminSelect
        label="Status"
        value={get('status')}
        options={STATUS_OPTIONS}
        onChange={(value) => set({ status: value })}
        allLabel="Any status"
        className="w-full sm:w-52"
      />
    </FilterBar>
  );
}
