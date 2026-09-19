import type { BadgeTone } from '@/components/admin/admin-ui';
import type { StockState } from '@/types/admin';

/**
 * How each state is coloured, decided once.
 *
 * Every admin screen shows the same statuses, and a SHIPPED badge that is brand
 * blue on the orders list and grey on the dashboard would make an operator
 * doubt both. Colour is always paired with the word itself, so these are
 * reinforcement rather than the message.
 */

export function orderStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'DELIVERED':
      return 'success';
    case 'CANCELLED':
      return 'danger';
    case 'PENDING':
      return 'warning';
    case 'CONFIRMED':
    case 'PROCESSING':
    case 'SHIPPED':
      return 'brand';
    default:
      return 'neutral';
  }
}

export function paymentStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'FAILED':
      return 'danger';
    case 'PENDING':
    case 'AUTHORIZED':
      return 'warning';
    case 'REFUNDED':
    case 'REFUND_PENDING':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function reviewStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'PENDING':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function stockTone(state: StockState): BadgeTone {
  switch (state) {
    case 'in_stock':
      return 'success';
    case 'low_stock':
      return 'warning';
    case 'out_of_stock':
      return 'danger';
  }
}

export const STOCK_LABEL: Record<StockState, string> = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
};

/** `PENDING` → `Pending`, `REFUND_PENDING` → `Refund pending`. */
export function humanise(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}
