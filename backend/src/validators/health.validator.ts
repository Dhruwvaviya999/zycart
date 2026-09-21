import { z } from 'zod';

/**
 * The health response, as a schema.
 *
 * ## Why a health endpoint needs one
 *
 * Because everything that reads it is something ZyCart cannot change. A load
 * balancer's check, a container runtime's probe, an uptime monitor, the deploy
 * smoke command — each is configured once and then trusted forever, and a
 * quietly renamed field breaks all of them at the moment nobody is looking at
 * the health endpoint. A schema turns that from a silent breakage into a failed
 * test.
 *
 * ## `.strict()`, and what it buys
 *
 * More than shape. An unexpected field is a **test failure**, which means a
 * field added to the health report without being considered cannot ship. That
 * is the property worth having here: this endpoint is unauthenticated, and the
 * cost of an accidental field on it is disclosure to anyone on the internet.
 *
 * `tests/health.test.ts` parses real reports against this, and separately
 * asserts that a serialised report contains none of the configured secrets.
 * The two together are what make "it leaks nothing" a checked claim rather than
 * an intention.
 */
export const healthChecksSchema = z
  .object({
    database: z.enum(['ok', 'unavailable']),
    email: z.enum(['configured', 'mock']),
    payments: z.enum(['configured', 'not_configured']),
    ai: z.enum(['configured', 'disabled', 'not_configured']),
  })
  .strict();

export const healthReportSchema = z
  .object({
    status: z.enum(['ok', 'unavailable']),
    service: z.literal('zycart-api'),
    // Nullable rather than optional: the field is always present, and `null`
    // is the honest answer when the manifest could not be read.
    version: z.string().min(1).nullable(),
    environment: z.enum(['development', 'test', 'production']),
    uptimeSeconds: z.number().int().nonnegative(),
    timestamp: z.iso.datetime(),
    checks: healthChecksSchema,
  })
  .strict();

/** The whole envelope, as a caller over HTTP sees it. */
export const healthResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string().min(1),
    data: healthReportSchema,
  })
  .strict();

export type HealthResponseBody = z.infer<typeof healthResponseSchema>;
