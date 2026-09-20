import type { Request, Response } from 'express';
import * as auditService from '../services/admin/audit.service';
import * as operationsService from '../services/admin/operations.service';
import * as inventoryService from '../services/inventory/inventory.service';
import { requireActor } from '../utils/actor';
import { idParamSchema } from '../validators/common';
import { adminAuditQuerySchema, bulkOrderStatusSchema } from '../validators/admin.validator';
import {
  adjustStockSchema,
  adminInventoryQuerySchema,
  movementQuerySchema,
  setThresholdSchema,
} from '../validators/inventory.validator';

/**
 * Inventory, operations and the audit trail.
 *
 * Split out of `admin.controller` rather than appended to it — the console now
 * covers two distinct jobs, running the catalogue and running the day, and one
 * file for both would be four hundred lines of unrelated handlers.
 *
 * These are as thin as the rest. Each one validates, names its actor, delegates
 * and answers; not one of them touches a model. The actor matters: every write
 * below is attributable, and `requireActor` reads it from the verified session
 * rather than from anything the client sent — there is no field in any schema
 * here through which a caller could claim to be somebody else.
 */

const id = (req: Request): string => idParamSchema.parse({ id: req.params.id }).id;

/* ---------------------------------------------------------------- */
/* Inventory                                                         */
/* ---------------------------------------------------------------- */

export async function listInventory(req: Request, res: Response): Promise<void> {
  const query = adminInventoryQuerySchema.parse(req.query);
  const { items, pagination } = await inventoryService.listInventory(query);

  res.json({ success: true, data: items, pagination });
}

export async function getSummary(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await inventoryService.getInventorySummary() });
}

export async function getInventoryItem(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await inventoryService.getInventoryItem(id(req)) });
}

/**
 * Corrects one product's stock.
 *
 * The body carries a signed amount and a reason, and the validator rejects
 * anything else — there is no `stock` field here, so this endpoint cannot be
 * used to set a total however the request is shaped.
 */
export async function adjustStock(req: Request, res: Response): Promise<void> {
  const input = adjustStockSchema.parse(req.body);

  res.json({
    success: true,
    data: await inventoryService.adjustStock(id(req), input, requireActor(req)),
  });
}

export async function setThreshold(req: Request, res: Response): Promise<void> {
  const { lowStockThreshold } = setThresholdSchema.parse(req.body);

  res.json({
    success: true,
    data: await inventoryService.setThreshold(id(req), lowStockThreshold, requireActor(req)),
  });
}

/** One product's ledger, paged — the detail panel shows only the newest few. */
export async function listProductMovements(req: Request, res: Response): Promise<void> {
  const query = movementQuerySchema.parse({ ...req.query, product: id(req) });
  const { items, pagination } = await inventoryService.listMovements(query);

  res.json({ success: true, data: items, pagination });
}

/** The store-wide ledger. */
export async function listMovements(req: Request, res: Response): Promise<void> {
  const query = movementQuerySchema.parse(req.query);
  const { items, pagination } = await inventoryService.listMovements(query);

  res.json({ success: true, data: items, pagination });
}

/* ---------------------------------------------------------------- */
/* Operations                                                        */
/* ---------------------------------------------------------------- */

export async function getOperations(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await operationsService.getOperationsSummary() });
}

/**
 * Moves several orders at once.
 *
 * Answers with a per-order outcome rather than a single success, because a
 * partial result is the normal case: an operator selecting a page of orders
 * will routinely include one that has already shipped. The response says which
 * ones moved and why the rest did not.
 */
export async function bulkUpdateOrderStatus(req: Request, res: Response): Promise<void> {
  const { orderNumbers, status, note } = bulkOrderStatusSchema.parse(req.body);

  res.json({
    success: true,
    data: await operationsService.bulkUpdateOrderStatus(
      orderNumbers,
      status,
      requireActor(req),
      note,
    ),
  });
}

/* ---------------------------------------------------------------- */
/* Audit                                                             */
/* ---------------------------------------------------------------- */

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const query = adminAuditQuerySchema.parse(req.query);
  const { items, pagination } = await auditService.listAuditLogs(query);

  res.json({ success: true, data: items, pagination });
}

/** Who has performed an audited action, for the audit page's actor filter. */
export async function listAuditActors(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await auditService.listAuditActors() });
}
