import {
  CART_IDLE_MS,
  PAYMENT_GRACE_MS,
  REMINDERS_DEFAULT_LIMIT,
  REMINDERS_MAX_LIMIT,
  type ReminderSummary,
} from './reminders';

/**
 * The reminder command's surface: what it accepts, and how it reports.
 *
 * Separate from `utils/send-reminders.ts` for the reason the drain's is: that
 * file runs `main()` on import, and an argument parser should be testable
 * without opening a database connection.
 */

export class RemindersUsageError extends Error {}

export interface RemindersArgs {
  limit: number;
  dryRun: boolean;
  help: boolean;
}

const hours = (ms: number): string => String(Math.round(ms / 3_600_000));
const minutes = (ms: number): string => String(Math.round(ms / 60_000));

export const REMINDERS_USAGE = `
ZyCart — reminder emails

  Sends the two messages that are about something that did not happen: a
  signed-in customer's cart left untouched, and an online payment that failed
  and was not retried.

Usage
  pnpm reminders:send [options]

Options
  --limit <n>   Carts, and separately orders, to consider in this run.
                Default ${String(REMINDERS_DEFAULT_LIMIT)}, maximum ${String(REMINDERS_MAX_LIMIT)}.
  --dry-run     Report what would be sent. Writes nothing, sends nothing.
  --help, -h    This text.

What it sends
  Cart reminders    for carts untouched for ${hours(CART_IDLE_MS)} hours, at most once per change to
                    the cart and never to a customer who has switched them off.
  Payment reminders for online orders whose payment failed at least
                    ${minutes(PAYMENT_GRACE_MS)} minutes ago and is still unpaid. Once per order.

  Running it twice, or twice at once, sends nothing twice: every message has a
  unique key naming what it is about.

Exit codes
  0   ran
  1   could not run — bad configuration, no database

Scheduling
  Every fifteen minutes is ample:

    */15 * * * * cd /srv/zycart && pnpm reminders:send >> /var/log/zycart-reminders.log 2>&1

  That path is an example, not a configured one.
`.trim();

export function parseRemindersArgs(argv: readonly string[]): RemindersArgs {
  const args: RemindersArgs = { limit: REMINDERS_DEFAULT_LIMIT, dryRun: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--limit': {
        const value = argv[index + 1];
        const limit = Number(value);

        if (value === undefined || !Number.isInteger(limit) || limit < 1) {
          throw new RemindersUsageError('--limit needs a whole number of 1 or more');
        }
        if (limit > REMINDERS_MAX_LIMIT) {
          throw new RemindersUsageError(`--limit may be at most ${String(REMINDERS_MAX_LIMIT)}`);
        }

        args.limit = limit;
        index += 1;
        break;
      }
      default:
        throw new RemindersUsageError(`Unknown option: ${String(arg)}`);
    }
  }

  return args;
}

export function formatRemindersSummary(summary: ReminderSummary): string {
  const verb = summary.dryRun ? 'would queue' : 'queued';

  return [
    summary.dryRun ? 'Dry run — nothing was written or sent.' : 'Reminders',
    `  Carts     considered ${String(summary.carts.considered)} · ${verb} ${String(summary.carts.queued)} · skipped ${String(summary.carts.skipped)}`,
    `  Payments  considered ${String(summary.payments.considered)} · ${verb} ${String(summary.payments.queued)} · skipped ${String(summary.payments.skipped)}`,
  ].join('\n');
}
