'use client';

import {
  AdminSearch,
  AdminSelect,
  FilterBar,
  useAdminFilters,
} from '@/components/admin/admin-filters';

const STATUS_OPTIONS = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Deactivated' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name_asc', label: 'Name A–Z' },
];

/**
 * Deliberately few.
 *
 * Name, email or phone finds a person, and whether the account is switched on
 * is the only operational state a customer has. Anything else would be a filter
 * nobody reaches for.
 */
export function CustomerFilters() {
  const { get, set, clear, searchParams } = useAdminFilters();
  const active = [...searchParams.keys()].some((key) => key !== 'page');

  return (
    <FilterBar active={active} onClear={clear}>
      <AdminSearch
        value={get('search')}
        onChange={(value) => set({ search: value })}
        placeholder="Name, email or phone"
        className="w-full sm:w-72"
      />

      <AdminSelect
        label="Status"
        value={get('active')}
        options={STATUS_OPTIONS}
        onChange={(value) => set({ active: value })}
        allLabel="Any status"
        className="w-full sm:w-40"
      />

      <AdminSelect
        label="Sort"
        value={get('sort')}
        options={SORT_OPTIONS}
        onChange={(value) => set({ sort: value })}
        allLabel="Newest"
        className="w-full sm:w-36"
      />
    </FilterBar>
  );
}
