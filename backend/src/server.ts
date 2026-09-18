import 'dotenv/config';
import { connectDatabase } from './config/database';
import { loadEnv } from './config/env';
import { createApp } from './app';

async function bootstrap(): Promise<void> {
  const env = loadEnv();

  await connectDatabase(env.MONGODB_URI);

  const app = createApp(env);

  app.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    console.log(`Health check: http://localhost:${env.PORT}/api/health`);
    console.log(`CORS origin: ${env.CLIENT_URL}`);
  });
}

bootstrap().catch((error: unknown) => {
  console.error(`Startup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
