import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiRouter } from './routes';

/** Builds the Express application. Startup concerns live in server.ts. */
export function createApp(env: Env): Express {
  const app = express();

  // Express only populates req.ip from X-Forwarded-For when it is told to trust
  // the proxy in front of it; without this the rate limiter would see one IP.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: [env.CLIENT_URL, 'http://localhost:3001'], credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Hands the validated config to handlers, so nothing downstream reads
  // process.env or has to be built as a factory just to see configuration.
  app.use((req, _res, next) => {
    req.env = env;
    next();
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
