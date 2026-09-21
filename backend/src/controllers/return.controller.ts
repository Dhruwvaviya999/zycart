import type { Request, Response } from 'express';
import * as returnService from '../services/returns/return.service';
import { AppError } from '../utils/AppError';
import { orderRefSchema } from '../validators/order.validator';
import {
  createReturnSchema,
  returnQuerySchema,
  returnRefSchema,
} from '../validators/return.validator';

/**
 * The customer's side of returns.
 *
 * As thin as every other controller here: validate, name the user, delegate,
 * answer. Not one handler touches a model, and not one makes a decision — "may
 * this be returned?" is answered in `return.service` against the stored order,
 * because a rule enforced in a controller is a rule that only applies to
 * requests that came through that controller.
 *
 * Every route below is mounted behind `requireAuth`, and every service call is
 * scoped by the signed-in user's id. There is no handler here that takes a user
 * id from anywhere but the verified session.
 */

function currentUserId(req: Request): string {
  if (!req.user) throw new AppError('Not authenticated', 401);
  return req.user.id;
}

const orderRef = (req: Request): string =>
  orderRefSchema.parse({ orderRef: req.params.orderRef }).orderRef;

const returnRef = (req: Request): string =>
  returnRefSchema.parse({ returnRef: req.params.returnRef }).returnRef;

/** Raises a return against one of the caller's own orders. */
export async function createReturn(req: Request, res: Response): Promise<void> {
  const input = createReturnSchema.parse(req.body);

  res.status(201).json({
    success: true,
    data: await returnService.createReturn(currentUserId(req), orderRef(req), input),
  });
}

export async function listReturns(req: Request, res: Response): Promise<void> {
  const query = returnQuerySchema.parse(req.query);
  const { items, pagination } = await returnService.listReturns(currentUserId(req), query);

  res.json({ success: true, data: items, pagination });
}

export async function getReturn(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: await returnService.getReturn(currentUserId(req), returnRef(req)),
  });
}

/**
 * Withdraws a request the customer no longer wants.
 *
 * No body: there is nothing to say and nothing to validate. A withdrawal is not
 * a decision that needs a reason from the person who raised it.
 */
export async function cancelReturn(req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: await returnService.cancelReturn(currentUserId(req), returnRef(req)),
  });
}
