import mongoose, { Types } from 'mongoose';
import { Order } from '../../models/order.model';
import {
  DAMAGE_REASONS,
  HOLDING_RETURN_STATUSES,
  MAX_RETURN_ITEMS,
  ReturnRequest,
  RETURN_STATUS_FLOW,
  type ReturnStatus,
} from '../../models/return.model';
import { AppError } from '../../utils/AppError';
import { generateReturnNumber } from '../../utils/orderNumber';
import { escapeRegex, isObjectId } from '../../validators/common';
import type {
  AdminReturnQuery,
  CreateReturnInput,
  ReceiveReturnInput,
  ReturnDecisionInput,
  ReturnQuery,
} from '../../validators/return.validator';
import { recordAudit, type AuditActor } from '../admin/audit.service';
import { restockFromReturn } from '../inventory/inventory.service';
import { findOwnedOrder } from '../order.service';
import {
  humanReturnReason,
  plannedRefund,
  refundability,
  returnability,
  type PolicyOrder,
} from './return-policy';
import {
  toAdminReturnView,
  toReturnSummary,
  toReturnView,
  type AdminReturnView,
  type ReturnSummary,
  type ReturnView,
} from './return-view';

/**
 * Returns, as a lifecycle.
 *
 * ## The three things this file guarantees
 *
 * 1. **Eligibility is decided here, never in the browser.** Every rule lives in
 *    `return-policy`, is evaluated on the server before a request is created,
 *    and is re-evaluated inside the transaction that creates it. The storefront
 *    is told what it may offer so it does not offer something that would be
 *    refused, but the offer is not the permission.
 *
 * 2. **Quantity cannot be double-spent.** The authority is
 *    `Order.items[].returnedQuantity`, and it moves only through the two atomic
 *    helpers below. Two tabs racing for the last returnable unit produce one
 *    success and one 409, because the sufficiency check rides inside the
 *    update's own array filter rather than in a read before it.
 *
 * 3. **Nothing here touches stock or money directly.** Restocking goes through
 *    `restockFromReturn`, so it lands in the Phase 12 ledger like every other
 *    movement. Refunds go through `refund.service`, which is the only module
 *    that talks to the gateway. A return service that did either itself would
 *    be a second authority over something that already has one.
 */

type ReturnDoc = InstanceType<typeof ReturnRequest>;
type OrderDoc = InstanceType<typeof Order>;

/** The policy functions read a narrow shape; this is the adapter. */
function asPolicyOrder(order: OrderDoc): PolicyOrder {
  return {
    status: order.status,
    deliveredAt: order.deliveredAt ?? null,
    items: order.items.map((item) => ({
      _id: item._id as Types.ObjectId,
      quantity: item.quantity,
      returnedQuantity: item.returnedQuantity ?? 0,
      unitPrice: item.unitPrice,
      productName: item.productName,
    })),
    pricing: order.pricing,
    payment: {
      method: order.payment.method,
      status: order.payment.status,
      razorpayPaymentId: order.payment.razorpayPaymentId ?? null,
      refundedAmount: order.payment.refundedAmount ?? 0,
    },
  };
}

interface QuantityLine {
  orderItemId: Types.ObjectId;
  quantity: number;
  purchasedQuantity: number;
  productName: string;
}

/**
 * Takes the returnable quantity, atomically.
 *
 * ## This is the whole concurrency story
 *
 * The check "is there enough left to return?" is not performed and then acted
 * on. It is *inside* the update, as an array filter, so reading and writing are
 * one operation with no window between them — the identical technique
 * `commitStock` uses to stop two customers buying the last unit, and
 * `adjustStock` uses to stop stock going negative.
 *
 * Consider two browser tabs, each asking for the one remaining unit of a line
 * bought twice and already returned once. Both compute a remaining quantity of
 * 1 from what they read. Both call this. The first update matches
 * `returnedQuantity <= 2 - 1`, increments to 2, and succeeds. The second finds
 * `returnedQuantity` is now 2, `2 <= 1` is false, matches no array element,
 * modifies nothing, and is refused. There is no interleaving that lets both
 * through, and none that can take the counter past what was bought.
 *
 * Inside a transaction, the two may instead collide as a write conflict on the
 * order document, which `withTransaction` retries — and the retry then takes
 * the path above. Either way: one winner.
 *
 * @throws AppError 409 with the line that could not be reserved.
 */
async function reserveReturnQuantities(
  orderId: Types.ObjectId,
  lines: readonly QuantityLine[],
  session: mongoose.ClientSession,
): Promise<void> {
  for (const line of lines) {
    const result = await Order.updateOne(
      { _id: orderId },
      { $inc: { 'items.$[it].returnedQuantity': line.quantity } },
      {
        session,
        arrayFilters: [
          {
            'it._id': line.orderItemId,
            // After the increment this line's held quantity must still be at
            // most what was bought. Rearranged so the comparison is against a
            // constant the server computed from the snapshot.
            'it.returnedQuantity': { $lte: line.purchasedQuantity - line.quantity },
          },
        ],
      },
    );

    if (result.modifiedCount !== 1) {
      throw new AppError(
        `${line.productName} cannot be returned in that quantity — some or all of it has already ` +
          'been requested. Refresh the order and try again.',
        409,
      );
    }
  }
}

/**
 * Gives quantity back to the returnable pool.
 *
 * Called when a request is rejected or cancelled, and for the difference when
 * an operator approves fewer units than were asked for. The floor guard is
 * belt-and-braces — every release is paired with a reservation that succeeded —
 * but it is what makes the invariant `returnedQuantity >= 0` true by
 * construction rather than by the pairing being correct everywhere forever.
 */
async function releaseReturnQuantities(
  orderId: Types.ObjectId,
  lines: readonly { orderItemId: Types.ObjectId; quantity: number }[],
  session: mongoose.ClientSession,
): Promise<void> {
  for (const line of lines) {
    if (line.quantity <= 0) continue;

    await Order.updateOne(
      { _id: orderId },
      { $inc: { 'items.$[it].returnedQuantity': -line.quantity } },
      {
        session,
        arrayFilters: [
          { 'it._id': line.orderItemId, 'it.returnedQuantity': { $gte: line.quantity } },
        ],
      },
    );
  }
}

/* ---------------------------------------------------------------- */
/* Customer                                                          */
/* ---------------------------------------------------------------- */

/**
 * Raises a return request against an order the customer owns.
 *
 * ## Why every check runs twice
 *
 * Eligibility is evaluated before the transaction opens, to fail fast with a
 * clear message, and again inside it against the document the transaction is
 * actually going to write — because the window between the two is exactly where
 * a second tab, or a status change by an operator, would land. The second
 * evaluation is the one that is load-bearing; the first is for the error
 * message.
 *
 * ## What the client is trusted for
 *
 * Which lines and how many of each, and nothing else. Prices, product names,
 * variants and the purchased quantity are all read from the order's own
 * snapshot inside the transaction. There is no field in the request body
 * through which a customer could suggest what a return is worth.
 */
export async function createReturn(
  userId: string,
  orderRef: string,
  input: CreateReturnInput,
): Promise<ReturnView> {
  const order = await findOwnedOrder(userId, orderRef);

  const preflight = returnability(asPolicyOrder(order));
  if (!preflight.returnable) {
    throw new AppError(preflight.reason ?? 'This order cannot be returned.', 409);
  }

  const session = await mongoose.startSession();

  try {
    let created: ReturnDoc | undefined;

    await session.withTransaction(async () => {
      // Re-read inside the transaction: the snapshot this writes against must
      // be the one the reservation below is checked against.
      const fresh = await findOwnedOrder(userId, orderRef, session);
      const eligibility = returnability(asPolicyOrder(fresh));

      if (!eligibility.returnable) {
        throw new AppError(eligibility.reason ?? 'This order cannot be returned.', 409);
      }

      const byId = new Map(fresh.items.map((item) => [String(item._id), item]));
      const lines: QuantityLine[] = [];
      const items = [];

      for (const requested of input.items) {
        const item = byId.get(requested.orderItemId);

        /**
         * A line id that is not on this order.
         *
         * Reported as "not part of this order" rather than "not found", because
         * that is what it is — and because the ownership filter above already
         * guaranteed the order is this customer's, so there is nothing to leak
         * by being specific.
         */
        if (!item) {
          throw new AppError('One of those items is not part of this order.', 400);
        }

        const remaining = item.quantity - (item.returnedQuantity ?? 0);

        if (requested.quantity > remaining) {
          throw new AppError(
            remaining === 0
              ? `${item.productName} has already been requested for return in full.`
              : `Only ${remaining} of ${item.productName} can still be returned.`,
            409,
          );
        }

        lines.push({
          orderItemId: item._id as Types.ObjectId,
          quantity: requested.quantity,
          purchasedQuantity: item.quantity,
          productName: item.productName,
        });

        // The snapshot, copied from the order's snapshot. Never the catalogue.
        items.push({
          orderItemId: item._id,
          product: item.product ?? null,
          productName: item.productName,
          productImage: item.productImage ?? '',
          sku: item.sku ?? '',
          selectedColor: item.selectedColor ?? null,
          selectedSize: item.selectedSize ?? null,
          unitPrice: item.unitPrice,
          purchasedQuantity: item.quantity,
          requestedQuantity: requested.quantity,
          approvedQuantity: null,
          reason: requested.reason,
        });
      }

      // The atomic part. Everything above this line is preparation.
      await reserveReturnQuantities(fresh._id, lines, session);

      const now = new Date();

      // Retried rather than pre-checked, exactly as an order number is: the
      // unique index is the authority on whether a number is free.
      let request: ReturnDoc | undefined;

      for (let attempt = 0; attempt < 5 && !request; attempt += 1) {
        try {
          [request] = await ReturnRequest.create(
            [
              {
                returnNumber: generateReturnNumber(now),
                order: fresh._id,
                orderNumber: fresh.orderNumber,
                user: fresh.user,
                status: 'REQUESTED',
                items,
                customerNote: input.note ?? '',
                requestedAt: now,
              },
            ],
            { session },
          );
        } catch (error) {
          const duplicate =
            typeof error === 'object' &&
            error !== null &&
            (error as { code?: number }).code === 11000;
          if (!duplicate || attempt === 4) throw error;
        }
      }

      if (!request) throw new AppError('Could not raise the return. Please try again.', 500);

      created = request;
    });

    if (!created) throw new AppError('Could not raise the return. Please try again.', 500);
    return toReturnView(created as never);
  } finally {
    await session.endSession();
  }
}

/**
 * Loads one return, scoped to its owner.
 *
 * The ownership filter is part of the query rather than a check afterwards, so
 * another customer's return is simply not found — the response cannot
 * distinguish "someone else's" from "does not exist". The same arrangement
 * `findOwnedOrder` uses, for the same reason.
 */
export async function findOwnedReturn(
  userId: string,
  returnRef: string,
  session?: mongoose.ClientSession,
): Promise<ReturnDoc> {
  const filter = {
    user: new Types.ObjectId(userId),
    ...(isObjectId(returnRef) ? { _id: returnRef } : { returnNumber: returnRef.toUpperCase() }),
  };

  const query = ReturnRequest.findOne(filter);
  if (session) query.session(session);

  const request = await query;
  if (!request) throw new AppError('Return request not found', 404);

  return request;
}

export async function listReturns(userId: string, query: ReturnQuery) {
  const filter = {
    user: new Types.ObjectId(userId),
    ...(query.status ? { status: query.status } : {}),
  };

  const [requests, total] = await Promise.all([
    ReturnRequest.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    ReturnRequest.countDocuments(filter),
  ]);

  return {
    items: requests.map((request) => toReturnSummary(request as never)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getReturn(userId: string, returnRef: string): Promise<ReturnView> {
  return toReturnView((await findOwnedReturn(userId, returnRef)) as never);
}

/**
 * The customer withdraws their request.
 *
 * Allowed while nothing has been sent back — REQUESTED or APPROVED. Once an
 * operator has marked the goods received, withdrawing would mean claiming
 * ZyCart is not holding something it is holding, so it is refused and the
 * customer is pointed at support.
 *
 * The held quantity is released in the same transaction, so the units become
 * returnable again immediately rather than after a sweep.
 */
export async function cancelReturn(userId: string, returnRef: string): Promise<ReturnView> {
  const session = await mongoose.startSession();

  try {
    let cancelled: ReturnDoc | undefined;

    await session.withTransaction(async () => {
      const request = await findOwnedReturn(userId, returnRef, session);

      assertReturnTransition(request.status as ReturnStatus, 'CANCELLED');

      await releaseReturnQuantities(
        request.order as Types.ObjectId,
        request.items.map((item) => ({
          orderItemId: item.orderItemId as Types.ObjectId,
          quantity: item.approvedQuantity ?? item.requestedQuantity,
        })),
        session,
      );

      request.status = 'CANCELLED';
      request.cancelledAt = new Date();
      await request.save({ session });

      cancelled = request;
    });

    if (!cancelled) throw new AppError('Could not withdraw the return request', 500);
    return toReturnView(cancelled as never);
  } finally {
    await session.endSession();
  }
}

/* ---------------------------------------------------------------- */
/* Transitions                                                       */
/* ---------------------------------------------------------------- */

/**
 * The lifecycle check, in one place.
 *
 * Every state change in this file goes through it, so "may this return move
 * there?" has exactly one answer — the same arrangement `ORDER_STATUS_FLOW` has
 * for orders. The console asks; it does not decide.
 */
export function assertReturnTransition(current: ReturnStatus, next: ReturnStatus): void {
  if (current === next) {
    throw new AppError(`This return is already ${humanReturnStatus(next)}.`, 409);
  }

  if (!RETURN_STATUS_FLOW[current].includes(next)) {
    throw new AppError(
      `A return that is ${humanReturnStatus(current)} cannot be moved to ${humanReturnStatus(next)}.`,
      409,
    );
  }
}

/** `REFUND_PENDING` -> `refund pending`. */
export function humanReturnStatus(status: ReturnStatus): string {
  return status.toLowerCase().replace(/_/g, ' ');
}

/* ---------------------------------------------------------------- */
/* Admin                                                             */
/* ---------------------------------------------------------------- */

/**
 * Loads one return with no ownership filter, for the admin routes.
 *
 * Deliberately a separate function from `findOwnedReturn` rather than an
 * optional flag on it — a scoping rule that can be switched off by passing an
 * argument is a scoping rule waiting to be switched off by accident. The same
 * reasoning that produced `findOrderByRef` beside `findOwnedOrder`.
 */
export async function findReturnByRef(
  returnRef: string,
  session?: mongoose.ClientSession,
): Promise<ReturnDoc> {
  const filter = isObjectId(returnRef)
    ? { _id: returnRef }
    : { returnNumber: returnRef.toUpperCase() };

  const query = ReturnRequest.findOne(filter);
  if (session) query.session(session);

  const request = await query;
  if (!request) throw new AppError('Return request not found', 404);

  return request;
}

/**
 * One return, in full, for an operator.
 *
 * Carries the order's payment state and the server's own verdict on whether a
 * refund can be issued — so the console can render the reason rather than
 * offering a button that would be refused. `refundability` is the same function
 * the refund path checks before it moves any money.
 */
export interface AdminReturnDetail extends AdminReturnView {
  customer: { id: string | null; name: string; email: string } | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    paymentMethod: string;
    paymentStatus: string;
    refundedAmount: number;
    placedAt: string;
    deliveredAt: string | null;
  } | null;
  refundPlan: {
    amount: number;
    refundable: boolean;
    blocker: string | null;
    explanation: string;
    remainingOnOrder: number;
  };
  /** The restock default, so the receive dialog does not suggest shelving a broken item. */
  suggestResellable: boolean;
}

export async function getAdminReturn(returnRef: string): Promise<AdminReturnDetail> {
  const request = await findReturnByRef(returnRef);

  const order = await Order.findById(request.order).populate(
    'user',
    'firstName lastName email',
  );

  const view = toAdminReturnView(request as never);

  const quantities = request.items.map((item) => ({
    unitPrice: item.unitPrice,
    quantity: item.approvedQuantity ?? item.requestedQuantity,
  }));

  const policyOrder = order ? asPolicyOrder(order) : null;
  const amount = policyOrder ? plannedRefund(policyOrder, quantities) : 0;
  const verdict = policyOrder
    ? refundability(policyOrder, amount)
    : {
        refundable: false,
        blocker: 'NOT_PAID' as const,
        explanation: 'The order behind this return no longer exists.',
        amount: 0,
      };

  const customer = order?.user as unknown as {
    _id?: Types.ObjectId;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;

  return {
    ...view,
    customer: customer?._id
      ? {
          id: String(customer._id),
          name: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
          email: customer.email ?? '',
        }
      : null,
    order: order
      ? {
          id: String(order._id),
          orderNumber: order.orderNumber,
          status: order.status,
          total: order.pricing.total,
          paymentMethod: order.payment.method,
          paymentStatus: order.payment.status,
          refundedAmount: order.payment.refundedAmount ?? 0,
          placedAt: order.createdAt.toISOString(),
          deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : null,
        }
      : null,
    refundPlan: {
      amount,
      refundable: verdict.refundable,
      blocker: verdict.blocker,
      explanation: verdict.explanation,
      remainingOnOrder: order
        ? Math.max(0, order.pricing.total - (order.payment.refundedAmount ?? 0))
        : 0,
    },
    suggestResellable: !request.items.some((item) =>
      DAMAGE_REASONS.includes(item.reason as never),
    ),
  };
}

export interface AdminReturnRow extends ReturnSummary {
  customer: { id: string | null; name: string; email: string };
  reasons: string[];
}

export async function listAdminReturns(query: AdminReturnQuery) {
  const filter: Record<string, unknown> = {};

  if (query.status) filter.status = query.status;

  if (query.search) {
    /**
     * Prefix-anchored on both references, and escaped through the shared
     * helper the rest of the admin services use.
     *
     * Anchored because an operator searching here has a number in hand — read
     * off an email or quoted on the phone — so a leading wildcard would buy
     * nothing and cost a collection scan on every keystroke. Escaped because a
     * term containing `(` would otherwise throw rather than find nothing.
     */
    const pattern = new RegExp(`^${escapeRegex(query.search.trim())}`, 'i');

    filter.$or = [{ returnNumber: pattern }, { orderNumber: pattern }];
  }

  const [requests, total] = await Promise.all([
    ReturnRequest.find(filter)
      .sort(query.sort === 'oldest' ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate('user', 'firstName lastName email'),
    ReturnRequest.countDocuments(filter),
  ]);

  const items: AdminReturnRow[] = requests.map((request) => {
    const user = request.user as unknown as {
      _id?: Types.ObjectId;
      firstName?: string;
      lastName?: string;
      email?: string;
    } | null;

    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

    return {
      ...toReturnSummary(request as never),
      customer: {
        id: user?._id ? String(user._id) : null,
        // Returns outlive accounts; the row still has to render.
        name: name || 'Deleted customer',
        email: user?.email ?? '',
      },
      reasons: [...new Set(request.items.map((item) => humanReturnReason(item.reason as never)))],
    };
  });

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

/**
 * Approves a return, possibly for fewer units than were asked for.
 *
 * ## Why approved quantity is separate from requested
 *
 * An operator may agree to one of the two units a customer asked to send back.
 * Writing that decision over the request would lose what was actually asked —
 * which is what a customer disputing the outcome would need — so both are kept,
 * and every downstream calculation reads the approved figure. The refund is
 * computed from `approvedQuantity` and nothing else.
 *
 * The difference is released back to the returnable pool in the same
 * transaction, so a customer whose two-unit request was approved for one can
 * immediately raise a request for the other.
 *
 * ## Concurrency
 *
 * Two operators clicking Approve at the same moment: both load the request,
 * both check the transition, and both try to save. The status check inside the
 * transaction is re-read from the database under snapshot isolation, and the
 * second commit hits a write conflict on the same document — which
 * `withTransaction` retries, and the retry then finds the status is APPROVED
 * and refuses. Exactly one approval, one audit row, one quantity release.
 */
export async function approveReturn(
  returnRef: string,
  input: ReturnDecisionInput,
  actor: AuditActor,
): Promise<AdminReturnDetail> {
  const session = await mongoose.startSession();

  try {
    let approvedNumber = '';

    await session.withTransaction(async () => {
      const request = await findReturnByRef(returnRef, session);
      assertReturnTransition(request.status as ReturnStatus, 'APPROVED');

      const approvedById = new Map(
        (input.items ?? []).map((line) => [line.orderItemId, line.approvedQuantity]),
      );

      const released: { orderItemId: Types.ObjectId; quantity: number }[] = [];
      let approvedUnits = 0;

      for (const item of request.items) {
        const requested = item.requestedQuantity;
        const approved = approvedById.get(String(item.orderItemId)) ?? requested;

        if (approved > requested) {
          throw new AppError(
            `You cannot approve more of ${item.productName} than the customer asked to return.`,
            400,
          );
        }

        item.approvedQuantity = approved;
        approvedUnits += approved;

        if (approved < requested) {
          released.push({
            orderItemId: item.orderItemId as Types.ObjectId,
            quantity: requested - approved,
          });
        }
      }

      if (approvedUnits === 0) {
        throw new AppError(
          'Approving zero units is a rejection. Use Reject, so the customer gets a reason.',
          400,
        );
      }

      await releaseReturnQuantities(request.order as Types.ObjectId, released, session);

      request.status = 'APPROVED';
      request.decidedAt = new Date();
      request.reviewedBy = new Types.ObjectId(actor.id);
      request.reviewedByName = actor.name;
      if (input.resolutionNote !== undefined) request.resolutionNote = input.resolutionNote;
      if (input.adminNote !== undefined) request.adminNote = input.adminNote;

      await request.save({ session });

      await recordAudit(
        {
          actor,
          action: 'RETURN_APPROVED',
          entityType: 'RETURN',
          entityId: request._id,
          entityLabel: request.returnNumber,
          summary:
            `Return ${request.returnNumber} approved for ${approvedUnits} ` +
            `${approvedUnits === 1 ? 'unit' : 'units'} on order ${request.orderNumber}`,
          changes: [{ field: 'status', from: 'REQUESTED', to: 'APPROVED' }],
          // The internal note, not the customer-facing one: the audit trail is
          // where an operator's own commentary belongs.
          note: input.adminNote,
        },
        session,
      );

      approvedNumber = request.returnNumber;
    });

    return getAdminReturn(approvedNumber);
  } finally {
    await session.endSession();
  }
}

/**
 * Declines a return, with a reason the customer will read.
 *
 * `resolutionNote` is required by the validator for exactly this action. A
 * rejection with no explanation is the single worst thing this workflow could
 * produce — the customer is left with an item they cannot send back and no idea
 * why — so the server refuses to record one.
 *
 * The held quantity goes back to the pool. A customer rejected for asking for
 * the wrong line can immediately ask for the right one.
 */
export async function rejectReturn(
  returnRef: string,
  input: ReturnDecisionInput,
  actor: AuditActor,
): Promise<AdminReturnDetail> {
  const session = await mongoose.startSession();

  try {
    let rejectedNumber = '';

    await session.withTransaction(async () => {
      const request = await findReturnByRef(returnRef, session);
      assertReturnTransition(request.status as ReturnStatus, 'REJECTED');

      await releaseReturnQuantities(
        request.order as Types.ObjectId,
        request.items.map((item) => ({
          orderItemId: item.orderItemId as Types.ObjectId,
          quantity: item.requestedQuantity,
        })),
        session,
      );

      request.status = 'REJECTED';
      request.decidedAt = new Date();
      request.reviewedBy = new Types.ObjectId(actor.id);
      request.reviewedByName = actor.name;
      request.resolutionNote = input.resolutionNote ?? '';
      if (input.adminNote !== undefined) request.adminNote = input.adminNote;

      await request.save({ session });

      await recordAudit(
        {
          actor,
          action: 'RETURN_REJECTED',
          entityType: 'RETURN',
          entityId: request._id,
          entityLabel: request.returnNumber,
          summary: `Return ${request.returnNumber} rejected on order ${request.orderNumber}`,
          changes: [{ field: 'status', from: 'REQUESTED', to: 'REJECTED' }],
          note: input.adminNote,
        },
        session,
      );

      rejectedNumber = request.returnNumber;
    });

    return getAdminReturn(rejectedNumber);
  } finally {
    await session.endSession();
  }
}

/**
 * Records that the goods are physically back, and decides their fate.
 *
 * ## The resellable judgement
 *
 * `resellable` is an explicit input, not an inference. ZyCart has no inventory
 * condition model — a unit is either sellable stock or it is not in the count —
 * so whether returned goods rejoin the sellable pool is a call only the person
 * holding them can make. The dialog defaults it from the return reason (a
 * customer who said "damaged" probably sent back something damaged), but the
 * default is a convenience and the operator's answer is what is stored.
 *
 * When it is true, units go back through `restockFromReturn` — the Phase 12
 * inventory path, inside this transaction, writing a RETURN movement per line.
 * Nothing here increments `Product.stock`.
 *
 * `restocked` is set from what actually happened rather than from what was
 * asked, so a return whose products have since been deleted records honestly
 * that nothing went back.
 */
export async function receiveReturn(
  returnRef: string,
  input: ReceiveReturnInput,
  actor: AuditActor,
): Promise<AdminReturnDetail> {
  const session = await mongoose.startSession();

  try {
    let receivedNumber = '';

    await session.withTransaction(async () => {
      const request = await findReturnByRef(returnRef, session);
      assertReturnTransition(request.status as ReturnStatus, 'RECEIVED');

      request.status = 'RECEIVED';
      request.receivedAt = new Date();
      request.resellable = input.resellable;
      if (input.adminNote !== undefined) request.adminNote = input.adminNote;

      let restocked = 0;

      if (input.resellable && !request.restocked) {
        restocked = await restockFromReturn(
          {
            lines: request.items.map((item) => ({
              product: (item.product as Types.ObjectId | null) ?? null,
              productName: item.productName,
              sku: item.sku ?? '',
              quantity: item.approvedQuantity ?? item.requestedQuantity,
              selectedColor: item.selectedColor ?? null,
              selectedSize: item.selectedSize ?? null,
            })),
            reference: { id: request._id, label: request.returnNumber },
            actor,
          },
          session,
        );

        request.restocked = restocked > 0;
      }

      await request.save({ session });

      await recordAudit(
        {
          actor,
          action: 'RETURN_RECEIVED',
          entityType: 'RETURN',
          entityId: request._id,
          entityLabel: request.returnNumber,
          summary:
            `Return ${request.returnNumber} received · ` +
            (input.resellable
              ? restocked > 0
                ? `${restocked} ${restocked === 1 ? 'unit' : 'units'} returned to stock`
                : 'marked resellable, but no catalogue row remained to credit'
              : 'not resellable, stock unchanged'),
          changes: [
            { field: 'status', from: 'APPROVED', to: 'RECEIVED' },
            { field: 'resellable', from: '', to: input.resellable ? 'Yes' : 'No' },
          ],
          note: input.adminNote,
        },
        session,
      );

      receivedNumber = request.returnNumber;
    });

    return getAdminReturn(receivedNumber);
  } finally {
    await session.endSession();
  }
}

/* ---------------------------------------------------------------- */
/* Queue counts and the one metric worth computing                   */
/* ---------------------------------------------------------------- */

export interface ReturnsSummary {
  /** One count per lifecycle state, for the queue's filter tabs. */
  byStatus: Record<ReturnStatus, number>;
  open: number;
  /**
   * The return rate, with both halves of the fraction shown.
   *
   * ## The denominator, stated exactly
   *
   * `returnRequests / deliveredOrders`, over the same window, where:
   *
   *  - **returnRequests** counts *requests raised in the window*, whatever
   *    state they are now in — including rejected and withdrawn ones, because
   *    "how often do customers want to send things back?" is the question this
   *    answers, and filtering to approved ones would answer "how often do we
   *    agree?" instead.
   *  - **deliveredOrders** counts *orders delivered in the window*, by
   *    `deliveredAt`. Not orders placed: an order placed on the last day of the
   *    window cannot have produced a return yet, and counting it would drag the
   *    rate down for a reason that has nothing to do with returns.
   *
   * ## Both are order-level
   *
   * One return request against one order, regardless of how many lines it
   * covers. Mixing an item-level numerator with an order-level denominator is
   * the classic way to produce a percentage that is quietly meaningless, so it
   * is not done here — and the raw counts are returned beside the rate so
   * anybody can check the arithmetic.
   *
   * ## Null rather than zero
   *
   * With no delivered orders in the window there is no rate, and `0%` would
   * read as "nothing gets returned" rather than "nothing has been delivered".
   * The interface renders the absence.
   */
  rate: { percent: number | null; returnRequests: number; deliveredOrders: number; days: number };
  /** Orders delivered before Phase 13, which cannot be self-served. Honest, not hidden. */
  windowDays: number;
}

/**
 * The returns dashboard, in one round of indexed counts.
 *
 * Every count here is served by an index: the status counts by
 * `{ status: 1, createdAt: -1 }` on returns, the delivered-order count by the
 * `{ status: 1, deliveredAt: -1 }` index Phase 13 added for exactly this
 * query. Nothing loads a document.
 */
export async function getReturnsSummary(days = 30): Promise<ReturnsSummary> {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - (days - 1));

  const [counts, returnRequests, deliveredOrders] = await Promise.all([
    ReturnRequest.aggregate<{ _id: ReturnStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    ReturnRequest.countDocuments({ requestedAt: { $gte: from } }),
    Order.countDocuments({ status: 'DELIVERED', deliveredAt: { $gte: from } }),
  ]);

  const byId = new Map(counts.map((row) => [row._id, row.count]));

  const byStatus = Object.fromEntries(
    (Object.keys(RETURN_STATUS_FLOW) as ReturnStatus[]).map((status) => [
      status,
      byId.get(status) ?? 0,
    ]),
  ) as Record<ReturnStatus, number>;

  return {
    byStatus,
    open: HOLDING_RETURN_STATUSES.filter((status) => status !== 'REFUNDED').reduce(
      (sum, status) => sum + byStatus[status],
      0,
    ),
    rate: {
      percent:
        deliveredOrders > 0
          ? Math.round((returnRequests / deliveredOrders) * 1000) / 10
          : null,
      returnRequests,
      deliveredOrders,
      days,
    },
    windowDays: days,
  };
}

/** Guard for the validator's item cap, so the service states its own bound too. */
export function assertReturnItemCount(count: number): void {
  if (count < 1) throw new AppError('Choose at least one item to return.', 400);
  if (count > MAX_RETURN_ITEMS) {
    throw new AppError(`A return can cover at most ${MAX_RETURN_ITEMS} lines.`, 400);
  }
}

/** Exported for the verification script, which asserts the two halves agree. */
export const HOLDING_STATUSES = HOLDING_RETURN_STATUSES;
