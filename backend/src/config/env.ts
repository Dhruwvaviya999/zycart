import { z } from 'zod';

const envSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(5000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    MONGODB_URI: z
      .string({ error: 'is required - set it in backend/.env (no default is assumed)' })
      .min(1),
    /**
     * The storefront's own origin.
     *
     * Two jobs, deliberately one variable. It is the origin CORS admits, and
     * from Phase 14 it is also the origin every link in a transactional email
     * is built from. Those are the same fact about a deployment, and splitting
     * them into `CLIENT_URL` and a second `APP_URL` would create a pair that
     * can disagree - at which point an email would link somewhere CORS refuses,
     * or the reverse, and neither failure would show up until a customer hit
     * it.
     *
     * Validated as an absolute http(s) URL rather than merely non-empty,
     * because a malformed value here now produces broken links in mail nobody
     * can un-send. Email links are never built from a request's `Host` or
     * `X-Forwarded-Host`: see `appOrigin` in `config/notifications.ts`.
     */
    CLIENT_URL: z
      .string()
      .min(1)
      .refine((value) => {
        try {
          const url = new URL(value);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      }, 'must be an absolute http:// or https:// address, for example https://zycart.example')
      .default('http://localhost:3000'),

    /**
     * Observability (Phase 16). None of it is a credential, and none of it
     * changes what ZyCart does — only what it says about what it did.
     *
     * `LOG_LEVEL` is the one an operator reaches for during an incident.
     * `debug` adds per-request health checks and provider detail; it is not a
     * secret-revealing mode, because there is no such mode: redaction runs
     * identically at every level.
     */
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    /**
     * Left undefined on purpose, exactly as `AI_MODEL` is. The right default
     * differs by environment — JSON where something parses it, aligned text
     * where a person reads it — and a single literal here would force one of
     * those two to be wrong. `resolveLogFormat` decides it.
     */
    LOG_FORMAT: z.enum(['json', 'text']).optional(),

    /**
     * When a request stops being ordinary.
     *
     * One threshold, in one place, read by the request logger and by nothing
     * else. Above it a completed request is logged at WARN rather than INFO —
     * the request still succeeded, and the log still says so; it is the
     * duration that is being reported, not a failure.
     *
     * A second below the default is already slow for this catalogue. The floor
     * of 50ms exists because a threshold lower than that would mark every cold
     * database round-trip as an anomaly and train an operator to ignore the
     * warning.
     */
    SLOW_REQUEST_MS: z.coerce.number().int().min(50).max(60_000).default(1_000),

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
    AI_PROVIDER: z.enum(['anthropic', 'gemini', 'mock']).default('anthropic'),
    AI_API_KEY: z.string().min(20, 'looks too short to be an API key').optional(),
    /**
     * Left undefined on purpose. Each provider has a different default model,
     * and a single literal default here would mean switching `AI_PROVIDER`
     * silently asked one vendor for another vendor's model id. `aiConfig`
     * resolves it instead.
     */
    AI_MODEL: z.string().trim().min(3).optional(),

    /** How long one model call may take before the assistant gives up on it. */
    AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(30_000),

    /** Requests per minute, counted per IP for guests and per account otherwise. */
    AI_RATE_LIMIT_GUEST: z.coerce.number().int().min(1).max(1_000).default(10),
    AI_RATE_LIMIT_USER: z.coerce.number().int().min(1).max(1_000).default(30),

    /**
     * Transactional email (Phase 14). Server-only, every one of them.
     *
     * `SMTP_PASSWORD` in particular must never be published to the browser:
     * mail leaves from Express and nowhere else, so there is no NEXT_PUBLIC_
     * counterpart to anything below and there never should be. Nothing here is
     * printed at startup except the provider name and the sender address - the
     * two values a customer would see anyway.
     */
    EMAIL_PROVIDER: z.enum(['mock', 'smtp']).default('mock'),

    /** The display name on the From header. Never a person's name. */
    EMAIL_FROM_NAME: z.string().trim().min(1).max(60).default('ZyCart'),

    /**
     * Optional for the mock provider, required for SMTP - see the refinement
     * below. There is deliberately no default address: a hardcoded fallback is
     * how a developer's own mailbox ends up in the From header of production
     * mail.
     */
    EMAIL_FROM_ADDRESS: z.email('must be a valid email address').max(254).optional(),

    /**
     * Where replies go, when the store has somewhere for them to go.
     *
     * Left unset unless a real, monitored support address exists. A Reply-To
     * pointing at an unread mailbox is worse than none: it invites a customer
     * to answer a message nobody will read.
     */
    EMAIL_REPLY_TO: z.email('must be a valid email address').max(254).optional(),

    SMTP_HOST: z.string().trim().min(1).max(253).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    SMTP_USER: z.string().trim().min(1).max(320).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    /** Implicit TLS on connect (port 465). Port 587 upgrades with STARTTLS. */
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
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
  })
  /**
   * Half-configured mail is the dangerous state, exactly as half-configured
   * payments is.
   *
   * `EMAIL_PROVIDER=smtp` is a promise that messages will actually be
   * delivered. A deployment that makes that promise with no host, no
   * credentials and no sender address would build a transport that throws on
   * every send, and every transactional email would be recorded as FAILED
   * until somebody noticed. Refusing to boot surfaces it before a customer is
   * owed a message nobody sent.
   *
   * The mock provider needs none of this, which is why the requirement is
   * conditional rather than a blanket one: a contributor with no mail server
   * can still run the whole of ZyCart.
   */
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER !== 'smtp') return;

    const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM_ADDRESS'] as const;

    for (const key of required) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message:
            'is required when EMAIL_PROVIDER=smtp - set it, or use EMAIL_PROVIDER=mock to run ' +
            'without a mail server',
        });
      }
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
