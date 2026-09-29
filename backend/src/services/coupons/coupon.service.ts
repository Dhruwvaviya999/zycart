import type mongoose from 'mongoose';
import { Types } from 'mongoose';
import { Coupon, COUPON_CODE_PATTERN } from '../../models/coupon.model';
import { CouponRedemption } from '../../models/coupon-redemption.model';
import { Order, type PaymentStatus } from '../../models/order.model';
import { AppError } from '../../utils/AppError';
import { escapeRegex } from '../../validators/common';
import {
  couponShapeProblems,
  type AdminCouponQuery,
  type CreateCouponInput,
  type UpdateCouponInput,
} from '../../validators/coupon.validator';
import { changed, recordAudit, type AuditActor, type AuditChange } from '../admin/audit.service';
import { couponState, describeDeal, evaluateCoupon, type CouponState } from './coupon-rules';

/**
 * Promotional codes: looking one up for a basket, holding and releasing a use,
 * and the console's view of them.
 *
 * The rules themselves — what a code is worth, whether it applies — live in
 * `coupon-rules.ts` as pure functions. This file does the reading and writing
 * around them, and the one thing a pure function cannot: make a limited code
 * safe under concurrency.
 */

type CouponDoc = InstanceType<typeof Coupon>;

/**
 * The payment states in which an online order is still a live intention to
 * use its coupon: unpaid, failed-but-retryable, or authorised and awaiting
 * capture.
 */
const LIVE_UNPAID_STATUSES: PaymentStatus[] = ['PENDING', 'FAILED', 'AUTHORIZED'];

/**
 * How many of this customer's orders hold this coupon.
 *
 * ## Why unpaid online orders count
 *
 * An online order does not redeem its coupon until it is paid — the same rule
 * stock follows, so abandoned payments cannot exhaust a promotion. Counting
 * only redemptions would then let one customer open two checkouts with a
 * single-use code and pay for both. Their own unpaid orders are counted here
 * too, so the second checkout is refused at placement. The unpaid order can be
 * paid for, or cancelled from the orders page, which gives the use back.
 */
export async function customerUses(
  couponId: Types.ObjectId,
  userId: string | Types.ObjectId,
  session?: mongoose.ClientSession,
): Promise<number> {
  const user = new Types.ObjectId(String(userId));

  const [redeemed, unpaid] = await Promise.all([
    CouponRedemption.countDocuments({ coupon: couponId, user, releasedAt: null }).session(
      session ?? null,
    ),
    Order.countDocuments({
      user,
      'coupon.coupon': couponId,
      status: 'PENDING',
      'payment.method': 'RAZORPAY',
      'payment.status': { $in: LIVE_UNPAID_STATUSES },
    }).session(session ?? null),
  ]);

  return redeemed + unpaid;
}

/** A coupon that applies to a basket, and what it takes off. */
export interface AppliedCoupon {
  coupon: CouponDoc;
  code: string;
  /** What the customer is told they are getting. */
  description: string;
  discount: number;
}

export type CouponLookup =
  { applicable: true; applied: AppliedCoupon } | { applicable: false; message: string };

/** Unknown and malformed codes get the same answer: there is nothing to learn from the difference. */
const NOT_A_CODE = 'That code is not valid.';

/**
 * Whether a code applies to this basket for this customer.
 *
 * Read-only. The checkout preview calls it on every change, and order placement
 * calls it again before it writes anything, because the answer can change in
 * between — the code expires, the last use goes, the basket shrinks below the
 * minimum. Nothing a customer was shown earlier is trusted at placement.
 */
export async function lookupCoupon(
  rawCode: string,
  userId: string,
  subtotal: number,
  now: Date = new Date(),
): Promise<CouponLookup> {
  const code = rawCode.trim().toUpperCase();

  if (!COUPON_CODE_PATTERN.test(code)) return { applicable: false, message: NOT_A_CODE };

  const coupon = await Coupon.findOne({ code });
  if (!coupon) return { applicable: false, message: NOT_A_CODE };

  const verdict = evaluateCoupon(coupon, {
    subtotal,
    now,
    customerUses: await customerUses(coupon._id, userId),
  });

  if (!verdict.applicable) return { applicable: false, message: verdict.message };

  return {
    applicable: true,
    applied: {
      coupon,
      code: coupon.code,
      description: coupon.description || describeDeal(coupon),
      discount: verdict.discount,
    },
  };
}

export interface RedemptionInput {
  couponId: Types.ObjectId;
  code: string;
  userId: Types.ObjectId | string;
  orderId: Types.ObjectId;
  orderNumber: string;
  discount: number;
}

export interface RedemptionOutcome {
  /**
   * True when an online order kept a discount the coupon no longer had room
   * for. Reported so the caller can log it after its transaction commits.
   */
  overLimit: boolean;
}

/**
 * Records that a committed order used a coupon. Runs inside the caller's
 * transaction.
 *
 * ## `enforce`: the difference between placing an order and being paid for one
 *
 * A cash-on-delivery order redeems at placement, where refusing is harmless —
 * the customer is still at checkout and can remove the code. So the limits are
 * enforced atomically: the usage limit rides in the update's own filter, and
 * the per-customer count is taken after a write to the coupon document that
 * forces concurrent redemptions to serialise (see `Coupon.usedCount`).
 *
 * An online order redeems at payment, where the customer has already paid the
 * discounted price. Refusing then would mean refunding a captured payment over
 * a promotion — punishing a customer for the store's race. So the use is
 * recorded without the limit check, and a limit exceeded this way is reported
 * rather than hidden. It can only ever be exceeded by the number of payments
 * genuinely in flight at the moment the last use went.
 */
export async function redeemCoupon(
  input: RedemptionInput,
  session: mongoose.ClientSession,
  options: { enforce: boolean },
): Promise<RedemptionOutcome> {
  const now = new Date();

  const filter: Record<string, unknown> = { _id: input.couponId };

  if (options.enforce) {
    filter.isActive = true;
    filter.$and = [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      { $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }] },
    ];
  }

  const coupon = await Coupon.findOneAndUpdate(
    filter,
    { $inc: { usedCount: 1 } },
    { session, returnDocument: 'after' },
  );

  if (options.enforce) {
    if (!coupon) {
      throw new AppError(
        `The coupon ${input.code} is no longer available. Remove it and try again.`,
        409,
      );
    }

    if (coupon.perUserLimit) {
      const uses = await CouponRedemption.countDocuments({
        coupon: input.couponId,
        user: input.userId,
        releasedAt: null,
      }).session(session);

      if (uses >= coupon.perUserLimit) {
        throw new AppError(`You have already used the coupon ${input.code}.`, 409);
      }
    }
  }

  /**
   * Written even when the coupon has been deleted since the order was placed
   * (`coupon` is null): the order still used it, and the record of that is the
   * point of this collection.
   */
  await CouponRedemption.create(
    [
      {
        coupon: input.couponId,
        code: input.code,
        user: input.userId,
        order: input.orderId,
        orderNumber: input.orderNumber,
        discount: input.discount,
      },
    ],
    { session },
  );

  return {
    overLimit: Boolean(coupon?.usageLimit && coupon.usedCount > coupon.usageLimit),
  };
}

/**
 * Gives a cancelled order's use back. Runs inside the caller's transaction.
 *
 * Conditional on an unreleased redemption existing, so it is idempotent — a
 * second cancellation path, or a retried transaction, finds nothing to release.
 * An online order cancelled before payment never redeemed, and finds nothing
 * too, which is correct.
 */
export async function releaseCoupon(
  orderId: Types.ObjectId,
  session: mongoose.ClientSession,
): Promise<string | null> {
  const redemption = await CouponRedemption.findOneAndUpdate(
    { order: orderId, releasedAt: null },
    { $set: { releasedAt: new Date() } },
    { session, returnDocument: 'after' },
  );

  if (!redemption) return null;

  await Coupon.updateOne(
    { _id: redemption.coupon, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } },
    { session },
  );

  return redemption.code;
}

/* ---------------------------------------------------------------- */
/* The console                                                       */
/* ---------------------------------------------------------------- */

export interface AdminCouponRow {
  id: string;
  code: string;
  description: string;
  /** "10% off (up to ₹500)". */
  deal: string;
  type: CouponDoc['type'];
  value: number;
  maxDiscount: number | null;
  minOrderValue: number;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  isActive: boolean;
  /** Decided by `couponState`, so the badge and the checkout agree. */
  state: CouponState;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCouponDetail extends AdminCouponRow {
  /** The most recent uses, newest first. */
  redemptions: {
    orderNumber: string;
    discount: number;
    released: boolean;
    createdAt: string;
  }[];
  /** Total rupees given away by unreleased uses. */
  totalDiscount: number;
  /** Only a never-used coupon can be deleted; the console offers the switch otherwise. */
  canDelete: boolean;
}

function toRow(coupon: CouponDoc, now: Date = new Date()): AdminCouponRow {
  return {
    id: String(coupon._id),
    code: coupon.code,
    description: coupon.description ?? '',
    deal: describeDeal(coupon),
    type: coupon.type,
    value: coupon.value,
    maxDiscount: coupon.maxDiscount ?? null,
    minOrderValue: coupon.minOrderValue ?? 0,
    startsAt: coupon.startsAt?.toISOString() ?? null,
    expiresAt: coupon.expiresAt?.toISOString() ?? null,
    usageLimit: coupon.usageLimit ?? null,
    perUserLimit: coupon.perUserLimit ?? null,
    usedCount: coupon.usedCount,
    isActive: coupon.isActive,
    state: couponState(coupon, now),
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  };
}

/**
 * The state filter, as the same precedence `couponState` applies.
 *
 * Built as a query rather than by loading every coupon and filtering in memory,
 * so pagination counts what the filter actually matches.
 */
function stateFilter(state: CouponState, now: Date): Record<string, unknown> {
  const live = { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
  const hasRoom = {
    $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }],
  };

  switch (state) {
    case 'INACTIVE':
      return { isActive: false };
    case 'EXPIRED':
      return { isActive: true, expiresAt: { $ne: null, $lte: now } };
    case 'EXHAUSTED':
      return {
        isActive: true,
        usageLimit: { $ne: null },
        $and: [live, { $expr: { $gte: ['$usedCount', '$usageLimit'] } }],
      };
    case 'SCHEDULED':
      return { isActive: true, startsAt: { $gt: now }, $and: [live, hasRoom] };
    case 'ACTIVE':
      return {
        isActive: true,
        $and: [live, hasRoom, { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] }],
      };
  }
}

export async function listCoupons(query: AdminCouponQuery) {
  const now = new Date();
  const filter: Record<string, unknown> = query.state ? stateFilter(query.state, now) : {};

  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    const clause = { $or: [{ code: pattern }, { description: pattern }] };
    filter.$and = [...((filter.$and as unknown[] | undefined) ?? []), clause];
  }

  const [coupons, total] = await Promise.all([
    Coupon.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Coupon.countDocuments(filter),
  ]);

  return {
    items: coupons.map((coupon) => toRow(coupon, now)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

async function loadCoupon(id: string): Promise<CouponDoc> {
  const coupon = Types.ObjectId.isValid(id) ? await Coupon.findById(id) : null;
  if (!coupon) throw new AppError('Coupon not found', 404);
  return coupon;
}

export async function getCoupon(id: string): Promise<AdminCouponDetail> {
  const coupon = await loadCoupon(id);

  const [recent, totals, everUsed] = await Promise.all([
    CouponRedemption.find({ coupon: coupon._id }).sort({ createdAt: -1 }).limit(20).lean(),
    CouponRedemption.aggregate<{ _id: null; total: number }>([
      { $match: { coupon: coupon._id, releasedAt: null } },
      { $group: { _id: null, total: { $sum: '$discount' } } },
    ]),
    CouponRedemption.exists({ coupon: coupon._id }),
  ]);

  return {
    ...toRow(coupon),
    redemptions: recent.map((entry) => ({
      orderNumber: entry.orderNumber,
      discount: entry.discount,
      released: entry.releasedAt !== null && entry.releasedAt !== undefined,
      createdAt: (entry.createdAt as Date).toISOString(),
    })),
    totalDiscount: totals[0]?.total ?? 0,
    canDelete: !everUsed && coupon.usedCount === 0,
  };
}

const isDuplicateKey = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;

export async function createCoupon(
  input: CreateCouponInput,
  actor: AuditActor,
): Promise<AdminCouponDetail> {
  let coupon: CouponDoc;

  try {
    coupon = await Coupon.create({
      code: input.code,
      description: input.description ?? '',
      type: input.type,
      value: input.value,
      maxDiscount: input.type === 'PERCENT' ? (input.maxDiscount ?? null) : null,
      minOrderValue: input.minOrderValue ?? 0,
      startsAt: input.startsAt ?? null,
      expiresAt: input.expiresAt ?? null,
      usageLimit: input.usageLimit ?? null,
      perUserLimit: input.perUserLimit === undefined ? 1 : input.perUserLimit,
      isActive: input.isActive ?? true,
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError(`A coupon with the code ${input.code} already exists`, 409);
    }
    throw error;
  }

  // After the write, as product creation's audit is: a single-document insert
  // has no transaction to join.
  await recordAudit({
    actor,
    action: 'COUPON_CREATED',
    entityType: 'COUPON',
    entityId: coupon._id,
    entityLabel: coupon.code,
    summary: `Coupon ${coupon.code} created — ${describeDeal(coupon)}`,
  });

  return getCoupon(String(coupon._id));
}

const dateText = (value: Date | null | undefined): string => value?.toISOString() ?? '';
const limitText = (value: number | null | undefined): string =>
  value === null || value === undefined ? 'unlimited' : String(value);

export async function updateCoupon(
  id: string,
  input: UpdateCouponInput,
  actor: AuditActor,
): Promise<AdminCouponDetail> {
  const coupon = await loadCoupon(id);

  const next = {
    type: input.type ?? coupon.type,
    value: input.value ?? coupon.value,
    maxDiscount: input.maxDiscount === undefined ? coupon.maxDiscount : input.maxDiscount,
    startsAt: input.startsAt === undefined ? coupon.startsAt : input.startsAt,
    expiresAt: input.expiresAt === undefined ? coupon.expiresAt : input.expiresAt,
  };

  // Switching to FLAT drops a cap that would no longer mean anything, rather
  // than refusing a change the operator clearly intended.
  if (next.type === 'FLAT' && input.maxDiscount === undefined) next.maxDiscount = null;

  const problems = couponShapeProblems(next);
  if (problems[0]) throw new AppError(`${problems[0].path} ${problems[0].message}`, 400);

  const changes: AuditChange[] = [
    ...changed('description', coupon.description, input.description ?? coupon.description),
    ...changed('type', coupon.type, next.type),
    ...changed('value', coupon.value, next.value),
    ...changed('maxDiscount', limitText(coupon.maxDiscount), limitText(next.maxDiscount)),
    ...changed('minOrderValue', coupon.minOrderValue, input.minOrderValue ?? coupon.minOrderValue),
    ...changed('startsAt', dateText(coupon.startsAt), dateText(next.startsAt)),
    ...changed('expiresAt', dateText(coupon.expiresAt), dateText(next.expiresAt)),
    ...changed(
      'usageLimit',
      limitText(coupon.usageLimit),
      limitText(input.usageLimit === undefined ? coupon.usageLimit : input.usageLimit),
    ),
    ...changed(
      'perUserLimit',
      limitText(coupon.perUserLimit),
      limitText(input.perUserLimit === undefined ? coupon.perUserLimit : input.perUserLimit),
    ),
    ...changed('isActive', coupon.isActive, input.isActive ?? coupon.isActive),
  ];

  if (input.description !== undefined) coupon.description = input.description;
  coupon.type = next.type;
  coupon.value = next.value;
  coupon.maxDiscount = next.maxDiscount ?? null;
  if (input.minOrderValue !== undefined) coupon.minOrderValue = input.minOrderValue;
  coupon.startsAt = next.startsAt ?? null;
  coupon.expiresAt = next.expiresAt ?? null;
  if (input.usageLimit !== undefined) coupon.usageLimit = input.usageLimit;
  if (input.perUserLimit !== undefined) coupon.perUserLimit = input.perUserLimit;
  if (input.isActive !== undefined) coupon.isActive = input.isActive;

  await coupon.save();

  if (changes.length > 0) {
    await recordAudit({
      actor,
      action: 'COUPON_UPDATED',
      entityType: 'COUPON',
      entityId: coupon._id,
      entityLabel: coupon.code,
      summary: `Coupon ${coupon.code} updated`,
      changes,
    });
  }

  return getCoupon(String(coupon._id));
}

/**
 * Deletes a coupon nobody has used.
 *
 * A used coupon is refused: its redemptions and the orders that carry its
 * snapshot would be left naming a code that no longer exists, and the history
 * of what the store gave away would have a hole in it. Switching it off does
 * everything deleting it would, without that.
 */
export async function deleteCoupon(id: string, actor: AuditActor): Promise<void> {
  const coupon = await loadCoupon(id);

  if (coupon.usedCount > 0 || (await CouponRedemption.exists({ coupon: coupon._id }))) {
    throw new AppError(
      'This coupon has been used, so it cannot be deleted. Switch it off instead.',
      409,
    );
  }

  await Coupon.deleteOne({ _id: coupon._id });

  await recordAudit({
    actor,
    action: 'COUPON_DELETED',
    entityType: 'COUPON',
    entityId: coupon._id,
    entityLabel: coupon.code,
    summary: `Coupon ${coupon.code} deleted`,
  });
}
