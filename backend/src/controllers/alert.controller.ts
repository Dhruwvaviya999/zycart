import type { Request, Response } from 'express';
import * as alertService from '../services/alerts/alert.service';
import { AppError } from '../utils/AppError';
import { alertQuerySchema, createAlertSchema } from '../validators/alert.validator';
import { idParamSchema } from '../validators/common';

function currentUserId(req: Request): string {
  if (!req.user) throw new AppError('Not authenticated', 401);
  return req.user.id;
}

export async function listAlerts(req: Request, res: Response): Promise<void> {
  const query = alertQuerySchema.parse(req.query);
  res.json({ success: true, data: await alertService.listAlerts(currentUserId(req), query) });
}

/** 201 for a new alert, 200 when the same one was already waiting — the body is the alert either way. */
export async function createAlert(req: Request, res: Response): Promise<void> {
  const input = createAlertSchema.parse(req.body);
  const { alert, created } = await alertService.createAlert(currentUserId(req), input);

  res.status(created ? 201 : 200).json({ success: true, data: alert });
}

export async function deleteAlert(req: Request, res: Response): Promise<void> {
  const { id } = idParamSchema.parse({ id: req.params.alertId });
  await alertService.deleteAlert(currentUserId(req), id);

  res.json({ success: true, data: null });
}
