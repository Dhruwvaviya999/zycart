import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { loadEnv } from '../config/env';
import { configureObservability } from '../config/logging';
import { emailConfig } from '../config/notifications';
import { drainNotifications } from '../services/notifications/drain';
import {
  DRAIN_USAGE,
  DrainUsageError,
  formatDrainSummary,
  parseDrainArgs,
} from '../services/notifications/drain-cli';

/**
 * Sends the transactional messages a crash left behind.
 *
 *   pnpm notifications:drain
 *   pnpm notifications:drain --help
 *
 * ## Why this exists
 *
 * Phase 14 attempts delivery in the request that raised the event, after its
 * transaction commits — which keeps a mail server off the commerce critical
 * path and leaves exactly one hole: a process that dies between the commit and
 * the send strands a PENDING delivery that nothing picks up. This is the fix,
 * and it is deliberately the smallest thing that could work.
 *
 * ## Why it is a command and not a daemon
 *
 * Because a daemon is infrastructure. This claims a bounded amount of work,
 * does it, prints what happened and exits, so `cron` — which every deployment
 * already has — is the scheduler. There is no `while (true)`, no lease
 * renewal, no queue and no broker.
 *
 * Everything with a decision in it lives in `drain.ts` and `drain-cli.ts`,
 * both of which are importable without side effects and both of which are
 * tested. This file is the shell: parse, connect, run, report, exit.
 */

/**
 * Exit codes, chosen so an operator can decide how much they want to hear.
 *
 * `1` means nothing was attempted and the run is worthless until somebody fixes
 * something. `2` means the mechanism worked and a message did not go out, which
 * is recorded, visible at `/admin/notifications` and retryable. Treat anything
 * non-zero as a failure to be paged for both; ignore `2` to be told only about
 * the machinery.
 */
const EXIT_CANNOT_RUN = 1;
const EXIT_DELIVERY_FAILED = 2;

async function main(): Promise<void> {
  let args;

  try {
    args = parseDrainArgs(process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof DrainUsageError ? `Error: ${error.message}\n` : String(error),
    );
    console.error(DRAIN_USAGE);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  if (args.help) {
    console.log(DRAIN_USAGE);
    return;
  }

  const env = loadEnv();

  /**
   * So the records this run's dependencies emit — `database_connected`, and
   * `notification_stale` when there is something stuck — are formatted for
   * whoever is reading the cron log, rather than appearing as JSON in the
   * middle of a report. It also registers this process's credentials with the
   * redactor, which matters more here than anywhere: a drain talks to an SMTP
   * server, and an SMTP rejection frequently quotes the credentials back.
   */
  configureObservability(env);

  await connectDatabase(env.MONGODB_URI);

  try {
    const summary = await drainNotifications(env, {
      limit: args.limit,
      includeStale: args.includeStale,
      dryRun: args.dryRun,
    });

    if (summary.claimed === 0 && summary.skipped === 0 && summary.staleWaiting === 0) {
      console.log(`No pending notifications. (provider: ${emailConfig(env).provider})`);
      return;
    }

    console.log(formatDrainSummary(summary));

    if (summary.failed > 0) process.exitCode = EXIT_DELIVERY_FAILED;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  /**
   * Everything that reaches here stopped the run before it could do its job —
   * an invalid configuration, an unreachable database, a transport that could
   * not be built. Print the message rather than the stack: a stack is noise in
   * a cron log, and an error object from a mail transport is the one place a
   * credential could surface.
   */
  console.error(
    `Notification drain failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(EXIT_CANNOT_RUN);
});
