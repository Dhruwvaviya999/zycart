import { z } from 'zod';

const envSchema = z
  .object({
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

    /**
     * Razorpay. Optional as a group, mandatory as a set — see the refinement
     * below. All three are server-only: the key id is additionally published to
     * the browser as NEXT_PUBLIC_RAZORPAY_KEY_ID, but the two secrets must never
     * leave this process.
     */
    RAZORPAY_KEY_ID: z
      .string()
      .regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, 'must look like rzp_test_... or rzp_live_...')
      .optional(),
    RAZORPAY_KEY_SECRET: z
      .string()
      .min(16, 'looks too short to be a Razorpay key secret')
      .optional(),
    RAZORPAY_WEBHOOK_SECRET: z
      .string()
      .min(8, 'must match the secret configured on the Razorpay webhook')
      .optional(),

    /**
     * ZyCart AI (Phase 10). Server-only, every one of them.
     *
     * `AI_API_KEY` in particular must never be published to the browser: the
     * assistant talks to the provider from Express and nowhere else, so there
     * is no NEXT_PUBLIC_ counterpart to any of these and never should be.
     */
    AI_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    AI_PROVIDER: z.enum(['anthropic', 'mock']).default('anthropic'),
    AI_API_KEY: z.string().min(20, 'looks too short to be an API key').optional(),
    AI_MODEL: z.string().trim().min(3).default('claude-opus-5'),

    /** How long one model call may take before the assistant gives up on it. */
    AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),

    /** Requests per minute, counted per IP for guests and per account otherwise. */
    AI_RATE_LIMIT_GUEST: z.coerce.number().int().min(1).max(1_000).default(10),
    AI_RATE_LIMIT_USER: z.coerce.number().int().min(1).max(1_000).default(30),
  })
  /**
   * The mock provider answers from a fixed script. It exists so tool and
   * business-rule tests never need credentials, and so a contributor without an
   * API key can still exercise the UI.
   *
   * In production it would be an assistant that looks real and is not, quoting
   * scripted text over live catalogue data. That is worse than no assistant at
   * all, so it stops the process rather than reaching a customer.
   */
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === 'mock' && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_PROVIDER'],
        message:
          'is "mock", which returns scripted replies - it must not be used in production. Set AI_PROVIDER=anthropic, or AI_ENABLED=false to run without the assistant',
      });
    }
  })
  /**
   * Half-configured payments is the dangerous state, so it is the one that stops
   * startup.
   *
   * A key id with no secret would let the server create Razorpay orders it can
   * never verify; a missing webhook secret would leave the recovery path for
   * lost browser callbacks silently dead. Either way the failure would surface
   * only once a real customer was mid-payment. Refusing to boot surfaces it now.
   *
   * Configuring none of the three is a legitimate deployment — cash on delivery
   * only — and is reported at startup rather than passed over in silence.
   */
  .superRefine((env, ctx) => {
    const keys = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] as const;
    const missing = keys.filter((key) => !env[key]);

    if (missing.length === 0 || missing.length === keys.length) return;

    for (const key of missing) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message:
          'is required once any Razorpay variable is set - configure all three, or none of them to run cash-on-delivery only',
      });
    }
  })
  /**
   * A live key in a development build is almost always a mistake, and the cost
   * of the mistake is real money moving. Test keys in production are the
   * mirror-image mistake: real customers paying into a sandbox.
   */
  .superRefine((env, ctx) => {
    if (!env.RAZORPAY_KEY_ID) return;

    const isLive = env.RAZORPAY_KEY_ID.startsWith('rzp_live_');

    if (isLive && env.NODE_ENV !== 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_ID'],
        message: `is a live key but NODE_ENV is "${env.NODE_ENV}" - use a rzp_test_ key outside production`,
      });
    }

    if (!isLive && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['RAZORPAY_KEY_ID'],
        message:
          'is a test key but NODE_ENV is "production" - real payments would not be collected',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Narrowed to the shape the payment code needs: all three present, none optional. */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

/**
 * The Razorpay credentials, or null when this deployment takes cash only.
 *
 * Callers that need the credentials must go through here rather than reading
 * the optional fields, which is what keeps "is online payment configured?" a
 * single decision made in one place.
 */
export function razorpayConfig(env: Env): RazorpayConfig | null {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) {
    return null;
  }

  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  };
}

export const isRazorpayConfigured = (env: Env): boolean => razorpayConfig(env) !== null;

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
