import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  API_CHECKS,
  DEFAULT_SMOKE_PORT,
  DEFAULT_STARTUP_TIMEOUT_MS,
  expectList,
  formatSmokeSummary,
  listCount,
  parseSmokeArgs,
  smokeExitCode,
  SMOKE_USAGE,
  SmokeUsageError,
  StageRunner,
  type SmokeReport,
  type StageResult,
} from '../src/services/deploy/smoke-cli';
import {
  BUILD_OUTPUTS,
  buildEnvironment,
  cleanBuildOutput,
  isPortAvailable,
  repositoryRoot,
  runCommand,
  startSmokeServer,
  waitForHealth,
  type SmokeServer,
} from '../src/services/deploy/smoke';

/**
 * The deployment smoke command.
 *
 * ## What is worth testing about a deploy gate
 *
 * Not whether it can build ZyCart — running the real thing does that, and a
 * test that ran it would take minutes and prove nothing a failed build would
 * not. What is worth testing is everything that decides *whether a failure is
 * noticed*:
 *
 *  - that a failed stage stops the stages that depended on it, so nothing is
 *    started after a build that did not happen;
 *  - that the exit code is 1 whenever anything failed, because CI reads that
 *    and nothing else;
 *  - that the summary cannot be misread as a claim about production;
 *  - that the server it starts is stopped, on every path, leaving no orphan
 *    holding a port;
 *  - that a port already in use is reported rather than cleared.
 *
 * ## Cross-platform, deliberately
 *
 * The process cases below spawn real children, bind real ports and terminate
 * real servers. They use `process.execPath` and Node's own APIs throughout —
 * no `curl`, no `lsof`, no `kill -9` — which is the property that makes this
 * command work on the Windows machine it is developed on and the Linux one it
 * runs on. A regression into a Unix-only assumption fails here.
 */

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

const stage = (overrides: Partial<StageResult> = {}): StageResult => ({
  name: 'Configuration',
  status: 'PASS',
  durationMs: 10,
  ...overrides,
});

const report = (stages: StageResult[], dryRun = false): SmokeReport => ({
  stages,
  dryRun,
  passed: stages.some((entry) => entry.status !== 'SKIP') &&
    !stages.some((entry) => entry.status === 'FAIL'),
});

/** A `SmokeServer` that is not a server, for the polling cases. */
const fakeServer = (exitCode: number | null = null): SmokeServer =>
  ({
    child: null as never,
    stop: () => Promise.resolve(),
    output: () => '',
    exitCode: () => exitCode,
  }) satisfies SmokeServer;

/** Ports well above anything ZyCart or a developer's tooling uses. */
let nextPort = 54_321;
const takePort = (): number => (nextPort += 1);

const started: Server[] = [];

function stubApi(port: number, handler: (path: string) => { status: number; body: string }) {
  const server = createServer((request, response) => {
    const { status, body } = handler(request.url ?? '/');
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(body);
  });

  started.push(server);

  return new Promise<Server>((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

after(() => {
  for (const server of started) server.close();
});

/* ---------------------------------------------------------------- */

describe('Smoke arguments', () => {
  it('defaults to the full run on a dedicated port', () => {
    const args = parseSmokeArgs([]);

    assert.equal(args.port, DEFAULT_SMOKE_PORT);
    assert.equal(args.startupTimeoutMs, DEFAULT_STARTUP_TIMEOUT_MS);
    assert.equal(args.skipFrontend, false);
    assert.equal(args.dryRun, false);
    assert.equal(args.help, false);
    // Off by default: the unit suite is its own command, and a deploy gate
    // that silently runs it is a deploy gate that takes twice as long as it
    // says it does.
    assert.equal(args.withTests, false);
  });

  it('reads every flag it documents', () => {
    const args = parseSmokeArgs([
      '--skip-frontend',
      '--with-tests',
      '--dry-run',
      '--port',
      '6100',
      '--startup-timeout',
      '9000',
    ]);

    assert.equal(args.skipFrontend, true);
    assert.equal(args.withTests, true);
    assert.equal(args.dryRun, true);
    assert.equal(args.port, 6100);
    assert.equal(args.startupTimeoutMs, 9000);
  });

  it('refuses an unrecognised flag rather than ignoring it', () => {
    // `--skip-frontent` silently ignored is a gate that quietly stopped
    // checking half of what its output claims it checked.
    assert.throws(() => parseSmokeArgs(['--skip-frontent']), SmokeUsageError);
    assert.throws(() => parseSmokeArgs(['--force']), SmokeUsageError);
  });

  it('refuses a port that is not a usable port', () => {
    for (const value of ['0', '80', '-1', '70000', 'abc', '5055.5']) {
      assert.throws(() => parseSmokeArgs(['--port', value]), SmokeUsageError, value);
    }

    assert.throws(() => parseSmokeArgs(['--port']), SmokeUsageError);
  });

  it('refuses a timeout that would make the run unbounded or pointless', () => {
    assert.throws(() => parseSmokeArgs(['--startup-timeout', '10']), SmokeUsageError);
    assert.throws(() => parseSmokeArgs(['--startup-timeout', '900000']), SmokeUsageError);
  });
});

/* ---------------------------------------------------------------- */

describe('Usage text', () => {
  /**
   * Compared with whitespace collapsed.
   *
   * The usage text is hard-wrapped for a terminal, so a promise can and does
   * straddle two lines. Asserting the raw string would make these cases fail
   * whenever a sentence is re-wrapped, which trains whoever hits it to weaken
   * the assertion rather than to keep the promise.
   */
  const usage = SMOKE_USAGE.replace(/\s+/g, ' ');

  it('names every dangerous thing it does not do', () => {
    for (const claim of [
      'No order is placed',
      'no stock moves',
      'No email is sent',
      'never drains them',
      'No payment and no refund',
      'Nothing is written to the database',
      'never terminates a process it did not start',
    ]) {
      assert.ok(usage.includes(claim), `usage should state: ${claim}`);
    }
  });

  it('says what a dry run is not', () => {
    assert.ok(usage.includes('A passing dry run is not a passing smoke.'));
  });

  it('documents both exit codes', () => {
    assert.match(SMOKE_USAGE, /0\s+every stage that ran, passed/);
    assert.match(SMOKE_USAGE, /1\s+a stage failed/);
  });

  it('promises no value is printed', () => {
    assert.ok(usage.includes('No value is printed by this command'));
  });
});

/* ---------------------------------------------------------------- */

describe('Stage dependencies', () => {
  const runner = (): { runner: StageRunner; lines: string[] } => {
    const lines: string[] = [];
    return { runner: new StageRunner((line) => lines.push(line)), lines };
  };

  it('skips everything after a failure', async () => {
    const { runner: stages } = runner();

    await stages.run('Typecheck', () => Promise.resolve({ ok: true }));
    await stages.run('Backend build', () => Promise.resolve({ ok: false, detail: 'tsc failed' }));

    let serverStarted = false;
    await stages.run('Server startup', () => {
      serverStarted = true;
      return Promise.resolve({ ok: true });
    });

    // The property the whole command depends on: a failed build starts nothing.
    assert.equal(serverStarted, false);

    assert.deepEqual(
      stages.stages.map((entry) => entry.status),
      ['PASS', 'FAIL', 'SKIP'],
    );
  });

  it('treats a thrown stage as a failed stage, not a crash', async () => {
    const { runner: stages } = runner();

    await stages.run('Configuration', () =>
      Promise.reject(new Error('Invalid environment configuration:\n  - MONGODB_URI: is required')),
    );

    const first = stages.stages[0];
    assert.equal(first?.status, 'FAIL');
    assert.match(first?.detail ?? '', /MONGODB_URI/);
  });

  it('fails the run when any stage failed', async () => {
    const { runner: stages } = runner();

    await stages.run('Typecheck', () => Promise.resolve({ ok: true }));
    await stages.run('Lint', () => Promise.resolve({ ok: false }));

    const result = stages.report(false);
    assert.equal(result.passed, false);
    assert.equal(smokeExitCode(result), 1);
  });

  it('passes a run in which everything that ran, passed', async () => {
    const { runner: stages } = runner();

    await stages.run('Configuration', () => Promise.resolve({ ok: true }));
    stages.skip('Frontend build', 'skipped with --skip-frontend');

    const result = stages.report(false);
    assert.equal(result.passed, true);
    assert.equal(smokeExitCode(result), 0);
  });

  it('does not pass a run in which nothing ran', () => {
    const { runner: stages } = runner();

    stages.skip('Configuration', 'dry run');

    assert.equal(stages.report(false).passed, false);
  });

  it('prints each stage the moment it finishes', async () => {
    const { runner: stages, lines } = runner();

    await stages.run('Health', () => Promise.resolve({ ok: false, detail: 'database unavailable' }));

    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? '', /\[FAIL] Health/);
    assert.match(lines[0] ?? '', /database unavailable/);
  });
});

/* ---------------------------------------------------------------- */

describe('Summary', () => {
  it('states its limits in the same breath as a pass', () => {
    const text = formatSmokeSummary(
      report([stage({ name: 'Configuration' }), stage({ name: 'Health' })]),
    );

    assert.ok(text.includes('DEPLOYMENT SMOKE PASSED'));
    // Never "production verified", and never "READY" unqualified.
    assert.equal(text.includes('Production fully verified'), false);
    assert.ok(text.includes('It does not prove that mail is delivered'));
  });

  it('names the stage that failed', () => {
    const text = formatSmokeSummary(
      report([
        stage({ name: 'Configuration' }),
        stage({ name: 'Health', status: 'FAIL', detail: 'database unavailable' }),
        stage({ name: 'Read-only API', status: 'SKIP' }),
      ]),
    );

    assert.ok(text.includes('Result: FAILED at Health'));
    assert.ok(text.includes('database unavailable'));
  });

  it('quotes only the first line of a long failure, which was already printed', () => {
    const text = formatSmokeSummary(
      report([
        stage({
          name: 'Frontend build',
          status: 'FAIL',
          detail: 'next build failed\nTypeError: Cannot read properties of null\n    at frame',
        }),
      ]),
    );

    assert.ok(text.includes('next build failed'));
    // Forty lines of compiler output beneath the verdict would bury it.
    assert.equal(text.includes('at frame'), false);
  });

  it('lists what was not run, so a pass is not read as a full pass', () => {
    const text = formatSmokeSummary(
      report([
        stage({ name: 'Configuration' }),
        stage({ name: 'Frontend build', status: 'SKIP' }),
        stage({ name: 'Unit tests', status: 'SKIP' }),
      ]),
    );

    assert.ok(text.includes('Not run: Frontend build, Unit tests.'));
  });

  it('refuses to let a dry run look like a smoke', () => {
    const text = formatSmokeSummary(report([stage({ name: 'Configuration' })], true));

    assert.ok(text.includes('CONFIGURATION OK'));
    assert.ok(text.includes('nothing was built, started or called'));
    assert.ok(text.includes('A dry run is not a smoke'));
    assert.equal(text.includes('DEPLOYMENT SMOKE PASSED'), false);
  });
});

/* ---------------------------------------------------------------- */

describe('The environment a build sees', () => {
  /** A repository-shaped temp directory with a backend/.env in it. */
  function scratchRepo(envFile: string): string {
    const root = mkdtempSync(join(tmpdir(), 'zycart-p16-env-'));
    mkdirSync(join(root, 'backend'), { recursive: true });
    writeFileSync(join(root, 'backend', '.env'), envFile);
    return root;
  }

  it('removes an inherited development NODE_ENV', () => {
    // The regression this exists for. `next build` inheriting
    // NODE_ENV=development fails prerendering /_global-error with a null
    // useContext — a build that is perfectly fine, failed by its own gate.
    const root = scratchRepo('NODE_ENV=development\n');

    try {
      const environment = buildEnvironment(root, { NODE_ENV: 'development', PATH: '/usr/bin' });

      assert.equal('NODE_ENV' in environment, false);
      assert.equal(environment.PATH, '/usr/bin');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('removes NODE_ENV even when it came from the shell rather than a file', () => {
    const root = mkdtempSync(join(tmpdir(), 'zycart-p16-env-'));

    try {
      assert.equal('NODE_ENV' in buildEnvironment(root, { NODE_ENV: 'development' }), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps the server configuration out of a compiler and a bundler', () => {
    const root = scratchRepo(
      [
        'MONGODB_URI=mongodb://user:p16-secret@db.invalid/zycart',
        'JWT_SECRET=p16-jwt-secret-value',
        'SMTP_PASSWORD=p16-smtp-password',
        '',
      ].join('\n'),
    );

    try {
      const environment = buildEnvironment(root, {
        MONGODB_URI: 'mongodb://user:p16-secret@db.invalid/zycart',
        JWT_SECRET: 'p16-jwt-secret-value',
        SMTP_PASSWORD: 'p16-smtp-password',
        PATH: '/usr/bin',
        HOME: '/home/someone',
      });

      assert.equal('MONGODB_URI' in environment, false);
      assert.equal('JWT_SECRET' in environment, false);
      assert.equal('SMTP_PASSWORD' in environment, false);

      // Everything the toolchain actually needs is untouched.
      assert.equal(environment.PATH, '/usr/bin');
      assert.equal(environment.HOME, '/home/someone');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('works in CI, where there is no .env file at all', () => {
    const root = mkdtempSync(join(tmpdir(), 'zycart-p16-env-'));

    try {
      const environment = buildEnvironment(root, { PATH: '/usr/bin', CI: 'true' });

      assert.equal(environment.PATH, '/usr/bin');
      assert.equal(environment.CI, 'true');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/* ---------------------------------------------------------------- */

describe('Cleaning build output', () => {
  it('removes only the two gitignored build directories', () => {
    // The list is asserted exactly, not sampled. It is the whole of what this
    // command is permitted to delete, and it must not grow by accident.
    assert.deepEqual([...BUILD_OUTPUTS], ['backend/dist', 'frontend/.next']);
  });

  it('removes what is there, and nothing beside it', () => {
    const root = mkdtempSync(join(tmpdir(), 'zycart-p16-clean-'));

    try {
      mkdirSync(join(root, 'backend', 'dist'), { recursive: true });
      writeFileSync(join(root, 'backend', 'dist', 'server.js'), '// stale');
      mkdirSync(join(root, 'backend', 'src'), { recursive: true });
      writeFileSync(join(root, 'backend', 'src', 'server.ts'), '// source');

      const removed = cleanBuildOutput(root);

      assert.deepEqual(removed, ['backend/dist']);
      assert.equal(existsSync(join(root, 'backend', 'dist')), false);
      // Source is not build output.
      assert.equal(existsSync(join(root, 'backend', 'src', 'server.ts')), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('is happy when there is nothing to remove', () => {
    const root = mkdtempSync(join(tmpdir(), 'zycart-p16-clean-'));

    try {
      assert.deepEqual(cleanBuildOutput(root), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/* ---------------------------------------------------------------- */

describe('Read-only API checks', () => {
  it('calls only public catalogue GETs, and exactly these', () => {
    // Asserted exactly rather than sampled. This list is the whole of what a
    // smoke run does to a running ZyCart, and it must not quietly grow a
    // write. `smoke.ts` offers no helper capable of one.
    assert.deepEqual(
      API_CHECKS.map((check) => check.path),
      [
        '/api/products?limit=2',
        '/api/categories',
        '/api/brands',
        '/api/products/featured',
      ],
    );
  });

  it('accepts a well-formed list, empty or not', () => {
    assert.equal(expectList({ success: true, data: [{ id: '1' }] }), null);
    // An unseeded catalogue is a store serving correctly, not a failed deploy.
    assert.equal(expectList({ success: true, data: [] }), null);
  });

  it('rejects anything that is not the shape this API promises', () => {
    // A proxy error page, a cached CDN response, a half-migrated deployment.
    assert.match(expectList('<html>502 Bad Gateway</html>') ?? '', /not an object/);
    assert.match(expectList(null) ?? '', /not an object/);
    assert.match(expectList({ success: false, message: 'nope' }) ?? '', /did not report success/);
    assert.match(expectList({ success: true, data: { id: '1' } }) ?? '', /no array of results/);
    assert.match(expectList({ success: true }) ?? '', /no array of results/);
  });

  it('counts results for the stage detail without trusting the shape', () => {
    assert.equal(listCount({ success: true, data: [1, 2, 3] }), 3);
    assert.equal(listCount({ success: true, data: 'not an array' }), 0);
    assert.equal(listCount(null), 0);
  });
});

/* ---------------------------------------------------------------- */

describe('Ports', () => {
  it('reports a free port as available', async () => {
    assert.equal(await isPortAvailable(takePort()), true);
  });

  it('reports a port somebody else holds as unavailable, and takes it from nobody', async () => {
    const port = takePort();
    const server = await stubApi(port, () => ({ status: 200, body: '{}' }));

    assert.equal(await isPortAvailable(port), false);

    // The check must be a question, not an action. The other server is still
    // listening afterwards — this is the case that would otherwise be a
    // developer's `pnpm dev` being killed by a deploy gate.
    assert.equal(server.listening, true);
    server.close();
  });
});

/* ---------------------------------------------------------------- */

describe('Running a command', () => {
  const cwd = repositoryRoot();

  it('finds the repository root from this file', () => {
    assert.ok(cwd.length > 0);
  });

  it('propagates a zero exit code and captures output', async () => {
    const result = await runCommand(process.execPath, ['-e', '"console.log(41 + 1)"'], { cwd });

    assert.equal(result.code, 0);
    assert.match(result.output, /42/);
  });

  it('propagates a non-zero exit code', async () => {
    const result = await runCommand(process.execPath, ['-e', '"process.exit(3)"'], { cwd });

    assert.equal(result.code, 3);
  });

  it('captures the error stream, where a build failure prints', async () => {
    const result = await runCommand(
      process.execPath,
      ['-e', '"console.error(\'TS2345: type error\'); process.exit(2)"'],
      { cwd },
    );

    assert.equal(result.code, 2);
    assert.match(result.output, /TS2345/);
  });

  it('reports a command that cannot be run as a failure, not a crash', async () => {
    const result = await runCommand('zycart-not-a-real-command-p16', [], { cwd });

    assert.notEqual(result.code, 0);
  });

  it('bounds how much of a noisy failure it keeps', async () => {
    const result = await runCommand(
      process.execPath,
      ['-e', '"for (let i = 0; i < 500; i += 1) console.log(\'line \' + i)"'],
      { cwd },
    );

    assert.ok(result.output.split('\n').length <= 40);
    // The tail, which is where a build prints what went wrong.
    assert.match(result.output, /line 499/);
  });
});

/* ---------------------------------------------------------------- */

describe('Waiting for health', () => {
  it('succeeds as soon as health answers 200', async () => {
    const port = takePort();
    await stubApi(port, () => ({ status: 200, body: '{"success":true}' }));

    const result = await waitForHealth({
      url: `http://127.0.0.1:${String(port)}/api/health`,
      server: fakeServer(),
      timeoutMs: 5_000,
    });

    assert.equal(result.ready, true);
  });

  it('stops immediately when the server says it is not ready', async () => {
    const port = takePort();
    await stubApi(port, () => ({ status: 503, body: '{"success":true}' }));

    const startedAt = Date.now();
    const result = await waitForHealth({
      url: `http://127.0.0.1:${String(port)}/api/health`,
      server: fakeServer(),
      timeoutMs: 5_000,
    });

    assert.equal(result.ready, false);
    assert.match(result.reason ?? '', /not ready/);
    // Retrying a 503 is another failed round trip to the same database.
    assert.ok(Date.now() - startedAt < 2_000);
  });

  it('gives up when nothing ever listens', async () => {
    const result = await waitForHealth({
      url: `http://127.0.0.1:${String(takePort())}/api/health`,
      server: fakeServer(),
      timeoutMs: 1_200,
    });

    assert.equal(result.ready, false);
    assert.match(result.reason ?? '', /timed out/);
  });

  it('reports a server that died rather than waiting out the timeout', async () => {
    const startedAt = Date.now();

    const result = await waitForHealth({
      url: `http://127.0.0.1:${String(takePort())}/api/health`,
      server: fakeServer(1),
      timeoutMs: 30_000,
    });

    assert.equal(result.ready, false);
    assert.match(result.reason ?? '', /exited with code 1/);
    assert.ok(Date.now() - startedAt < 1_000, 'a dead server must not be waited on');
  });
});

/* ---------------------------------------------------------------- */

describe('The temporary server', () => {
  /**
   * A stand-in for `dist/server.js`.
   *
   * Small on purpose: what is being tested is the lifecycle — spawn, become
   * healthy, be stopped, release the port — not ZyCart. Building the real
   * backend to assert that a child process can be killed would make this suite
   * depend on a compiler.
   */
  function scratchBackend(healthy: boolean): string {
    const directory = mkdtempSync(join(tmpdir(), 'zycart-p16-smoke-'));
    mkdirSync(join(directory, 'dist'));

    writeFileSync(
      join(directory, 'dist', 'server.js'),
      `const http = require('http');
       const status = ${healthy ? '200' : '503'};
       http.createServer((req, res) => {
         res.writeHead(status, { 'content-type': 'application/json' });
         res.end(JSON.stringify({ success: true }));
       }).listen(Number(process.env.PORT), '127.0.0.1');
      `,
    );

    return directory;
  }

  it('starts, becomes healthy, stops, and leaves the port free', async () => {
    const port = takePort();
    const directory = scratchBackend(true);

    try {
      const server = startSmokeServer({ backendDir: directory, port });

      const waited = await waitForHealth({
        url: `http://127.0.0.1:${String(port)}/api/health`,
        server,
        timeoutMs: 10_000,
      });

      assert.equal(waited.ready, true);
      assert.equal(await isPortAvailable(port), false, 'the server should hold the port');

      await server.stop();

      // No orphan. This is the assertion that would fail if cleanup went
      // through a shell wrapper, which is why the server is spawned directly.
      assert.equal(await isPortAvailable(port), true, 'the port was not released');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('is stoppable even when it never became healthy', async () => {
    const port = takePort();
    const directory = scratchBackend(false);

    try {
      const server = startSmokeServer({ backendDir: directory, port });

      const waited = await waitForHealth({
        url: `http://127.0.0.1:${String(port)}/api/health`,
        server,
        timeoutMs: 8_000,
      });

      assert.equal(waited.ready, false);

      // The failure path still cleans up — this is the `finally` in the runner.
      await server.stop();
      assert.equal(await isPortAvailable(port), true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reports a server that exits immediately, and stops cleanly', async () => {
    const port = takePort();
    const directory = mkdtempSync(join(tmpdir(), 'zycart-p16-smoke-'));
    mkdirSync(join(directory, 'dist'));
    writeFileSync(
      join(directory, 'dist', 'server.js'),
      "console.error('Invalid environment configuration'); process.exit(1);",
    );

    try {
      const server = startSmokeServer({ backendDir: directory, port });

      const waited = await waitForHealth({
        url: `http://127.0.0.1:${String(port)}/api/health`,
        server,
        timeoutMs: 20_000,
      });

      assert.equal(waited.ready, false);
      assert.match(waited.reason ?? '', /exited with code 1/);
      assert.match(server.output(), /Invalid environment configuration/);

      await server.stop();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
