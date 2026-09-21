import mongoose from 'mongoose';
import { logger, serializeError } from '../utils/logger';

/**
 * Opens the Mongoose connection.
 *
 * The URI is never logged: it carries the password in every deployment that
 * has one. Only the resolved host and database name are reported — facts the
 * driver worked out for itself, and the two an operator needs in order to know
 * which database a process is actually talking to.
 *
 * On failure the driver's own message is logged, and that message frequently
 * quotes the URI back. It is safe here only because `configureObservability`
 * registered `MONGODB_URI` with the redactor before this module could be
 * called — which is the case the value-based layer of `redact.ts` exists for.
 */
export async function connectDatabase(uri: string): Promise<void> {
  try {
    const { connection } = await mongoose.connect(uri);

    logger.info('database_connected', {
      host: connection.host,
      database: connection.name,
    });
  } catch (error) {
    logger.error('database_connection_failed', {
      phase: 'connect',
      error: serializeError(error, { stack: true }),
    });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
