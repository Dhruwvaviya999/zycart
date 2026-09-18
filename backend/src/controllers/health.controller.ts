import type { Request, Response } from 'express';
import mongoose from 'mongoose';

const CONNECTION_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/** Reports liveness plus non-sensitive runtime facts. */
export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    message: 'API is healthy',
    data: {
      environment: process.env.NODE_ENV ?? 'development',
      uptimeSeconds: Math.round(process.uptime()),
      database: CONNECTION_STATES[mongoose.connection.readyState] ?? 'unknown',
      timestamp: new Date().toISOString(),
    },
  });
}
