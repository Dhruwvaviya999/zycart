'use client';

import {
  AdminSearch,
  AdminSelect,
  FilterBar,
  useAdminFilters,
} from '@/components/admin/admin-filters';

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const RATING_OPTIONS = [5, 4, 3, 2, 1].map((rating) => ({
  value: String(rating),
  label: `${rating} star${rating === 1 ? '' : 's'}`,
}));

const VERIFIED_OPTIONS = [
  { value: 'true', label: 'Verified only' },
  { value: 'false', label: 'Unverified only' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'rating_asc', label: 'Lowest rated' },
  { value: 'rating_desc', label: 'Highest rated' },
];

/**
 * Review filters.
 *
 * "Lowest rated first" earns its place: a one-star review is the one most worth
 * a moderator's attention, and sorting to it beats scrolling for it.
 */
export function ReviewFilters() {
  const { get, set, clear, searchParams } = useAdminFilters();
  const active = [...searchParams.keys()].some((key) => key !== 'page');

  return (
    <FilterBar active={active} onClear={clear}>
      <AdminSearch
        value={get('search')}
        onChange={(value) => set({ search: value })}
        placeholder="Review text, customer or product"
        className="w-full sm:w-72"
      />

      <AdminSelect
        label="Status"
        value={get('status')}
        options={STATUS_OPTIONS}
        onChange={(value) => set({ status: value })}
        allLabel="Any status"
        className="w-full sm:w-36"
      />

      <AdminSelect
        label="Rating"
        value={get('rating')}
        options={RATING_OPTIONS}
        onChange={(value) => set({ rating: value })}
        allLabel="Any rating"
        className="w-full sm:w-32"
      />

      <AdminSelect
        label="Purchase"
        value={get('verified')}
        options={VERIFIED_OPTIONS}
        onChange={(value) => set({ verified: value })}
        allLabel="Any"
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
