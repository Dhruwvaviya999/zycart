import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const healthRouter = Router();

/**
 * Asynchronous from Phase 16: the readiness check makes a real round trip to
 * MongoDB, so a rejection has to reach the error middleware rather than become
 * an unhandled rejection that takes the process with it.
 */
healthRouter.get('/health', asyncHandler(getHealth));
