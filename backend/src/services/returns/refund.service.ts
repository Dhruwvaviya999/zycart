import mongoose, { Types } from 'mongoose';
import type { Env } from '../../config/env';
import { Order } from '../../models/order.model';
import { ReturnRequest } from '../../models/return.model';
import { AppError } from '../../utils/AppError';
import { recordAudit, type AuditActor } from '../admin/audit.service';
import * as razorpay from '../razorpay.service';
import { plannedRefund, refundability } from './return-policy';
import { getAdminReturn, type AdminReturnDetail } from './return.service';

/**
 * Money going back to a customer for a return.
 *
 * ## One refund architecture, not two
 *
 * Phase 7 already refunded: when a payment was captured for an order that could
 * not be fulfilled, it reversed the whole thing. Phase 13 did not build a
 * second gateway integration beside it. Both paths convert rupees to paise in
 * `razorpay.service` and nowhere else, both take their amount from stored order
 * data, and both protect against duplicates with the same technique — an atomic
 * conditional update that must succeed before any money moves.
 *
 * What is new is only what returns actually need: a partial amount, and a place
 * to keep a second gateway refund id against an order that may already have
 * one.
 *
 * ## Why duplicate protection is a database claim and not a gateway key
 *
 * Razorpay's refund endpoint, through this SDK, takes no idempotency key that
 * would make a retried call safe. So the guarantee has to be ours, and it is
 * the same one `refundUnfulfillablePayment` has relied on since Phase 7: the
 * transition into REFUND_PENDING is a `findOneAndUpdate` whose filter requires
 * the return not to have been claimed. Two admins clicking at the same instant
 * produce one claim; the loser's update matches nothing and is refused before
 * it can reach the gateway.
 *
 * ## The three states a refund attempt can end in
 *
 * - **Processed.** The gateway settled it immediately. Return goes REFUNDED,
 *   the order's `payment.refundedAmount` grows, an audit row is written.
 * - **Pending.** The gateway accepted it and the bank has not settled. Return
 *   stays REFUND_PENDING with a real refund id. It moves on when the
 *   `refund.processed` webhook arrives, or when an operator asks the gateway.
 * - **Failed.** The claim is released, the reason is stored, and the return
 *   goes back to RECEIVED so it can be retried. Nothing is marked refunded, and
 *   the failure is loud in the log and on the screen. This is the case §51
 *   exists for, and the one it is easiest to get wrong by swallowing.
 */

/**
 * Issues the refund for one approved, received return.
 *
 * The amount is recomputed here from the order's snapshot and the approved
 * quantities, inside the claim. It is not taken from the request, not taken
 * from what the console displayed, and not taken from what was stored when the
 * return was approved — because the order may have been partly refunded by
 * another return in between, and the cap has to be applied against the truth at
 * the moment the money moves.
 */
export async function issueReturnRefund(
  env: Env,
  returnRef: string,
  actor: AuditActor,
): Promise<AdminReturnDetail> {
  const { request, order, amount } = await claimForRefund(returnRef, actor);

  try {
    const refund = await razorpay.refundPayment(env, {
      razorpayPaymentId: order.payment.razorpayPaymentId as string,
      amountInRupees: amount,
      reason: 'customer_return',
      receipt: request.returnNumber,
      notes: { zycartReturnNumber: request.returnNumber, zycartOrderNumber: order.orderNumber },
    });

    const settled = refund.status === 'processed';

    await settleRefund({
      returnId: request._id,
      orderId: order._id,
      razorpayRefundId: refund.id,
      amount,
      settled,
      actor,
      returnNumber: request.returnNumber,
      orderNumber: order.orderNumber,
    });

    return getAdminReturn(request.returnNumber);
  } catch (error) {
    /**
     * The gateway refused or was unreachable. Release the claim so the return
     * can be tried again, and record why.
     *
     * Deliberately no audit row: the audit trail records mutations that
     * happened, and a refund that did not happen is not one. The failure lives
     * on the return itself, where the operator who has to act on it will see
     * it, and in the log with the ids needed to investigate.
     */
    const message =
      error instanceof AppError ? error.message : 'The payment provider could not be reached.';

    await ReturnRequest.updateOne(
      { _id: request._id, status: 'REFUND_PENDING', 'refund.razorpayRefundId': null },
      {
        $set: {
          status: 'RECEIVED',
          'refund.claimedAt': null,
          'refund.failureReason': message.slice(0, 300),
          'refund.failedAt': new Date(),
        },
      },
    );

    console.error(
      `[returns] REFUND FAILED for ${request.returnNumber} (order ${order.orderNumber}, ` +
        `payment ${order.payment.razorpayPaymentId}) - needs another attempt`,
      error instanceof Error ? error.message : error,
    );

    throw error;
  }
}

/**
 * Takes exclusive ownership of this return's refund, or refuses.
 *
 * The filter carries every precondition, so this is one atomic operation rather
 * than a read followed by a decision: the return must be RECEIVED, must have no
 * gateway refund already, and must not be claimed. A second request — a second
 * admin, a double-click, a retried fetch — matches nothing and is told so.
 */
async function claimForRefund(returnRef: string, actor: AuditActor) {
  const session = await mongoose.startSession();

  try {
    let claimed:
      | {
          request: InstanceType<typeof ReturnRequest>;
          order: InstanceType<typeof Order>;
          amount: number;
        }
      | undefined;

    await session.withTransaction(async () => {
      const request = await ReturnRequest.findOne(
        isObjectIdLike(returnRef)
          ? { _id: returnRef }
          : { returnNumber: returnRef.toUpperCase() },
      ).session(session);

      if (!request) throw new AppError('Return request not found', 404);

      const order = await Order.findById(request.order).session(session);
      if (!order) throw new AppError('The order behind this return no longer exists.', 409);

      const quantities = request.items.map((item) => ({
        unitPrice: item.unitPrice,
        quantity: item.approvedQuantity ?? item.requestedQuantity,
      }));

      const policyOrder = {
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

      const amount = plannedRefund(policyOrder, quantities);
      const verdict = refundability(policyOrder, amount);

      if (!verdict.refundable) {
        throw new AppError(verdict.explanation, 409);
      }

      /**
       * The claim. Every precondition is in the filter.
       *
       * `refund.claimedAt: null` is the one that makes this idempotent — it is
       * set by this very update, so a second attempt cannot match.
       */
      const updated = await ReturnRequest.findOneAndUpdate(
        {
          _id: request._id,
          status: 'RECEIVED',
          'refund.claimedAt': null,
          'refund.razorpayRefundId': null,
        },
        {
          $set: {
            status: 'REFUND_PENDING',
            'refund.claimedAt': new Date(),
            'refund.amount': amount,
            'refund.initiatedByName': actor.name,
            // Cleared, not kept: this is a fresh attempt, and a stale reason
            // beside a pending refund would read as though it had just failed.
            'refund.failureReason': null,
            'refund.failedAt': null,
          },
        },
        { session, returnDocument: 'after' },
      );

      if (!updated) {
        throw new AppError(
          request.status === 'REFUNDED'
            ? 'This return has already been refunded.'
            : request.status === 'REFUND_PENDING'
              ? 'A refund for this return is already being processed.'
              : `A return that is ${request.status.toLowerCase().replace(/_/g, ' ')} cannot be ` +
                'refunded. Mark the goods received first.',
          409,
        );
      }

      claimed = { request: updated, order, amount };
    });

    if (!claimed) throw new AppError('Could not start the refund', 500);
    return claimed;
  } finally {
    await session.endSession();
  }
}

/**
 * Records a refund that the gateway accepted.
 *
 * Both writes in one transaction, because they are two halves of one fact: the
 * return says money went back, and the order's running total says how much of
 * it has. If those could diverge, the cap that stops an order being over-refunded
 * would be computed from a number that had missed a refund.
 *
 * `payment.status` is moved to REFUNDED only when the cumulative refunds reach
 * the order total — a partial refund leaves an order that is still, accurately,
 * PAID. Widening the payment enum with a PARTIALLY_REFUNDED value was the
 * alternative, and it was declined: every existing rule that reads payment
 * status (the attention queue, the cancellation guard, the retry guard) would
 * have had to learn about it, for a distinction the new `refundedAmount` field
 * already carries precisely.
 */
async function settleRefund(params: {
  returnId: Types.ObjectId;
  orderId: Types.ObjectId;
  razorpayRefundId: string;
  amount: number;
  settled: boolean;
  actor: AuditActor;
  returnNumber: string;
  orderNumber: string;
}): Promise<void> {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const now = new Date();

      /**
       * Guarded on the refund id still being absent, so a webhook that raced
       * this call cannot cause the amount to be counted twice.
       */
      const updated = await ReturnRequest.findOneAndUpdate(
        { _id: params.returnId, 'refund.razorpayRefundId': null },
        {
          $set: {
            status: params.settled ? 'REFUNDED' : 'REFUND_PENDING',
            'refund.razorpayRefundId': params.razorpayRefundId,
            'refund.initiatedAt': now,
            'refund.completedAt': params.settled ? now : null,
          },
        },
        { session, returnDocument: 'after' },
      );

      if (!updated) return;

      const order = await Order.findByIdAndUpdate(
        params.orderId,
        { $inc: { 'payment.refundedAmount': params.amount } },
        { session, returnDocument: 'after' },
      );

      /**
       * The whole order has now come back. Bring the payment state into line
       * with the existing vocabulary, using exactly the states Phase 7 defined:
       * REFUNDED once settled, REFUND_PENDING while the gateway is still
       * working on it.
       */
      if (order && (order.payment.refundedAmount ?? 0) >= order.pricing.total) {
        await Order.updateOne(
          { _id: params.orderId, 'payment.status': { $nin: ['REFUNDED'] } },
          {
            $set: {
              'payment.status': params.settled ? 'REFUNDED' : 'REFUND_PENDING',
              'payment.refundId': order.payment.refundId ?? params.razorpayRefundId,
              'payment.refundedAt': params.settled ? now : null,
              'payment.refundReason':
                order.payment.refundReason ?? 'Refunded in full through customer returns',
            },
          },
          { session },
        );
      }

      await recordAudit(
        {
          actor: params.actor,
          action: params.settled ? 'RETURN_REFUND_COMPLETED' : 'RETURN_REFUND_INITIATED',
          entityType: 'RETURN',
          entityId: params.returnId,
          entityLabel: params.returnNumber,
          summary:
            `Refund of ₹${params.amount.toLocaleString('en-IN')} ` +
            `${params.settled ? 'completed' : 'initiated'} for return ${params.returnNumber} ` +
            `(order ${params.orderNumber})`,
          changes: [
            { field: 'refundAmount', from: '', to: String(params.amount) },
            { field: 'refundId', from: '', to: params.razorpayRefundId },
          ],
        },
        session,
      );
    });
  } finally {
    await session.endSession();
  }
}

/**
 * Asks the gateway whether a pending refund has landed, and records the answer.
 *
 * The console's "Check with Razorpay" action. Nothing here asserts anything —
 * it reads the refund and moves the return only in the direction the gateway's
 * own status allows, which is the same discipline `getPaymentStatus` follows
 * for an unconfirmed payment.
 *
 * A refund the gateway reports as failed sends the return back to RECEIVED with
 * the reason recorded, so it can be tried again. The amount already added to
 * the order's running total is taken back off, because it did not happen.
 */
export async function reconcileReturnRefund(
  env: Env,
  returnRef: string,
  actor: AuditActor,
): Promise<AdminReturnDetail> {
  const request = await ReturnRequest.findOne(
    isObjectIdLike(returnRef) ? { _id: returnRef } : { returnNumber: returnRef.toUpperCase() },
  );

  if (!request) throw new AppError('Return request not found', 404);

  const refundId = request.refund?.razorpayRefundId;

  if (!refundId) {
    throw new AppError('No refund has been issued for this return yet.', 409);
  }

  if (request.status === 'REFUNDED') return getAdminReturn(request.returnNumber);

  const refund = await razorpay.fetchRefund(env, refundId);

  await applyRefundOutcome({
    returnId: request._id,
    refundId,
    status: refund.status,
    actor,
  });

  return getAdminReturn(request.returnNumber);
}

/**
 * Moves a return according to what the gateway says about its refund.
 *
 * Shared by the reconciliation action above and by the `refund.processed` /
 * `refund.failed` webhooks — so a refund that settles overnight reaches the
 * same state whether Razorpay told us or an operator asked. Two callers, one
 * implementation, no drift.
 *
 * Every update is conditional on the state it expects to find, so a webhook and
 * a manual check arriving together produce one transition.
 */
export async function applyRefundOutcome(params: {
  returnId: Types.ObjectId;
  refundId: string;
  status: string;
  actor: AuditActor | null;
}): Promise<'SETTLED' | 'FAILED' | 'UNCHANGED'> {
  const now = new Date();

  if (params.status === 'processed') {
    const session = await mongoose.startSession();

    try {
      let outcome: 'SETTLED' | 'UNCHANGED' = 'UNCHANGED';

      await session.withTransaction(async () => {
        const updated = await ReturnRequest.findOneAndUpdate(
          { _id: params.returnId, status: 'REFUND_PENDING' },
          { $set: { status: 'REFUNDED', 'refund.completedAt': now } },
          { session, returnDocument: 'after' },
        );

        if (!updated) return;

        /**
         * The order's payment only becomes REFUNDED once everything has come
         * back. A partial return that settles leaves a PAID order with a
         * non-zero `refundedAmount`, which is the accurate description.
         */
        await Order.updateOne(
          {
            _id: updated.order,
            'payment.status': 'REFUND_PENDING',
            $expr: { $gte: ['$payment.refundedAmount', '$pricing.total'] },
          },
          { $set: { 'payment.status': 'REFUNDED', 'payment.refundedAt': now } },
          { session },
        );

        if (params.actor) {
          await recordAudit(
            {
              actor: params.actor,
              action: 'RETURN_REFUND_COMPLETED',
              entityType: 'RETURN',
              entityId: updated._id,
              entityLabel: updated.returnNumber,
              summary: `Refund for return ${updated.returnNumber} confirmed settled by Razorpay`,
              changes: [{ field: 'status', from: 'REFUND_PENDING', to: 'REFUNDED' }],
            },
            session,
          );
        }

        outcome = 'SETTLED';
      });

      return outcome;
    } finally {
      await session.endSession();
    }
  }

  if (params.status === 'failed') {
    const session = await mongoose.startSession();

    try {
      let outcome: 'FAILED' | 'UNCHANGED' = 'UNCHANGED';

      await session.withTransaction(async () => {
        const updated = await ReturnRequest.findOneAndUpdate(
          { _id: params.returnId, status: 'REFUND_PENDING' },
          {
            $set: {
              status: 'RECEIVED',
              'refund.claimedAt': null,
              'refund.razorpayRefundId': null,
              'refund.initiatedAt': null,
              'refund.failureReason':
                'The payment provider reported that this refund failed. It can be tried again.',
              'refund.failedAt': now,
            },
          },
          { session, returnDocument: 'after' },
        );

        if (!updated) return;

        /**
         * The money did not go back, so the running total must not claim it
         * did. Floored at zero, because a total that could go negative would
         * let a subsequent refund exceed the order.
         */
        const amount = updated.refund?.amount ?? 0;

        if (amount > 0) {
          await Order.updateOne(
            { _id: updated.order, 'payment.refundedAmount': { $gte: amount } },
            { $inc: { 'payment.refundedAmount': -amount } },
            { session },
          );
        }

        console.error(
          `[returns] refund for ${updated.returnNumber} reported FAILED by Razorpay - back to received`,
        );

        outcome = 'FAILED';
      });

      return outcome;
    } finally {
      await session.endSession();
    }
  }

  return 'UNCHANGED';
}

/** Local copy so this module does not import the validators for one regex. */
const isObjectIdLike = (value: string): boolean => /^[0-9a-fA-F]{24}$/.test(value);
