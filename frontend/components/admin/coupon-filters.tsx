'use client';

import {
  AdminSearch,
  AdminSelect,
  FilterBar,
  useAdminFilters,
} from '@/components/admin/admin-filters';
import { COUPON_STATES, COUPON_STATE_LABEL } from '@/types/admin';

const STATE_OPTIONS = COUPON_STATES.map((state) => ({
  value: state,
  label: COUPON_STATE_LABEL[state],
}));

/**
 * Filters for the coupon list.
 *
 * A search and the state, because the two questions an operator brings here
 * are "where is the code a customer just quoted at me?" and "what is live right
 * now?". Search covers the description as well as the code, so a promotion can
 * be found by what it was for when nobody remembers what it was called.
 *
 * The state is the server's own, worked out by the same `couponState` checkout
 * asks — so "Active" here means a code checkout would accept today, basket and
 * customer permitting, and not merely one whose switch is on.
 */
export function CouponFilters() {
  const { get, set, clear, searchParams } = useAdminFilters();
  const active = [...searchParams.keys()].some((key) => key !== 'page');

  return (
    <FilterBar active={active} onClear={clear}>
      <AdminSearch
        value={get('search')}
        onChange={(value) => set({ search: value })}
        placeholder="Code or description"
        className="w-full sm:w-72"
      />

      <AdminSelect
        label="State"
        value={get('state')}
        options={STATE_OPTIONS}
        onChange={(value) => set({ state: value })}
        allLabel="Any state"
        className="w-full sm:w-44"
      />
    </FilterBar>
  );
}
