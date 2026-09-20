/**
 * The deployment smoke command's surface: what it accepts, and how it reports.
 *
 * Separate from `utils/smoke-deploy.ts` for the same reason `drain-cli.ts` is
 * separate from `drain-notifications.ts` — that file runs `main()` on import,
 * so importing it from a test would spawn builds as a side effect of reading an
 * argument parser. Everything here is pure, and everything here is tested.
 */

/** The default port the smoke server listens on. Not the configured PORT; see SMOKE_USAGE. */
export const DEFAULT_SMOKE_PORT = 5055;

/** How long the compiled server has to answer a health check before it fails. */
export const DEFAULT_STARTUP_TIMEOUT_MS = 45_000;

/** Raised for an argument this command will not act on. */
export class SmokeUsageError extends Error {}

export interface SmokeArgs {
  port: number;
  startupTimeoutMs: number;
  /** Skip `next build`. Weakens the verdict, and the summary says so. */
  skipFrontend: boolean;
  /** Also run the unit suite. Off by default; see the usage text. */
  withTests: boolean;
  /** Configuration only. Builds nothing, starts nothing, proves nothing else. */
  dryRun: boolean;
  help: boolean;
}

export const SMOKE_USAGE = `
ZyCart — deployment smoke

  Answers one question: can this exact production build start, reach its
  database, and serve the catalogue?

Usage
  pnpm smoke:deploy [options]

Options
  --skip-frontend        Do not run 'next build'. Faster, and a weaker verdict.
  --with-tests           Also run the backend unit suite before building.
  --port <n>             Port for the temporary server. Default ${String(DEFAULT_SMOKE_PORT)}.
  --startup-timeout <ms> How long the server has to become healthy.
                         Default ${String(DEFAULT_STARTUP_TIMEOUT_MS)}.
  --dry-run              Validate configuration and stop. See below.
  --help, -h             This text.

Stages
  1  Configuration   Environment variables load, and suit this NODE_ENV
  2  Typecheck       Both applications
  3  Lint            Both applications
  4  Unit tests      Only with --with-tests
  5  Clean           Remove backend/dist and frontend/.next
  6  Backend build   tsc -> dist/
  7  Frontend build  next build
  8  Server startup  node dist/server.js, on the smoke port
  9  Health          GET /api/health returns 200 and status "ok"
  10 Read-only API   Catalogue endpoints answer, and answer with data

  A stage that fails stops the ones that depend on it. Nothing is built after a
  failed typecheck, no server is started after a failed build, and no API call
  is made against a server that never became healthy.

What it does NOT do
  It does not prove the deployment works. It proves it can start.

  No order is placed, no stock moves, no return is approved and no shipment is
  touched. No email is sent — pending notifications are left exactly where they
  are, and this command never drains them. No payment and no refund is made,
  and no request reaches Razorpay. Nothing is written to the database: every
  call is a GET against a public catalogue endpoint.

  It does not check that live SMTP accepts mail, that the gateway accepts a
  card, or that any customer journey completes. It reports configuration for
  those, and configuration is not delivery.

Clean
  The previous build output is removed before building, because a deployment
  builds from a clean checkout and a run that reuses a local cache is not
  reproducing it. Only 'backend/dist' and 'frontend/.next' are removed - both
  are gitignored build output, and both are rebuilt by the next two stages.
  Nothing else on disk is touched.

The temporary server
  Started on port ${String(DEFAULT_SMOKE_PORT)} rather than the configured PORT, so a running
  'pnpm dev' is neither disturbed nor mistaken for the build under test. If the
  port is already in use the run fails and says so; it never terminates a
  process it did not start.

  It connects to the database in MONGODB_URI — the real one, if that is what is
  configured. It only reads.

--dry-run
  Stage 1 alone. It loads and validates configuration and reports whether it
  suits this environment. It builds nothing, starts nothing and calls nothing,
  and its summary says exactly that. A passing dry run is not a passing smoke.

Exit codes
  0   every stage that ran, passed
  1   a stage failed, or the arguments were wrong

Configuration
  Read from backend/.env, exactly as the server reads it. No value is printed
  by this command, in any mode — only states such as "configured" and "mock".
`.trim();

/**
 * Reads the command line, strictly.
 *
 * An unrecognised flag stops the run rather than being ignored, for the reason
 * `parseDrainArgs` gives: a CI step with a typo in it is a CI step that has
 * silently been doing something other than what it says. Here it is worse —
 * `--skip-frontent` ignored would mean a deploy gate that quietly stopped
 * checking half of what it claims to.
 */
export function parseSmokeArgs(argv: readonly string[]): SmokeArgs {
  const parsed: SmokeArgs = {
    port: DEFAULT_SMOKE_PORT,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
    skipFrontend: false,
    withTests: false,
    dryRun: false,
    help: false,
  };

  const numeric = (
    value: string | undefined,
    flag: string,
    min: number,
    max: number,
  ): number => {
    if (value === undefined) throw new SmokeUsageError(`${flag} needs a number`);

    const parsedValue = Number(value);

    if (!Number.isInteger(parsedValue) || parsedValue < min || parsedValue > max) {
      throw new SmokeUsageError(
        `${flag} must be a whole number between ${String(min)} and ${String(max)}`,
      );
    }

    return parsedValue;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--help':
      case '-h':
        parsed.help = true;
        break;

      case '--skip-frontend':
        parsed.skipFrontend = true;
        break;

      case '--with-tests':
        parsed.withTests = true;
        break;

      case '--dry-run':
        parsed.dryRun = true;
        break;

      case '--port':
        // Above 1024 because a smoke run must never need privileges, and
        // asking for one below it is a mistake rather than an intention.
        parsed.port = numeric(argv[index + 1], '--port', 1_025, 65_535);
        index += 1;
        break;

      case '--startup-timeout':
        parsed.startupTimeoutMs = numeric(
          argv[index + 1],
          '--startup-timeout',
          1_000,
          600_000,
        );
        index += 1;
        break;

      default:
        throw new SmokeUsageError(`unrecognised option "${String(arg)}"`);
    }
  }

  return parsed;
}

/* ------------------------------------------------------------------ */
/* Reporting                                                            */
/* ------------------------------------------------------------------ */

export type StageStatus = 'PASS' | 'FAIL' | 'SKIP';

export interface StageResult {
  name: string;
  status: StageStatus;
  durationMs: number;
  /** One line. On a failure, why; on a skip, why it was not run. */
  detail?: string;
}

export interface SmokeReport {
  stages: StageResult[];
  dryRun: boolean;
  /** True only when no stage failed and at least one stage ran. */
  passed: boolean;
}

/**
 * One stage, as it is printed the moment it finishes.
 *
 * A detail may be many lines — the tail of a failed build is the most useful
 * thing this command ever prints — so every line of it is indented, not just
 * the first. A report whose continuation lines fall back to column zero reads
 * as though the command stopped reporting and something else started talking.
 */
export function formatStageLine(stage: StageResult): string {
  const head = `[${stage.status}] ${stage.name}`;
  if (!stage.detail) return head;

  const body = stage.detail
    .split('\n')
    .map((line) => `       ${line}`)
    .join('\n');

  return `${head}\n${body}`;
}

const duration = (ms: number): string =>
  ms >= 1_000 ? `${(ms / 1_000).toFixed(1)}s` : `${String(Math.round(ms))}ms`;

/**
 * The run, as it goes into a CI log or a deploy ticket.
 *
 * ## Why the verdict is worded the way it is
 *
 * `READY` would be a lie, and a specific one: it would claim something about
 * production that a local process starting and answering four GETs cannot
 * establish. The verdict is about the *smoke*, which is what actually ran —
 * and the line beneath it names what was not covered, every time, including
 * when everything passed. A gate that overstates itself is a gate people stop
 * reading.
 */
export function formatSmokeSummary(report: SmokeReport): string {
  const width = Math.max(...report.stages.map((stage) => stage.name.length), 16);

  const lines = ['', 'ZyCart deployment smoke', ''];

  for (const stage of report.stages) {
    const timing = stage.status === 'SKIP' ? '' : `  ${duration(stage.durationMs)}`;
    lines.push(`  ${stage.name.padEnd(width)}  ${stage.status.padEnd(4)}${timing}`);
  }

  lines.push('');

  if (report.dryRun) {
    lines.push('Result: CONFIGURATION OK — nothing was built, started or called.');
    lines.push('A dry run is not a smoke. Run without --dry-run before deploying.');
    return lines.join('\n');
  }

  if (!report.passed) {
    const failed = report.stages.find((stage) => stage.status === 'FAIL');

    lines.push(`Result: FAILED at ${failed?.name ?? 'an unknown stage'}`);

    // The first line only. The whole detail — which for a failed build is
    // forty lines of compiler output — was printed above when the stage
    // finished, and repeating it here would bury the verdict it is meant to
    // explain.
    const reason = failed?.detail?.split('\n')[0];
    if (reason) lines.push(reason);

    return lines.join('\n');
  }

  lines.push('Result: DEPLOYMENT SMOKE PASSED');
  lines.push('');
  lines.push('This build starts, reaches its database and serves the catalogue.');
  lines.push('It does not prove that mail is delivered, that a payment can be');
  lines.push('taken, or that any customer journey completes end to end.');

  const skipped = report.stages.filter((stage) => stage.status === 'SKIP');

  if (skipped.length > 0) {
    lines.push('');
    lines.push(`Not run: ${skipped.map((stage) => stage.name).join(', ')}.`);
  }

  return lines.join('\n');
}

/** 0 when everything that ran passed, 1 otherwise. Nothing else is needed. */
export const smokeExitCode = (report: SmokeReport): 0 | 1 => (report.passed ? 0 : 1);

/* ------------------------------------------------------------------ */
/* The read-only API checks                                            */
/* ------------------------------------------------------------------ */

export interface ApiCheck {
  name: string;
  /** A GET path on the running server. Every one is public and read-only. */
  path: string;
  /** Returns a sentence describing the problem, or null when acceptable. */
  verify: (json: unknown) => string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

/**
 * An envelope carrying an array, which is what every catalogue list returns.
 *
 * ## Why an empty array passes
 *
 * A store whose catalogue has not been seeded is nonetheless serving
 * correctly, and failing a deploy over it would be a gate reporting on data
 * rather than on the build. The count is reported in the stage detail instead,
 * so an empty catalogue is visible without being fatal.
 *
 * What is *not* tolerated is a response that is not the shape this API
 * promises. `success: false`, a missing `data`, or an object where an array
 * belongs means something is answering that is not ZyCart — a proxy error
 * page, a cached 200 from a CDN, a half-migrated deployment.
 */
export function expectList(json: unknown): string | null {
  const body = asRecord(json);

  if (!body) return 'the response was not an object';
  if (body.success !== true) return 'the response did not report success';
  if (!Array.isArray(body.data)) return 'the response carried no array of results';

  return null;
}

/** How many results a list response carried, for the stage detail. */
export function listCount(json: unknown): number {
  const body = asRecord(json);
  return Array.isArray(body?.data) ? body.data.length : 0;
}

/**
 * The endpoints one smoke run calls, and the only ones it may.
 *
 * Every entry is a GET, unauthenticated, and reads the catalogue. There is no
 * entry here that creates an order, moves stock, sends a message or touches a
 * customer — and there is no helper in `smoke.ts` capable of a request that
 * would. The list is asserted exactly in `tests/smoke.test.ts`, so it cannot
 * quietly grow a write.
 */
export const API_CHECKS: readonly ApiCheck[] = [
  { name: 'products', path: '/api/products?limit=2', verify: expectList },
  { name: 'categories', path: '/api/categories', verify: expectList },
  { name: 'brands', path: '/api/brands', verify: expectList },
  { name: 'featured products', path: '/api/products/featured', verify: expectList },
];

/* ------------------------------------------------------------------ */
/* Stage bookkeeping                                                    */
/* ------------------------------------------------------------------ */

/** What one stage does, and why it passed or failed. */
export interface StageOutcome {
  ok: boolean;
  /** One line. On a failure, the reason; on a pass, anything worth seeing. */
  detail?: string;
}

/**
 * Runs the stages in order and stops the ones that depended on a failure.
 *
 * ## Why the dependency rule lives here
 *
 * "A failed build starts no server" is the property that keeps this command
 * safe and quick, and it is the sort of property that decays into six
 * `if (!failed)` guards, one of which is eventually written the other way
 * round. It is one rule, in one place, applied to every stage — so a stage
 * added later inherits it without its author having to know it exists.
 *
 * ## Why a thrown stage is a failed stage
 *
 * `loadEnv` throws. A `fetch` to a server that died mid-run throws. Neither is
 * allowed to take the process down, because the process still has to stop the
 * temporary server and print the summary. A stage that throws is recorded with
 * its message as the detail and the run continues to its cleanup.
 */
export class StageRunner {
  readonly stages: StageResult[] = [];

  /** Set by the first failure, and never cleared. */
  private failed = false;

  constructor(private readonly emit: (line: string) => void) {}

  async run(name: string, work: () => Promise<StageOutcome>): Promise<boolean> {
    if (this.failed) {
      this.record({ name, status: 'SKIP', durationMs: 0, detail: 'an earlier stage failed' });
      return false;
    }

    const startedAt = Date.now();

    try {
      const { ok, detail } = await work();

      this.record({
        name,
        status: ok ? 'PASS' : 'FAIL',
        durationMs: Date.now() - startedAt,
        detail,
      });

      if (!ok) this.failed = true;
      return ok;
    } catch (error) {
      this.record({
        name,
        status: 'FAIL',
        durationMs: Date.now() - startedAt,
        detail: error instanceof Error ? error.message : String(error),
      });

      this.failed = true;
      return false;
    }
  }

  skip(name: string, detail: string): void {
    this.record({ name, status: 'SKIP', durationMs: 0, detail });
  }

  private record(stage: StageResult): void {
    this.stages.push(stage);
    this.emit(formatStageLine(stage));
  }

  report(dryRun: boolean): SmokeReport {
    const ran = this.stages.some((stage) => stage.status !== 'SKIP');
    const anyFailed = this.stages.some((stage) => stage.status === 'FAIL');

    return { stages: this.stages, dryRun, passed: ran && !anyFailed };
  }
}
