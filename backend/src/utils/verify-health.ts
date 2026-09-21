import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { loadEnv, type Env } from '../config/env';
import { configureObservability, secretValues } from '../config/logging';
import { checkReadiness } from '../config/readiness';
import {
  buildHealthReport,
  healthHttpStatus,
  pingDatabase,
} from '../services/health/health.service';
import { healthReportSchema } from '../validators/health.validator';

/**
 * Exercises the health surface against a real MongoDB.
 *
 * ## Why this exists alongside `tests/health.test.ts`
 *
 * The unit suite covers everything decidable without a database: the status
 * rules, the schema, the configuration checks, the disclosure assertion against
 * a constructed report. It cannot cover the one thing the endpoint is *for* —
 * whether the readiness probe tells the truth about a database that is really
 * there, and really not there.
 *
 * So this connects to the configured replica set and asks three questions the
 * unit suite cannot:
 *
 *  1. Does the probe say `ok` against a live connection, and quickly?
 *  2. Does it say `unavailable` once the connection is closed — rather than
 *     reporting the driver's last known belief?
 *  3. Does a report built with this deployment's *real* credentials loaded
 *     contain any of them?
 *
 * The third is the one that could not be faked. `tests/health.test.ts` asserts
 * it with synthetic secrets; this asserts it with the actual `JWT_SECRET`,
 * `MONGODB_URI` and Razorpay values of whatever machine it runs on.
 *
 * ## Safety
 *
 * This script **writes nothing**. It creates no document, no collection and no
 * index; it issues one `ping` admin command and reads no data at all. There is
 * no fixture to clean up because there is no fixture, and there is no
 * `deleteMany`, `dropDatabase`, `dropCollection` or `syncIndexes` anywhere in
 * it. It is the only verification script in the repository that is entirely
 * read-only, and it is safe to point at production.
 *
 *   pnpm health:verify
 */

let passed = 0;
let failed = 0;

function check(description: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${description}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

async function verifyProbeWhenConnected(): Promise<void> {
  console.log('\nReadiness probe, connected');

  const startedAt = Date.now();
  const status = await pingDatabase();
  const elapsed = Date.now() - startedAt;

  check('the probe reports ok against a live connection', status === 'ok', status);

  /**
   * A health check is polled every few seconds forever. One that costs a
   * hundred milliseconds is one that will eventually be blamed for load — and
   * a `ping` that is slow is itself a finding about the database.
   */
  check(`the probe costs under 250ms (took ${String(elapsed)}ms)`, elapsed < 250);

  check('readyState is connected', mongoose.connection.readyState === 1);
}

async function verifyReportWhenConnected(env: Env): Promise<void> {
  console.log('\nReport, connected');

  const report = await buildHealthReport(env);

  check('status is ok', report.status === 'ok', report.status);
  check('the database check is ok', report.checks.database === 'ok');
  check('the HTTP status is 200', healthHttpStatus(report) === 200);

  const parsed = healthReportSchema.safeParse(report);

  check(
    'the report matches the published schema, with no unexpected field',
    parsed.success,
    parsed.success
      ? undefined
      : parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; '),
  );

  check(
    'the reported email provider matches configuration',
    report.checks.email === (env.EMAIL_PROVIDER === 'smtp' ? 'configured' : 'mock'),
    report.checks.email,
  );

  /**
   * The real test, with the real values.
   *
   * Serialising the whole report and searching it for this deployment's actual
   * secrets is a blunt instrument, and that is the point: it does not depend on
   * knowing which field might carry one.
   */
  const serialised = JSON.stringify(report);
  const secrets = secretValues(env);

  check(
    `none of the ${String(secrets.length)} configured secret values appear in the report`,
    !secrets.some((secret) => serialised.includes(secret)),
    'a value was found — it is deliberately not printed',
  );

  check(
    'the connection string does not appear in the report',
    !serialised.includes(env.MONGODB_URI),
  );

  check(
    'no field names a host, a path or a stack',
    !/mongodb\+srv|\/home\/|[A-Z]:\\\\|at Object\./.test(serialised),
  );
}

async function verifyProbeWhenDisconnected(env: Env): Promise<void> {
  console.log('\nReadiness probe, database unreachable');

  await disconnectDatabase();

  const status = await pingDatabase();

  check('the probe reports unavailable once disconnected', status === 'unavailable', status);

  const report = await buildHealthReport(env);

  check('status is unavailable', report.status === 'unavailable', report.status);
  check('the HTTP status is 503', healthHttpStatus(report) === 503);

  /**
   * The distinction Phase 16 is built on: the process is alive and answering,
   * and it is saying that it is not ready. A health endpoint that could not
   * express that would either lie or stop replying.
   */
  check('the process is still reporting uptime', report.uptimeSeconds >= 0);
  check(
    'configuration checks still answer with the database down',
    report.checks.payments === (env.RAZORPAY_KEY_ID ? 'configured' : 'not_configured'),
  );

  check('the report still matches the schema', healthReportSchema.safeParse(report).success);
}

function verifyReadiness(env: Env): void {
  console.log('\nConfiguration readiness');

  const report = checkReadiness(env);

  check('a readiness verdict was produced', typeof report.ok === 'boolean');
  check('the environment is reported', report.environment === env.NODE_ENV);

  const serialised = JSON.stringify(report);
  const secrets = secretValues(env);

  check(
    'no configured secret appears in the readiness report',
    !secrets.some((secret) => serialised.includes(secret)),
  );

  for (const finding of report.findings) {
    console.log(`  note  ${finding.severity}: ${finding.key} — ${finding.message}`);
  }
}

async function main(): Promise<void> {
  const env = loadEnv();

  // So the two lines this script's own dependencies log are formatted for the
  // person running it, rather than as JSON in the middle of a report.
  configureObservability(env);

  console.log('\nPhase 16 · health and readiness verification');
  console.log('Writes:   none — this script creates and modifies nothing');

  await connectDatabase(env.MONGODB_URI);

  console.log(`Database: ${mongoose.connection.name}`);

  try {
    await verifyProbeWhenConnected();
    await verifyReportWhenConnected(env);
    verifyReadiness(env);
    // Last, because it closes the connection everything above needs.
    await verifyProbeWhenDisconnected(env);
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }

  console.log(`\n${String(passed)} passed, ${String(failed)} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
