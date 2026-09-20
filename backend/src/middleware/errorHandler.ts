import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { serializeError } from '../utils/logger';

interface ErrorResponse {
  success: false;
  message: string;
  errors?: { path: string; message: string }[];
  /**
   * The correlation id, on server faults only (Phase 16).
   *
   * A customer who sees "Internal server error" has nothing to tell support,
   * and support has nothing to search. This is that reference — opaque, tied to
   * one request, and enough to find the exact log record that explains it.
   *
   * Absent from 4xx deliberately. A validation failure needs no incident
   * reference, and the existing `{ success, message, errors }` shape is one the
   * storefront already parses field-by-field; leaving it byte-identical means
   * Phase 16 changed no error contract a client depends on.
   */
  requestId?: string;
}

/** Terminal middleware for requests that matched no route. */
export function notFoundHandler(_req: Request, res: Response): void {
  const body: ErrorResponse = { success: false, message: 'Route not found' };
  res.status(404).json(body);
}

/**
 * Express and body-parser raise http-errors objects carrying a status, e.g. a
 * malformed JSON body. Read it so those surface as 4xx rather than 500.
 */
function clientErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const candidate = typeof status === 'number' ? status : statusCode;

  return typeof candidate === 'number' && candidate >= 400 && candidate < 500
    ? candidate
    : undefined;
}

/**
 * Names the field behind a duplicate-key error without echoing the value the
 * client sent, or the index name, back to them.
 */
function duplicateKeyField(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;

  const candidate = error as { code?: unknown; keyPattern?: unknown };
  if (candidate.code !== 11000) return undefined;

  const keys =
    typeof candidate.keyPattern === 'object' && candidate.keyPattern !== null
      ? Object.keys(candidate.keyPattern)
      : [];

  return keys[0] ?? 'field';
}

function resolve(error: unknown): { status: number; body: ErrorResponse } {
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Validation failed',
        errors: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    };
  }

  if (error instanceof AppError) {
    return { status: error.statusCode, body: { success: false, message: error.message } };
  }

  // A unique index rejected the write — a client problem, not a server fault.
  const duplicate = duplicateKeyField(error);
  if (duplicate !== undefined) {
    return {
      status: 409,
      body: { success: false, message: `A record with this ${duplicate} already exists` },
    };
  }

  // Reached when an id survives validation but Mongoose still cannot cast it.
  if (error instanceof mongoose.Error.CastError) {
    return { status: 400, body: { success: false, message: `Invalid ${error.path}` } };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Validation failed',
        errors: Object.values(error.errors).map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      },
    };
  }

  const status = clientErrorStatus(error);
  if (status !== undefined) {
    const message = error instanceof Error ? error.message : 'Bad request';
    return { status, body: { success: false, message } };
  }

  return { status: 500, body: { success: false, message: 'Internal server error' } };
}

/**
 * Centralized error middleware.
 *
 * ## Two audiences, two amounts of detail
 *
 * The client gets a sanitised sentence and, on a server fault, a correlation
 * id. It does not get the error class, the stack, the failing field of an
 * internal query or the name of a collection — that is the whole reason
 * `resolve` exists, and Phase 16 did not loosen it.
 *
 * The log gets the rest. But it is not written here: the error is *attached* to
 * the request, and `requestContext` writes it as part of the one record that
 * request produces. Logging in both places would produce two lines per failure,
 * correlated only by timestamp, and an operator would have to join them by hand
 * to learn how long the failing request took.
 *
 * ## What is kept
 *
 * Stacks are kept for 5xx and dropped below it. A 404 or a rejected validation
 * is the API working correctly; eighty frames of Express internals describing
 * it is noise that buries the faults that matter.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const { status, body } = resolve(error);

  req.loggedError = serializeError(error, { stack: status >= 500 });

  res.status(status).json(status >= 500 ? { ...body, requestId: req.requestId } : body);
}
