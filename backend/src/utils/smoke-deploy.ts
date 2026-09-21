import 'dotenv/config';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv, type Env } from '../config/env';
import { checkReadiness, formatReadiness } from '../config/readiness';
import { secretValues } from '../config/logging';
import {
  buildEnvironment,
  cleanBuildOutput,
  getJson,
  isPortAvailable,
  repositoryRoot,
  runCommand,
  startSmokeServer,
  waitForHealth,
  type SmokeServer,
} from '../services/deploy/smoke';
import {
  API_CHECKS,
  formatSmokeSummary,
  listCount,
  parseSmokeArgs,
  smokeExitCode,
  SMOKE_USAGE,
  SmokeUsageError,
  StageRunner,
} from '../services/deploy/smoke-cli';
import { healthResponseSchema } from '../validators/health.validator';

/**
 * `pnpm smoke:deploy` — the last thing run before a deployment.
 *
 * ## What it is for
 *
 * There is a category of failure that only appears in a production build: a
 * type that `tsx` tolerated, an import that resolves in development and not
 * from `dist/`, a required environment variable nobody set, a `next build` that
 * fails on a page never visited in dev. None of it is caught by the unit suite,
 * because the unit suite does not build anything and does not start anything.
 *
 * This builds both applications the way a deployment builds them, starts the
 * compiled server the way a deployment starts it, and asks it four questions.
 * That is the whole claim, and `formatSmokeSummary` states its limits in the
 * same breath as its verdict.
 *
 * ## What it must never become
 *
 * A test suite that happens to need a server. Every stage here is either a
 * build, a start, or a GET. Nothing writes. The moment a deploy gate can place
 * an order or send an email, running it becomes a decision rather than a habit
 * — and a gate nobody runs protects nothing.
 *
 * ## Why the CLI output is not structured
 *
 * `logger` exists for the running application. This is a command a person
 * watches, and its reader wants stage lines and a summary, not one JSON object
 * per stage. Mixing the two would mean a deploy log that is half prose and half
 * records and readable as neither. See `docs/phase-16.md`.
 */

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

/* ------------------------------------------------------------------ */
/* Read-only API checks                                                 */
/* ------------------------------------------------------------------ */

/** How long any single smoke request may take. Generous; a cold query is slow. */
const REQUEST_TIMEOUT_MS = 10_000;

/* ------------------------------------------------------------------ */
/* The run                                                              */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  let args;

  try {
    args = parseSmokeArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof SmokeUsageError)) throw error;
    process.stderr.write(`smoke:deploy: ${error.message}\n\nRun with --help.\n`);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    out(SMOKE_USAGE);
    return;
  }

  const root = repositoryRoot();
  const backendDir = join(root, 'backend');
  const runner = new StageRunner(out);

  /**
   * Built once, and used for every child except the server.
   *
   * See `buildEnvironment`: this process has `backend/.env` loaded, and a
   * build must not inherit it.
   */
  const buildEnv = buildEnvironment(root);

  let loaded: Env | undefined;
  let server: SmokeServer | undefined;

  /**
   * Registered before anything is spawned.
   *
   * A Ctrl-C at any point after the server starts must not leave it running.
   * The handler is idempotent because `stop()` is, and it exits with 1 because
   * an interrupted smoke has not passed.
   */
  const interrupted = (): void => {
    void (server?.stop() ?? Promise.resolve()).finally(() => {
      process.stderr.write('\nsmoke:deploy: interrupted\n');
      process.exit(1);
    });
  };

  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);

  try {
    /* 1 — Configuration -------------------------------------------- */

    await runner.run('Configuration', () => {
      // `loadEnv` throws a readable summary; the catch in StageRunner turns it
      // into a stage failure with that summary as the detail.
      const env = loadEnv();
      loaded = env;

      const readiness = checkReadiness(env);
      out(formatReadiness(readiness));

      const errors = readiness.findings.filter((finding) => finding.severity === 'error');

      return Promise.resolve({
        ok: readiness.ok,
        detail:
          errors.length > 0
            ? `${String(errors.length)} configuration ${
                errors.length === 1 ? 'problem' : 'problems'
              } for NODE_ENV=${readiness.environment}`
            : undefined,
      });
    });

    if (args.dryRun) {
      for (const name of [
        'Typecheck',
        'Lint',
        'Clean',
        'Backend build',
        'Frontend build',
        'Server startup',
        'Health',
        'Read-only API',
      ]) {
        runner.skip(name, 'dry run');
      }

      return;
    }

    /* 2 — Typecheck -------------------------------------------------- */

    await runner.run('Typecheck', async () => {
      const result = await runCommand('pnpm', ['-r', 'typecheck'], { cwd: root, env: buildEnv });
      return { ok: result.code === 0, detail: result.code === 0 ? undefined : result.output };
    });

    /* 3 — Lint ------------------------------------------------------- */

    await runner.run('Lint', async () => {
      const result = await runCommand('pnpm', ['-r', 'lint'], { cwd: root, env: buildEnv });
      return { ok: result.code === 0, detail: result.code === 0 ? undefined : result.output };
    });

    /* 4 — Unit tests (opt in) ---------------------------------------- */

    if (args.withTests) {
      await runner.run('Unit tests', async () => {
        // The unit suite needs no database and no credentials; it gets the
        // same clean environment as a build, so a passing run here means the
        // same thing it means in CI.
        const result = await runCommand('pnpm', ['test'], { cwd: backendDir, env: buildEnv });
        return { ok: result.code === 0, detail: result.code === 0 ? undefined : result.output };
      });
    } else {
      runner.skip('Unit tests', 'not requested — pass --with-tests');
    }

    /* 5 — Clean -------------------------------------------------------- */

    await runner.run('Clean', () => {
      const removed = cleanBuildOutput(root);

      return Promise.resolve({
        ok: true,
        detail: removed.length > 0 ? `removed ${removed.join(', ')}` : 'nothing to remove',
      });
    });

    /* 6 — Backend build ---------------------------------------------- */

    await runner.run('Backend build', async () => {
      const result = await runCommand('pnpm', ['--filter', 'zycart-backend', 'build'], {
        cwd: root,
        env: buildEnv,
      });

      if (result.code !== 0) return { ok: false, detail: result.output };

      // A build that reports success and produces no entrypoint would fail at
      // `node dist/server.js` instead — two stages later, as a startup timeout,
      // which is a far less obvious way to be told that `tsc` emitted nothing.
      const entry = join(backendDir, 'dist', 'server.js');

      return existsSync(entry)
        ? { ok: true, detail: 'dist/server.js emitted' }
        : { ok: false, detail: 'the build succeeded but dist/server.js was not emitted' };
    });

    /* 7 — Frontend build --------------------------------------------- */

    if (args.skipFrontend) {
      runner.skip('Frontend build', 'skipped with --skip-frontend');
    } else {
      await runner.run('Frontend build', async () => {
        const result = await runCommand('pnpm', ['--filter', 'zycart-frontend', 'build'], {
          cwd: root,
          env: buildEnv,
        });
        return { ok: result.code === 0, detail: result.code === 0 ? undefined : result.output };
      });
    }

    /* 8 — Server startup --------------------------------------------- */

    const base = `http://127.0.0.1:${String(args.port)}`;

    await runner.run('Server startup', async () => {
      if (!(await isPortAvailable(args.port))) {
        return {
          ok: false,
          detail:
            `port ${String(args.port)} is already in use. Nothing was started, and nothing ` +
            'was terminated — stop whatever is using it, or pass --port.',
        };
      }

      server = startSmokeServer({ backendDir, port: args.port });

      const waited = await waitForHealth({
        url: `${base}/api/health`,
        server,
        timeoutMs: args.startupTimeoutMs,
      });

      if (!waited.ready) {
        return { ok: false, detail: `${waited.reason ?? 'unknown'}\n${server.output()}` };
      }

      return {
        ok: true,
        detail: `healthy after ${String(waited.durationMs)}ms (${String(waited.attempts)} polls)`,
      };
    });

    /* 9 — Health ------------------------------------------------------ */

    await runner.run('Health', async () => {
      const response = await getJson(`${base}/api/health`, REQUEST_TIMEOUT_MS);

      if (response.status !== 200) {
        return { ok: false, detail: `health answered ${String(response.status)}` };
      }

      const parsed = healthResponseSchema.safeParse(response.json);

      if (!parsed.success) {
        return {
          ok: false,
          detail: `the response did not match the health schema: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.') || 'root'} ${issue.message}`)
            .join('; ')}`,
        };
      }

      /**
       * The disclosure check, run against the live response rather than against
       * a report built in a test.
       *
       * `tests/health.test.ts` makes the same assertion about the object; this
       * makes it about the bytes that actually crossed a socket, with this
       * deployment's real credentials loaded. They are not the same check, and
       * this is the one that would catch a secret arriving through a field
       * nobody wrote — a proxy header echoed back, or an error body substituted
       * by something in front of the process.
       */
      // Cannot be reached with configuration unloaded — stage 1 would have
      // failed and this stage would have been skipped — but the check is here
      // rather than a non-null assertion, because a disclosure check that is
      // silently skipped is worse than one that fails loudly.
      if (!loaded) return { ok: false, detail: 'configuration was not loaded' };

      const leaked = secretValues(loaded).filter((secret) => response.body.includes(secret));

      if (leaked.length > 0) {
        return {
          ok: false,
          detail:
            `the health response contains ${String(leaked.length)} configured secret ` +
            `${leaked.length === 1 ? 'value' : 'values'}. The value is not printed here.`,
        };
      }

      const { checks } = parsed.data.data;

      return {
        ok: parsed.data.data.status === 'ok',
        detail:
          `database ${checks.database} · email ${checks.email} · ` +
          `payments ${checks.payments} · assistant ${checks.ai}`,
      };
    });

    /* 10 — Read-only API ---------------------------------------------- */

    await runner.run('Read-only API', async () => {
      const notes: string[] = [];

      for (const check of API_CHECKS) {
        const response = await getJson(`${base}${check.path}`, REQUEST_TIMEOUT_MS);

        if (response.status !== 200) {
          return {
            ok: false,
            detail: `${check.name} answered ${String(response.status)} (${check.path})`,
          };
        }

        const problem = check.verify(response.json);

        if (problem) return { ok: false, detail: `${check.name}: ${problem}` };

        notes.push(`${check.name} ${String(listCount(response.json))}`);
      }

      return { ok: true, detail: notes.join(' · ') };
    });
  } finally {
    /**
     * Cleanup, whatever happened.
     *
     * Including the paths that did not reach the server stage at all, where
     * `server` is null and this does nothing. A smoke command that can leave a
     * server holding a port is a smoke command that breaks the next run.
     */
    if (server) await server.stop();

    const report = runner.report(args.dryRun);
    out(formatSmokeSummary(report));
    process.exitCode = smokeExitCode(report);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`smoke:deploy: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
