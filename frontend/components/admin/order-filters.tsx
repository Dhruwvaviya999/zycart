'use client';

import {
  AdminSearch,
  AdminSelect,
  FilterBar,
  useAdminFilters,
} from '@/components/admin/admin-filters';
import { Checkbox } from '@/components/ui/checkbox';
import { humanise } from '@/components/admin/status-tones';
import { ORDER_PROGRESSION } from '@/types/order';

const ORDER_STATUS_OPTIONS = [...ORDER_PROGRESSION, 'CANCELLED' as const].map((status) => ({
  value: status,
  label: humanise(status),
}));

const PAYMENT_STATUS_OPTIONS = [
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'FAILED',
  'REFUND_PENDING',
  'REFUNDED',
].map((status) => ({ value: status, label: humanise(status) }));

const METHOD_OPTIONS = [
  { value: 'COD', label: 'Cash on delivery' },
  { value: 'RAZORPAY', label: 'Online' },
];

const PERIOD_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'total_desc', label: 'Highest value' },
  { value: 'total_asc', label: 'Lowest value' },
];

/**
 * Order filters.
 *
 * Fulfilment and payment are separate controls because Phase 7 made them
 * separate states — "shipped but not paid" is a real and important thing to be
 * able to ask for, and a single combined status dropdown could not express it.
 *
 * "Needs attention" is a checkbox rather than a status, for the same reason: it
 * is orthogonal to both, and it composes with them. "Unpaid orders from the
 * last week that need attention" is one URL, not three screens.
 */
export function OrderFilters() {
  const { get, set, clear, searchParams } = useAdminFilters();
  const active = [...searchParams.keys()].some((key) => key !== 'page');

  return (
    <FilterBar active={active} onClear={clear}>
      <AdminSearch
        value={get('search')}
        onChange={(value) => set({ search: value })}
        placeholder="Order number, customer or email"
        className="w-full sm:w-72"
      />

      <AdminSelect
        label="Order status"
        value={get('status')}
        options={ORDER_STATUS_OPTIONS}
        onChange={(value) => set({ status: value })}
        allLabel="Any status"
        className="w-full sm:w-40"
      />

      <AdminSelect
        label="Payment"
        value={get('paymentStatus')}
        options={PAYMENT_STATUS_OPTIONS}
        onChange={(value) => set({ paymentStatus: value })}
        allLabel="Any payment"
        className="w-full sm:w-40"
      />

      <AdminSelect
        label="Method"
        value={get('paymentMethod')}
        options={METHOD_OPTIONS}
        onChange={(value) => set({ paymentMethod: value })}
        allLabel="Any method"
        className="w-full sm:w-44"
      />

      <AdminSelect
        label="Period"
        value={get('period')}
        options={PERIOD_OPTIONS}
        onChange={(value) => set({ period: value })}
        allLabel="All time"
        className="w-full sm:w-36"
      />

      <AdminSelect
        label="Sort"
        value={get('sort')}
        options={SORT_OPTIONS}
        onChange={(value) => set({ sort: value })}
        allLabel="Newest"
        className="w-full sm:w-36"
      />
      <label className="text-caption mb-1.5 flex cursor-pointer items-center gap-2 font-medium">
        <Checkbox
          checked={get('attention') === 'true'}
          onCheckedChange={(checked) => set({ attention: checked ? 'true' : '' })}
        />
        Needs attention
      </label>
    </FilterBar>
  );
}
