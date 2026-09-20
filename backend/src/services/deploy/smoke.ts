import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, parse } from 'node:path';
import { parse as parseEnvFile } from 'dotenv';

/**
 * The machinery behind `pnpm smoke:deploy`.
 *
 * ## Why this is written in Node and not in shell
 *
 * ZyCart is developed on Windows and deployed on Linux, and a deployment gate
 * that only runs on one of them is a gate that gets skipped on the other. A
 * shell script would need `curl` to poll health, `grep` to read its output,
 * `lsof` to check a port and `kill -9` to clean up — four tools, none of which
 * is present in the same form on both platforms, and `kill -9` in particular
 * has no Windows equivalent that does not risk the wrong process.
 *
 * Node has all four as library calls. `fetch` polls, `net.createServer` tests a
 * port by trying to bind it, and `child.kill()` is implemented per platform by
 * the runtime. Nothing in this file branches on `process.platform` except the
 * one place it genuinely must.
 *
 * ## Safety
 *
 * Everything the smoke command does to the outside world is here, and there is
 * very little of it: it spawns package scripts in the repository, it binds one
 * port, and it makes HTTP GETs to a server it started itself. It performs no
 * database operation of its own; the only database traffic is whatever the
 * server does in service of a health check and four catalogue reads.
 */

/* ------------------------------------------------------------------ */
/* Locating the repository                                              */
/* ------------------------------------------------------------------ */

/**
 * The workspace root, found by walking up from this file.
 *
 * Not `process.cwd()`: the command must behave the same whether it is invoked
 * from the repository root, from `backend/`, or by a CI runner that set its
 * working directory somewhere else entirely.
 */
export function repositoryRoot(from: string = __dirname): string {
  let directory = from;
  const { root } = parse(directory);

  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(join(directory, 'pnpm-workspace.yaml'))) return directory;
    if (directory === root) break;
    directory = dirname(directory);
  }

  throw new Error('Could not find the repository root (no pnpm-workspace.yaml above this file).');
}

/* ------------------------------------------------------------------ */
/* The environment a build sees                                         */
/* ------------------------------------------------------------------ */

/**
 * The environment for a **build**, which is not the environment of this
 * process.
 *
 * ## The bug this exists because of
 *
 * The smoke command loads `backend/.env`, because it has to: stage 1 validates
 * the configuration this deployment will actually run with. `dotenv` puts
 * every one of those variables into `process.env` — including
 * `NODE_ENV=development`, which is correct for the server and catastrophic for
 * a build.
 *
 * Spawning `next build` with that inherited turned a build that passes into a
 * build that fails, prerendering `/_global-error` with
 * `Cannot read properties of null (reading 'useContext')`. Nothing was wrong
 * with the code; the gate had contaminated the thing it was measuring.
 *
 * This is exactly the class of failure a production-build smoke is for, and it
 * is a little uncomfortable that the first instance of it was the smoke
 * command's own. It is recorded here rather than quietly patched, because the
 * general rule is what matters: **a build must see the environment CI would
 * give it, not the environment of the process that launched it.**
 *
 * ## What is removed
 *
 * Every key that `backend/.env` defines, plus `NODE_ENV` unconditionally. The
 * server's configuration is the server's; a compiler and a bundler have no
 * business reading a database URI or a mail password, and removing the whole
 * file's worth is both simpler and safer than listing exceptions.
 *
 * The **server startup** stage deliberately does *not* use this. That stage
 * runs the real entrypoint, which must load the real configuration — that is
 * the whole point of starting it.
 */
export function buildEnvironment(root: string, source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...source };

  try {
    const file = readFileSync(join(root, 'backend', '.env'), 'utf8');

    for (const key of Object.keys(parseEnvFile(file))) {
      delete environment[key];
    }
  } catch {
    // No .env, or an unreadable one. A CI runner configures the environment
    // directly and has no file; NODE_ENV is still removed below.
  }

  // Unconditional, because an inherited development NODE_ENV breaks a build
  // whether it arrived from a file or from the shell. Each tool applies its
  // own default: `next build` sets production, and `tsc` and ESLint do not
  // read it at all.
  delete environment.NODE_ENV;

  return environment;
}

/* ------------------------------------------------------------------ */
/* Build output                                                         */
/* ------------------------------------------------------------------ */

/**
 * The two directories a build writes, and the only paths this command removes.
 *
 * Relative to the repository root, hard-coded, and never derived from an
 * argument or an environment variable. A deploy gate that can be pointed at an
 * arbitrary path is a deploy gate that can be made to delete one.
 */
export const BUILD_OUTPUTS: readonly string[] = ['backend/dist', 'frontend/.next'];

/**
 * Removes the previous build output before building.
 *
 * ## Why this is not optional
 *
 * A deployment builds from a clean checkout. A smoke run that reuses whatever
 * `.next` happened to be lying around is therefore not reproducing the
 * deployment — it is testing a state that will never exist in production.
 *
 * That is not theoretical. This command's own first run failed at the frontend
 * build with `Cannot read properties of null (reading 'useContext')` while
 * prerendering `/_global-error`, from a stale cache left by an earlier
 * Next.js version. The same build from a clean directory succeeded. A deploy
 * gate that fails for reasons unrelated to the code is a deploy gate people
 * learn to re-run until it passes, and at that point it has stopped working.
 *
 * ## Why it is safe
 *
 * Both paths are build output. Both are in `.gitignore`, neither is a source
 * of truth for anything, and both are regenerated by the two stages that
 * immediately follow. The cost of being wrong is one slower `pnpm dev`.
 */
export function cleanBuildOutput(root: string): string[] {
  const removed: string[] = [];

  for (const relative of BUILD_OUTPUTS) {
    const target = join(root, relative);

    if (!existsSync(target)) continue;

    rmSync(target, { recursive: true, force: true });
    removed.push(relative);
  }

  return removed;
}

/* ------------------------------------------------------------------ */
/* Running a command                                                    */
/* ------------------------------------------------------------------ */

export interface CommandResult {
  code: number;
  /** The tail of stdout and stderr, combined and bounded. */
  output: string;
}

/**
 * How much of a failing command's output is worth keeping.
 *
 * A failed `next build` prints hundreds of lines and the useful ones are at the
 * end. Printing all of it into a CI log that already contains the command's own
 * output would duplicate it; printing none would leave a reader to re-run the
 * build by hand to find out what happened.
 */
const OUTPUT_TAIL_LINES = 40;

const tail = (chunks: string[]): string =>
  chunks.join('').split('\n').filter(Boolean).slice(-OUTPUT_TAIL_LINES).join('\n');

/**
 * Runs one package script and waits for it.
 *
 * `shell: true` is needed on Windows, where `pnpm` is a `.cmd` shim that Node
 * refuses to execute directly. It is safe here because every argument this
 * function is ever given is a literal written in `smoke-deploy.ts` — no part of
 * a command line comes from a file, an environment variable or a user. The one
 * numeric option a caller can set (`--port`) is validated as an integer by
 * `parseSmokeArgs` and is passed to the server through its environment, not
 * through a command line.
 */
export function runCommand(
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const chunks: string[] = [];

    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: true,
      windowsHide: true,
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => chunks.push(chunk));
    child.stderr.on('data', (chunk: string) => chunks.push(chunk));

    // A command that cannot be spawned at all — pnpm missing from PATH — must
    // resolve as a failure rather than reject, so the caller reports it as a
    // stage failure with a reason rather than as an unhandled rejection.
    child.on('error', (error) => {
      resolve({ code: 1, output: `${tail(chunks)}\n${error.message}`.trim() });
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, output: tail(chunks) });
    });
  });
}

/* ------------------------------------------------------------------ */
/* Ports                                                                */
/* ------------------------------------------------------------------ */

/**
 * Whether a port can be bound, decided by binding it.
 *
 * The only honest test. Scanning a process list tells you what is running, not
 * whether the port is claimed — and on Windows it would mean shelling out to
 * `netstat`, which is exactly the platform dependency this file exists to
 * avoid.
 *
 * Crucially, this replaces the thing a shell script would do here: find the
 * process on the port and kill it. ZyCart's smoke command never does that. The
 * process on that port belongs to somebody — very often a developer's own
 * `pnpm dev` — and terminating it to make room for a test is a decision no
 * automated gate gets to make. A busy port is a clear failure with a clear
 * remedy instead.
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();

    probe.once('error', () => {
      resolve(false);
    });

    probe.once('listening', () => {
      probe.close(() => {
        resolve(true);
      });
    });

    // 127.0.0.1 rather than every interface: the smoke server is bound to
    // loopback in practice, and probing every interface would report a port
    // busy because something unrelated holds it on a different address.
    probe.listen(port, '127.0.0.1');
  });
}

/* ------------------------------------------------------------------ */
/* The temporary server                                                 */
/* ------------------------------------------------------------------ */

export interface SmokeServer {
  child: ChildProcess;
  /** Resolves once the process has gone, however it went. */
  stop: () => Promise<void>;
  /** The tail of everything it printed, for a failure report. */
  output: () => string;
  /** Set if the process exited on its own before or during the run. */
  exitCode: () => number | null;
}

/** How long a terminating server has before it is killed outright. */
const STOP_GRACE_MS = 5_000;

/**
 * Starts the compiled server, on the smoke port, and returns a handle to it.
 *
 * ## Why `node dist/server.js` and not `pnpm start`
 *
 * Two reasons, and the second is the important one.
 *
 * It is the real production entrypoint — the same command a deployment runs —
 * so this is the artefact being tested rather than a development wrapper
 * around it.
 *
 * And it is a single process with no shell between. `pnpm start` would spawn a
 * shell, which would spawn pnpm, which would spawn node: killing the handle
 * this function returns would then kill the shell and leave the server running
 * as an orphan, still holding the port. Spawning `node` directly means the
 * handle *is* the server, and `child.kill()` is the whole of cleanup on every
 * platform.
 */
export function startSmokeServer(options: {
  backendDir: string;
  port: number;
}): SmokeServer {
  const chunks: string[] = [];
  let exited: number | null = null;

  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: options.backendDir,
    env: {
      ...process.env,
      PORT: String(options.port),
      /**
       * JSON, so that whatever this prints is one object per line and the
       * failure report can quote it without a multi-line banner. It also means
       * the smoke run exercises the production log format.
       */
      LOG_FORMAT: 'json',
    },
    windowsHide: true,
  });

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => chunks.push(chunk));
  child.stderr?.on('data', (chunk: string) => chunks.push(chunk));

  child.on('exit', (code) => {
    exited = code ?? 1;
  });

  // A server that fails to start writes to stderr and exits; without this the
  // spawn error would surface as an unhandled 'error' event on the process.
  child.on('error', (error) => {
    chunks.push(error.message);
    exited = 1;
  });

  const stop = (): Promise<void> =>
    new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }

      const forced = setTimeout(() => {
        // SIGKILL on POSIX; on Windows the runtime terminates the process.
        // Reached only if the graceful shutdown handler is itself stuck.
        child.kill('SIGKILL');
      }, STOP_GRACE_MS);

      child.once('exit', () => {
        clearTimeout(forced);
        resolve();
      });

      child.kill('SIGTERM');
    });

  return {
    child,
    stop,
    output: () => tail(chunks),
    exitCode: () => exited,
  };
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                 */
/* ------------------------------------------------------------------ */

export interface HttpResult {
  status: number;
  /** The raw body, kept so the caller can assert no secret appears in it. */
  body: string;
  json: unknown;
}

/**
 * One GET, with a timeout it cannot exceed.
 *
 * Every call this command makes is a GET. There is no helper here for anything
 * else, deliberately: a deployment gate that could POST is a deployment gate
 * that could one day place an order.
 */
export async function getJson(url: string, timeoutMs: number): Promise<HttpResult> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' },
  });

  const body = await response.text();

  let json: unknown = null;
  try {
    json = JSON.parse(body);
  } catch {
    // Left as null. The caller reports "did not answer with JSON", which is a
    // more useful failure than a parse error from inside a helper.
  }

  return { status: response.status, body, json };
}

/** How long a single health poll may take before it is abandoned and retried. */
const POLL_TIMEOUT_MS = 3_000;

/** How long to wait between polls. Short enough to be quick, long enough to be quiet. */
const POLL_INTERVAL_MS = 400;

export interface WaitResult {
  ready: boolean;
  /** Why it is not ready, when it is not. */
  reason?: string;
  attempts: number;
  durationMs: number;
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Polls health until the server is ready, the server dies, or time runs out.
 *
 * ## Why this cannot hang
 *
 * Three independent bounds, and all three are needed. Each `fetch` carries its
 * own abort signal, so a socket that accepts and never answers is abandoned.
 * The loop carries a deadline, so a server that answers 503 forever stops being
 * waited for. And the child's exit is checked every pass, so a process that
 * died on line one is reported immediately instead of being waited on for the
 * full timeout — which is the difference between a forty-five-second CI step
 * and a one-second one when a build is broken.
 */
export async function waitForHealth(options: {
  url: string;
  server: SmokeServer;
  timeoutMs: number;
}): Promise<WaitResult> {
  const startedAt = Date.now();
  const deadline = startedAt + options.timeoutMs;

  let attempts = 0;
  let lastReason = 'the server did not answer';

  while (Date.now() < deadline) {
    const exit = options.server.exitCode();

    if (exit !== null) {
      return {
        ready: false,
        reason: `the server exited with code ${String(exit)} before becoming healthy`,
        attempts,
        durationMs: Date.now() - startedAt,
      };
    }

    attempts += 1;

    try {
      const result = await getJson(options.url, POLL_TIMEOUT_MS);

      if (result.status === 200) {
        return { ready: true, attempts, durationMs: Date.now() - startedAt };
      }

      lastReason = `health answered ${String(result.status)}`;

      // A 503 is the server saying it cannot reach its database. It is up, it
      // is honest, and it is not going to get better by being asked again —
      // every retry is another failed round trip to the same database.
      if (result.status === 503) {
        return {
          ready: false,
          reason: 'the server started but reported itself not ready (database unreachable)',
          attempts,
          durationMs: Date.now() - startedAt,
        };
      }
    } catch (error) {
      // Connection refused while the server is still binding its port. Normal
      // for the first few attempts, and the deadline is what makes it finite.
      lastReason = error instanceof Error ? error.message : String(error);
    }

    await delay(POLL_INTERVAL_MS);
  }

  return {
    ready: false,
    reason: `timed out after ${String(options.timeoutMs)}ms (${lastReason})`,
    attempts,
    durationMs: Date.now() - startedAt,
  };
}
