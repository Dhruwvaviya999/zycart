import mongoose from 'mongoose';

/**
 * Opens the Mongoose connection. The URI is never logged, since it may
 * carry credentials; only the resolved host and database name are shown.
 */
export async function connectDatabase(uri: string): Promise<void> {
  try {
    const { connection } = await mongoose.connect(uri);
    console.log(`MongoDB connected: ${connection.host}/${connection.name}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`MongoDB connection failed: ${reason}`);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
