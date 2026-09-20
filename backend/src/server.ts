import 'dotenv/config';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';

import { connectDatabase } from './config/database';
import { loadEnv } from './config/env';
import { createApp } from './app';

const env = loadEnv();
const app = createApp(env);

let databasePromise: Promise<void> | null = null;

async function ensureDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!databasePromise) {
    databasePromise = connectDatabase(env.MONGODB_URI).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  await databasePromise;
}

async function handler(req: Request, res: Response): Promise<void> {
  try {
    await ensureDatabase();
    app(req, res);
  } catch (error) {
    console.error(
      'Backend request failed:',
      error instanceof Error ? error.message : String(error),
    );

    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        message: 'Database temporarily unavailable',
      });
    }
  }
}

export default handler;