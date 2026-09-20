import type { BadgeTone } from '@/components/admin/admin-ui';
import type { AttentionFlag, MovementType, StockState } from '@/types/admin';

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

/**
 * A movement's tone follows its direction, not its type.
 *
 * Stock arriving reads the same whether it came from a restock or a
 * cancellation, and stock leaving reads the same whether it sold or was written
 * off — which is what an operator scanning a timeline is actually looking for.
 * The sign and the words carry the meaning; this only reinforces them.
 */
export function movementTone(quantityChange: number): BadgeTone {
  return quantityChange > 0 ? 'success' : 'neutral';
}

export function attentionTone(severity: AttentionFlag['severity']): BadgeTone {
  return severity === 'critical' ? 'danger' : 'warning';
}

/** `+20`, `-7`. The sign is part of the value, so it is never dropped. */
export function signed(quantityChange: number): string {
  return `${quantityChange > 0 ? '+' : '−'}${Math.abs(quantityChange)}`;
}

export const MOVEMENT_ICON_LABEL: Record<MovementType, string> = {
  SALE: 'Sale',
  CANCELLATION: 'Cancellation',
  INITIAL_STOCK: 'Opening stock',
  MANUAL_ADJUSTMENT: 'Adjustment',
};

/** `PENDING` → `Pending`, `REFUND_PENDING` → `Refund pending`. */
export function humanise(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}

/**
 * A parcel's tone follows what an operator should do about it.
 *
 * Note that EXCEPTION is a warning rather than a danger: a failed delivery
 * attempt is an ordinary event that needs a phone call, not an emergency, and
 * colouring it the same as a failed payment would teach operators to discount
 * both. CANCELLED is neutral, because a parcel cancelled with its order is not
 * a problem — the order page already says what happened.
 */
export function shipmentTone(status: string): BadgeTone {
  switch (status) {
    case 'DELIVERED':
      return 'success';
    case 'EXCEPTION':
      return 'warning';
    case 'CANCELLED':
      return 'neutral';
    case 'READY_TO_SHIP':
    case 'SHIPPED':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
      return 'brand';
    default:
      return 'neutral';
  }
}

/**
 * A return's tone follows whether it is waiting on somebody.
 *
 * REQUESTED and RECEIVED are warnings because both are queues with an operator
 * at the end of them — a request nobody has reviewed and goods nobody has
 * refunded. REFUND_PENDING is neutral: the money is with the bank and there is
 * nothing to do but wait, so flagging it would add noise to the one screen that
 * exists to remove it. The operations panel raises it separately once it is
 * genuinely overdue.
 */
export function returnStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'REFUNDED':
      return 'success';
    case 'REJECTED':
      return 'danger';
    case 'REQUESTED':
    case 'RECEIVED':
      return 'warning';
    case 'APPROVED':
      return 'brand';
    case 'REFUND_PENDING':
    case 'CANCELLED':
      return 'neutral';
    default:
      return 'neutral';
  }
}
