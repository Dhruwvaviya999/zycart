import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadEnv, type Env } from '../src/config/env';
import { secretValues } from '../src/config/logging';
import { checkReadiness, formatReadiness } from '../src/config/readiness';
import { SERVICE_NAME, SERVICE_VERSION } from '../src/config/service';
import {
  aiStatus,
  buildHealthReport,
  emailStatus,
  healthHttpStatus,
  paymentsStatus,
} from '../src/services/health/health.service';
import { healthReportSchema, healthResponseSchema } from '../src/validators/health.validator';

/**
 * The health surface, and what it is allowed to say.
 *
 * Two questions run through every case below.
 *
 * **Does it tell the truth?** A health endpoint that reports `ok` while the
 * database is unreachable is worse than no health endpoint, because something
 * is now routing traffic on the strength of it. So the database check drives
 * the verdict, the verdict drives the HTTP status, and both are asserted in
 * both directions.
 *
 * **Does it give anything away?** It is unauthenticated and reachable by
 * anyone. The disclosure cases build reports from configurations holding
 * realistic-looking credentials and assert that none of them survives
 * serialisation — not in a field, not in a message, not in a status.
 *
 * What cannot be decided here is whether the probe itself is honest against a
 * real MongoDB. That needs one, and `pnpm health:verify` does it.
 */

/* ---------------------------------------------------------------- */
/* Configurations                                                    */
/* ---------------------------------------------------------------- */

/**
 * Credentials that look real and are not.
 *
 * Long enough to pass `loadEnv`'s own floors, and distinctive enough that a
 * substring search for them cannot match by accident.
 */
const SECRETS = {
  jwt: 'ZYCART-P16-TEST-JWT-SECRET-0123456789abcdef',
  mongo: 'mongodb://zycart-p16:ZYCART-P16-DB-PASSWORD@db.invalid:27017/zycart-p16',
  razorpaySecret: 'ZYCART-P16-RZP-KEY-SECRET-0001',
  webhookSecret: 'ZYCART-P16-RZP-WEBHOOK-SECRET-0001',
  smtpPassword: 'ZYCART-P16-SMTP-PASSWORD-0001',
  aiKey: 'ZYCART-P16-AI-API-KEY-000000000001',
} as const;

const BASE: Record<string, string> = {
  MONGODB_URI: SECRETS.mongo,
  JWT_SECRET: SECRETS.jwt,
  NODE_ENV: 'development',
  CLIENT_URL: 'http://localhost:3000',
  AI_ENABLED: 'false',
};

const env = (overrides: Record<string, string> = {}): Env =>
  loadEnv({ ...BASE, ...overrides });

const SMTP: Record<string, string> = {
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.example.invalid',
  SMTP_USER: 'zycart-p16@example.invalid',
  SMTP_PASSWORD: SECRETS.smtpPassword,
  EMAIL_FROM_ADDRESS: 'no-reply@example.invalid',
};

const RAZORPAY: Record<string, string> = {
  RAZORPAY_KEY_ID: 'rzp_test_ZYCARTP16TEST',
  RAZORPAY_KEY_SECRET: SECRETS.razorpaySecret,
  RAZORPAY_WEBHOOK_SECRET: SECRETS.webhookSecret,
};

/** A probe that answers without a database, so status rules can be tested. */
const probe = (status: 'ok' | 'unavailable') => () => Promise.resolve(status);

/* ---------------------------------------------------------------- */

describe('Health — the verdict', () => {
  it('is ok when the database answers', async () => {
    const report = await buildHealthReport(env(), { probe: probe('ok') });

    assert.equal(report.status, 'ok');
    assert.equal(report.checks.database, 'ok');
    assert.equal(healthHttpStatus(report), 200);
  });

  it('is unavailable when the database does not', async () => {
    const report = await buildHealthReport(env(), { probe: probe('unavailable') });

    assert.equal(report.status, 'unavailable');
    assert.equal(healthHttpStatus(report), 503);
  });

  it('still answers, with uptime, while the database is down', async () => {
    // The distinction the endpoint exists to express: the process is alive and
    // saying it is not ready. A 503 that carried nothing would be silence.
    const report = await buildHealthReport(env(), {
      probe: probe('unavailable'),
      uptimeSeconds: 42,
    });

    assert.equal(report.uptimeSeconds, 42);
    assert.equal(report.service, SERVICE_NAME);
    assert.equal(report.checks.email, 'mock');
  });

  it('does not let a deployment choice become an outage', async () => {
    // Mock mail, no gateway, no assistant. A cash-only store on a laptop —
    // reported accurately, and emphatically not a 503.
    const report = await buildHealthReport(env(), { probe: probe('ok') });

    assert.equal(report.checks.email, 'mock');
    assert.equal(report.checks.payments, 'not_configured');
    assert.equal(report.checks.ai, 'disabled');
    assert.equal(report.status, 'ok');
    assert.equal(healthHttpStatus(report), 200);
  });
});

/* ---------------------------------------------------------------- */

describe('Health — subsystem reporting', () => {
  it('reports mock mail as mock and SMTP as configured', () => {
    assert.equal(emailStatus(env()), 'mock');
    assert.equal(emailStatus(env(SMTP)), 'configured');
  });

  it('refuses to start at all on half-configured SMTP', () => {
    // Incomplete SMTP never reaches the health endpoint: `loadEnv` stops it.
    // Asserted here because the health contract depends on that being true —
    // there is no `email: "incomplete"` state, and there must not need to be.
    assert.throws(
      () => env({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.invalid' }),
      /SMTP_USER|SMTP_PASSWORD|EMAIL_FROM_ADDRESS/,
    );
  });

  it('reports payments only as configured or not', () => {
    assert.equal(paymentsStatus(env()), 'not_configured');
    assert.equal(paymentsStatus(env(RAZORPAY)), 'configured');
  });

  it('refuses to start on half-configured payments', () => {
    assert.throws(
      () => env({ RAZORPAY_KEY_ID: 'rzp_test_ZYCARTP16TEST' }),
      /RAZORPAY_KEY_SECRET/,
    );
  });

  it('tells an assistant that is off from one that is broken', () => {
    assert.equal(aiStatus(env({ AI_ENABLED: 'false' })), 'disabled');
    assert.equal(
      aiStatus(env({ AI_ENABLED: 'true', AI_PROVIDER: 'anthropic' })),
      'not_configured',
    );
    assert.equal(
      aiStatus(env({ AI_ENABLED: 'true', AI_PROVIDER: 'anthropic', AI_API_KEY: SECRETS.aiKey })),
      'configured',
    );
  });

  it('reports the version from the manifest, or null — never a guess', async () => {
    const report = await buildHealthReport(env(), { probe: probe('ok') });

    assert.equal(report.version, SERVICE_VERSION);
    assert.ok(report.version === null || /^\d+\.\d+\.\d+/.test(report.version));
  });
});

/* ---------------------------------------------------------------- */

describe('Health — the published schema', () => {
  it('matches, with no unexpected field, in every configuration', async () => {
    const configurations: Env[] = [
      env(),
      env(SMTP),
      env(RAZORPAY),
      env({ ...SMTP, ...RAZORPAY }),
      env({ ...SMTP, ...RAZORPAY, AI_ENABLED: 'true', AI_API_KEY: SECRETS.aiKey }),
    ];

    for (const configuration of configurations) {
      for (const database of ['ok', 'unavailable'] as const) {
        const report = await buildHealthReport(configuration, { probe: probe(database) });
        const parsed = healthReportSchema.safeParse(report);

        assert.ok(
          parsed.success,
          parsed.success
            ? ''
            : parsed.error.issues.map((issue) => issue.path.join('.')).join(', '),
        );
      }
    }
  });

  it('rejects a report carrying a field nobody reviewed', () => {
    // The point of `.strict()`. A field added to the report without being
    // considered fails here rather than being served to the internet.
    const parsed = healthReportSchema.safeParse({
      status: 'ok',
      service: 'zycart-api',
      version: '1.0.0',
      environment: 'development',
      uptimeSeconds: 1,
      timestamp: new Date().toISOString(),
      checks: { database: 'ok', email: 'mock', payments: 'not_configured', ai: 'disabled' },
      mongodbUri: SECRETS.mongo,
    });

    assert.equal(parsed.success, false);
  });

  it('validates the whole HTTP envelope the controller sends', async () => {
    const report = await buildHealthReport(env(), { probe: probe('ok') });

    const parsed = healthResponseSchema.safeParse({
      success: true,
      message: 'API is healthy',
      data: report,
    });

    assert.ok(parsed.success);
  });
});

/* ---------------------------------------------------------------- */

describe('Health — disclosure', () => {
  const fullyConfigured = (): Env =>
    env({ ...SMTP, ...RAZORPAY, AI_ENABLED: 'true', AI_API_KEY: SECRETS.aiKey });

  it('contains none of the configured secrets, in either state', async () => {
    const configuration = fullyConfigured();

    for (const database of ['ok', 'unavailable'] as const) {
      const report = await buildHealthReport(configuration, { probe: probe(database) });
      const serialised = JSON.stringify(report);

      for (const secret of Object.values(SECRETS)) {
        assert.equal(
          serialised.includes(secret),
          false,
          `a secret reached the health response with the database ${database}`,
        );
      }
    }
  });

  it('agrees with the redactor about what this process holds secret', async () => {
    const configuration = fullyConfigured();
    const serialised = JSON.stringify(
      await buildHealthReport(configuration, { probe: probe('ok') }),
    );

    // Derived from configuration rather than listed here, so a secret added to
    // the environment is covered by this test the day it is added.
    for (const secret of secretValues(configuration)) {
      assert.equal(serialised.includes(secret), false);
    }
  });

  it('names no host, no path, no stack and no key id', async () => {
    const serialised = JSON.stringify(
      await buildHealthReport(fullyConfigured(), { probe: probe('unavailable') }),
    );

    for (const fragment of [
      'smtp.example.invalid',
      'db.invalid',
      'rzp_test_',
      'mongodb://',
      'node_modules',
      'at Object.',
      'no-reply@example.invalid',
    ]) {
      assert.equal(serialised.includes(fragment), false, `"${fragment}" reached the response`);
    }
  });

  it('exposes no count of anything a competitor would want', async () => {
    const report = await buildHealthReport(env(), { probe: probe('ok') });

    // The field list is the whole disclosure surface, so it is asserted
    // exactly rather than sampled.
    assert.deepEqual(Object.keys(report).sort(), [
      'checks',
      'environment',
      'service',
      'status',
      'timestamp',
      'uptimeSeconds',
      'version',
    ]);
  });
});

/* ---------------------------------------------------------------- */

describe('Readiness — fitness for the environment', () => {
  const production = (overrides: Record<string, string> = {}): Env =>
    env({
      NODE_ENV: 'production',
      CLIENT_URL: 'https://zycart.example',
      ...SMTP,
      ...RAZORPAY,
      RAZORPAY_KEY_ID: 'rzp_live_ZYCARTP16LIVE',
      ...overrides,
    });

  it('passes a properly configured production deployment', () => {
    const report = checkReadiness(production());

    assert.equal(report.ok, true);
    assert.deepEqual(
      report.findings.filter((finding) => finding.severity === 'error'),
      [],
    );
  });

  it('refuses mock mail in production', () => {
    const report = checkReadiness(
      production({
        EMAIL_PROVIDER: 'mock',
        SMTP_HOST: '',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
      }),
    );

    assert.equal(report.ok, false);
    assert.ok(report.findings.some((finding) => finding.key === 'EMAIL_PROVIDER'));
  });

  it('refuses a localhost storefront in production', () => {
    const report = checkReadiness(production({ CLIENT_URL: 'http://localhost:3000' }));

    assert.equal(report.ok, false);
    assert.ok(
      report.findings.some(
        (finding) => finding.key === 'CLIENT_URL' && finding.severity === 'error',
      ),
    );
  });

  it('warns, but does not refuse, a cash-only production store', () => {
    const report = checkReadiness(
      production({ RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', RAZORPAY_WEBHOOK_SECRET: '' }),
    );

    // A real business, and not a misconfiguration — so it must not block a
    // deploy. It is still said out loud, because it is also how a store that
    // meant to take cards finds out that it cannot.
    assert.equal(report.ok, true);
    assert.ok(
      report.findings.some(
        (finding) => finding.key === 'RAZORPAY_KEY_ID' && finding.severity === 'warning',
      ),
    );
  });

  it('warns about text logs and plain http in production', () => {
    const report = checkReadiness(
      production({ LOG_FORMAT: 'text', CLIENT_URL: 'http://zycart.example' }),
    );

    const keys = report.findings.map((finding) => finding.key);
    assert.ok(keys.includes('LOG_FORMAT'));
    assert.ok(keys.includes('CLIENT_URL'));
    assert.equal(report.ok, true);
  });

  it('permits a development machine to be a development machine', () => {
    const report = checkReadiness(env());

    assert.equal(report.ok, true);
    assert.deepEqual(report.findings, []);
  });

  it('prints states and never values', () => {
    const configuration = production();
    const printed = formatReadiness(checkReadiness(configuration));

    for (const secret of secretValues(configuration)) {
      assert.equal(printed.includes(secret), false);
    }

    assert.equal(printed.includes('rzp_live_ZYCARTP16LIVE'), false);
    assert.match(printed, /Email\s+configured/);
    assert.match(printed, /Payments\s+configured \(live\)/);
  });

  it('reports mock mail and missing payments as states, not values', () => {
    const { summary } = checkReadiness(env());

    assert.equal(summary.Email, 'mock');
    assert.equal(summary.Payments, 'not configured');
    assert.equal(summary.Database, 'configured');
    assert.equal(summary.Environment, 'development');
  });
});
