import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z
    .string({ error: 'is required - set it in backend/.env (no default is assumed)' })
    .min(1),
  CLIENT_URL: z.string().min(1).default('http://localhost:3000'),

  // Authentication is always on from Phase 4, so the secret is required. A short
  // one is worse than no auth at all, hence the length floor rather than min(1).
  JWT_SECRET: z
    .string({ error: 'is required - set it in backend/.env (use a long random value)' })
    .min(32, 'must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().min(2).default('7d'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * `KEY=` in a .env file yields an empty string, which would otherwise satisfy
 * "present" and defeat both defaults and optionality. Treat blank as unset.
 */
function withoutBlanks(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => {
      const [, value] = entry;
      return typeof value === 'string' && value.trim() !== '';
    }),
  );
}

/**
 * Validates process.env against the schema.
 * Throws with a readable summary so startup fails loudly instead of
 * running with a half-configured server.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(withoutBlanks(source));

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
