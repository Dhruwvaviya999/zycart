import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';

/** Builds the Express application. Startup concerns live in server.ts. */
export function createApp(env: Env): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: [env.CLIENT_URL, 'http://localhost:3001'], credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
