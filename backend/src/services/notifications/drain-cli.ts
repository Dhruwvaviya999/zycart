import { STALE_SENDING_MS } from '../../config/notifications';
import { DRAIN_DEFAULT_LIMIT, DRAIN_MAX_LIMIT, type DrainSummary } from './drain';

/**
 * The drain command's surface: what it accepts, and how it reports.
 *
 * Separate from `utils/drain-notifications.ts` for one reason — that file runs
 * `main()` on import, so importing it from a test would open a database
 * connection as a side effect of reading an argument parser. Everything here is
 * pure, and everything here is tested.
 */

/** Raised for an argument this command will not act on. */
export class DrainUsageError extends Error {}

export interface DrainArgs {
  limit: number;
  dryRun: boolean;
  includeStale: boolean;
  help: boolean;
}

export const DRAIN_USAGE = `
ZyCart — transactional email drain

  Sends notification deliveries that were recorded but never handed to the mail
  provider, which is what a process crash between commit and send leaves behind.

Usage
  pnpm notifications:drain [options]

Options
  --limit <n>       Messages to attempt in this run.
                    Default ${String(DRAIN_DEFAULT_LIMIT)}, maximum ${String(DRAIN_MAX_LIMIT)}.
  --dry-run         Report what is eligible. Claims nothing, sends nothing,
                    writes nothing.
  --include-stale   Also reclaim deliveries stuck in SENDING for longer than
                    ${String(Math.round(STALE_SENDING_MS / 60_000))} minutes. See the warning below.
  --help, -h        This text.

What it does
  Attempts every PENDING delivery that still has attempts left in its automatic
  budget, oldest first, exactly once per run. The claim is atomic, so two drains
  running at the same time cannot send the same message twice.

What it does NOT do
  It does not retry FAILED deliveries. A message that has used its automatic
  budget is one a person should look at — a cron job quietly retrying it forever
  would turn a bounded policy into an unbounded one. Use Retry on
  /admin/notifications for those.

  It does not loop. One pass, up to --limit, then it exits. The next scheduled
  run is the retry.

--include-stale
  A delivery in SENDING was handed to the provider by a process that then died.
  Whether the provider accepted it first is genuinely unknown — SMTP has no way
  to ask — so reclaiming one may put a second copy of the same message in a
  customer's inbox. It is off by default for that reason, and the number of
  waiting stale deliveries is always reported so the decision is visible.

Exit codes
  0   ran, and everything it claimed was accepted
  1   could not run — bad configuration, no database, no transport
  2   ran, and at least one delivery failed

Configuration
  EMAIL_PROVIDER   mock | smtp. With "mock" nothing is delivered, and the run
                   says so on a line of its own.
  MONGODB_URI      Required.

  No secret is printed by this command, in any mode.

Scheduling
  Every five minutes is ample for a store of this size:

    */5 * * * * cd /srv/zycart && pnpm notifications:drain >> /var/log/zycart-drain.log 2>&1

  That path is an example, not a configured one.
`.trim();

/**
 * Reads the command line, strictly.
 *
 * An unrecognised flag stops the run rather than being ignored. A cron entry
 * with a typo in it is a cron entry that has silently been doing something
 * other than what it says for however long it has been installed — and the
 * whole point of this command is that stranded work gets noticed.
 */
export function parseDrainArgs(argv: readonly string[]): DrainArgs {
  const parsed: DrainArgs = {
    limit: DRAIN_DEFAULT_LIMIT,
    dryRun: false,
    includeStale: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--help':
      case '-h':
        parsed.help = true;
        break;

      case '--dry-run':
        parsed.dryRun = true;
        break;

      case '--include-stale':
        parsed.includeStale = true;
        break;

      case '--limit': {
        const value = argv[index + 1];
        index += 1;

        if (value === undefined) throw new DrainUsageError('--limit needs a number');

        const limit = Number(value);

        if (!Number.isInteger(limit) || limit < 1 || limit > DRAIN_MAX_LIMIT) {
          throw new DrainUsageError(
            `--limit must be a whole number between 1 and ${String(DRAIN_MAX_LIMIT)}`,
          );
        }

        parsed.limit = limit;
        break;
      }

      default:
        throw new DrainUsageError(`unrecognised option "${String(arg)}"`);
    }
  }

  return parsed;
}

/**
 * The run, as an operator reads it in a log at three in the morning.
 *
 * Every number is one this run actually produced. A run with failures does not
 * print the word "complete" on its own — the counts are the report, and the
 * exit code carries the verdict.
 */
export function formatDrainSummary(summary: DrainSummary): string {
  const lines: string[] = [];

  lines.push(summary.dryRun ? 'Notification drain — DRY RUN' : 'Notification drain');

  /**
   * Said on its own line, every time, in both modes.
   *
   * A drain that reports "8 sent" while configured with the mock provider has
   * delivered nothing at all, and an operator reading a log is entitled to not
   * have to infer that from configuration they cannot see.
   */
  lines.push(
    summary.provider === 'mock'
      ? 'Provider:      mock — messages are recorded, nothing is delivered'
      : `Provider:      ${summary.provider}`,
  );

  if (summary.dryRun) {
    lines.push(`Eligible:      ${String(summary.claimed)} (nothing was claimed or sent)`);
    // No "Remaining" line: a dry run did no work, so everything eligible is
    // still there and printing a second number for it invites the reading that
    // some of it was dealt with.
  } else {
    lines.push(`Claimed:       ${String(summary.claimed)}`);
    lines.push(`Sent:          ${String(summary.sent)}`);
    lines.push(`Failed:        ${String(summary.failed)}`);
    lines.push(`Skipped:       ${String(summary.skipped)}  (claimed elsewhere first)`);
    lines.push(`Remaining:     ${String(summary.remaining)}`);
  }

  if (summary.staleWaiting > 0) {
    lines.push(
      `Stale:         ${String(summary.staleWaiting)} stuck in SENDING — not touched. ` +
        'Retry them from /admin/notifications, or pass --include-stale.',
    );
  }

  for (const failure of summary.failures) {
    lines.push(`  failed ${failure.id}: ${failure.reason}`);
  }

  return lines.join('\n');
}
