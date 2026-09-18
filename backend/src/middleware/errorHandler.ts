import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';

interface ErrorResponse {
  success: false;
  message: string;
  errors?: { path: string; message: string }[];
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

  const status = clientErrorStatus(error);
  if (status !== undefined) {
    const message = error instanceof Error ? error.message : 'Bad request';
    return { status, body: { success: false, message } };
  }

  return { status: 500, body: { success: false, message: 'Internal server error' } };
}

/**
 * Centralized error middleware. Unexpected errors are logged in full but
 * reported to the client as a generic message so internals stay private.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const { status, body } = resolve(error);

  if (status >= 500) {
    console.error('Unhandled error:', error);
  }

  res.status(status).json(body);
}
