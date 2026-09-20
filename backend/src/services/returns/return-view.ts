import type { Types } from 'mongoose';
import {
  ReturnRequest,
  RETURN_STATUS_FLOW,
  type ReturnReason,
  type ReturnRequestDocument,
  type ReturnStatus,
} from '../../models/return.model';

/**
 * How a return is rendered — twice, on purpose.
 *
 * ## Two projections, not one with fields deleted
 *
 * A return carries two notes. `resolutionNote` is the operator's explanation
 * *to* the customer; `adminNote` is internal commentary *about* the case. Only
 * one of those may ever reach a shopper.
 *
 * The safe way to guarantee that is to build the customer's shape by naming
 * every field it contains, rather than by taking the full document and removing
 * what should not be there. A deletion list has to be updated every time the
 * schema grows a field, and the failure mode of forgetting is silent
 * disclosure. An allow-list's failure mode is a missing field on a page, which
 * somebody notices.
 *
 * The same reasoning governs `reviewedBy`: the customer sees that a decision
 * was made and when, never which member of staff made it.
 */

export interface ReturnItemView {
  id: string;
  orderItemId: string;
  product: string | null;
  productName: string;
  productImage: string;
  sku: string;
  selectedColor: string | null;
  selectedSize: string | null;
  unitPrice: number;
  purchasedQuantity: number;
  requestedQuantity: number;
  approvedQuantity: number | null;
  reason: ReturnReason;
}

/** The refund facts a customer is entitled to: how much, and where it got to. */
export interface ReturnRefundView {
  amount: number;
  initiatedAt: string | null;
  completedAt: string | null;
  /** True once money has been handed to the gateway and has not settled yet. */
  pending: boolean;
}

export interface ReturnView {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  status: ReturnStatus;
  items: ReturnItemView[];
  itemCount: number;
  customerNote: string;
  /** The operator's explanation, written for the customer. Empty until decided. */
  resolutionNote: string;
  requestedAt: string;
  decidedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  refund: ReturnRefundView;
  /** Whether the customer may still withdraw this request. */
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Everything the customer shape has, plus what only an operator may see.
 *
 * Extending rather than re-listing is safe in this direction: the admin view is
 * a superset, so a field added to the customer shape appears here too, which is
 * the outcome that is wanted. The dangerous direction — admin fields leaking
 * into the customer shape — cannot happen, because that shape names its fields.
 */
export interface AdminReturnView extends ReturnView {
  adminNote: string;
  reviewedByName: string;
  resellable: boolean | null;
  restocked: boolean;
  refundDetail: {
    razorpayRefundId: string | null;
    failureReason: string | null;
    failedAt: string | null;
    initiatedByName: string;
  };
  allowedStatuses: ReturnStatus[];
}

type ReturnDoc = ReturnRequestDocument & { _id: Types.ObjectId };

/** A return may be withdrawn while nothing has been sent back yet. */
export function canCustomerCancel(status: ReturnStatus): boolean {
  return status === 'REQUESTED' || status === 'APPROVED';
}

export function toReturnView(request: ReturnDoc): ReturnView {
  const refund = request.refund ?? {};

  return {
    id: String(request._id),
    returnNumber: request.returnNumber,
    orderId: String(request.order),
    orderNumber: request.orderNumber,
    status: request.status as ReturnStatus,
    items: (request.items ?? []).map((item) => ({
      id: String(item._id),
      orderItemId: String(item.orderItemId),
      product: item.product ? String(item.product) : null,
      productName: item.productName,
      productImage: item.productImage ?? '',
      sku: item.sku ?? '',
      selectedColor: item.selectedColor ?? null,
      selectedSize: item.selectedSize ?? null,
      unitPrice: item.unitPrice,
      purchasedQuantity: item.purchasedQuantity,
      requestedQuantity: item.requestedQuantity,
      approvedQuantity: item.approvedQuantity ?? null,
      reason: item.reason as ReturnReason,
    })),
    itemCount: (request.items ?? []).reduce(
      (sum, item) => sum + (item.approvedQuantity ?? item.requestedQuantity),
      0,
    ),
    customerNote: request.customerNote ?? '',
    resolutionNote: request.resolutionNote ?? '',
    requestedAt: request.requestedAt.toISOString(),
    decidedAt: request.decidedAt ? request.decidedAt.toISOString() : null,
    receivedAt: request.receivedAt ? request.receivedAt.toISOString() : null,
    cancelledAt: request.cancelledAt ? request.cancelledAt.toISOString() : null,
    refund: {
      amount: refund.amount ?? 0,
      initiatedAt: refund.initiatedAt ? refund.initiatedAt.toISOString() : null,
      completedAt: refund.completedAt ? refund.completedAt.toISOString() : null,
      pending: request.status === 'REFUND_PENDING',
    },
    canCancel: canCustomerCancel(request.status as ReturnStatus),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function toAdminReturnView(request: ReturnDoc): AdminReturnView {
  const refund = request.refund ?? {};

  return {
    ...toReturnView(request),
    adminNote: request.adminNote ?? '',
    reviewedByName: request.reviewedByName ?? '',
    resellable: request.resellable ?? null,
    restocked: request.restocked ?? false,
    refundDetail: {
      razorpayRefundId: refund.razorpayRefundId ?? null,
      failureReason: refund.failureReason ?? null,
      failedAt: refund.failedAt ? refund.failedAt.toISOString() : null,
      initiatedByName: refund.initiatedByName ?? '',
    },
    allowedStatuses: [...(RETURN_STATUS_FLOW[request.status as ReturnStatus] ?? [])],
  };
}

/**
 * A row in a list: enough to recognise a return, never the whole thing.
 *
 * The same discipline the order list follows — the item snapshot stays on the
 * server, and the row carries a count and the newest few names.
 */
export interface ReturnSummary {
  id: string;
  returnNumber: string;
  orderNumber: string;
  status: ReturnStatus;
  itemCount: number;
  /** A couple of product names, so a row is recognisable without opening it. */
  preview: string[];
  refundAmount: number;
  requestedAt: string;
  updatedAt: string;
}

export function toReturnSummary(request: ReturnDoc): ReturnSummary {
  const items = request.items ?? [];

  return {
    id: String(request._id),
    returnNumber: request.returnNumber,
    orderNumber: request.orderNumber,
    status: request.status as ReturnStatus,
    itemCount: items.reduce(
      (sum, item) => sum + (item.approvedQuantity ?? item.requestedQuantity),
      0,
    ),
    preview: items.slice(0, 3).map((item) => item.productName),
    refundAmount: request.refund?.amount ?? 0,
    requestedAt: request.requestedAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

/**
 * Every return raised against one order, newest first.
 *
 * Indexed on `{ order: 1, createdAt: -1 }`, and projected down to the summary —
 * an order page shows what has been sent back, not the full case file for each.
 */
export async function listOrderReturns(orderId: Types.ObjectId): Promise<ReturnSummary[]> {
  const requests = await ReturnRequest.find({ order: orderId }).sort({ createdAt: -1 }).limit(20);

  return requests.map((request) => toReturnSummary(request as unknown as ReturnDoc));
}
