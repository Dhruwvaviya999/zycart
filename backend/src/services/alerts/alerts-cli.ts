import { ALERTS_DEFAULT_LIMIT, ALERTS_MAX_LIMIT, type AlertSummary } from './alert.service';

/**
 * The alert command's surface: what it accepts, and how it reports.
 *
 * Separate from `utils/send-alerts.ts` for the reason the reminders' is: that
 * file runs `main()` on import, and an argument parser should be testable
 * without opening a database connection.
 */

export class AlertsUsageError extends Error {}

export interface AlertsArgs {
  limit: number;
  dryRun: boolean;
  help: boolean;
}

export const ALERTS_USAGE = `
ZyCart — stock and price alerts

  Tells customers about the products they asked to hear about: something
  that is back in stock, or something whose price has dropped below what it
  was when they asked.

Usage
  pnpm alerts:send [options]

Options
  --limit <n>   Alerts to answer in this run.
                Default ${String(ALERTS_DEFAULT_LIMIT)}, maximum ${String(ALERTS_MAX_LIMIT)}.
  --dry-run     Report what would be sent. Writes nothing, sends nothing.
  --help, -h    This text.

What it sends
  Back in stock   once per alert, when the product — or the colour and size
                  the customer chose — can be bought.
  Price drop      once per alert, when the price is below the one the customer
                  saw and the product can be bought.

  The console already runs this for one product straight after a restock, a
  price change or a resellable return. This command is what catches the rest:
  units returned by cancelled orders, and anything a restart interrupted.

  Running it twice, or twice at once, sends nothing twice: each alert is
  claimed before its message is recorded, and the message is keyed by the
  alert.

Exit codes
  0   ran
  1   could not run — bad configuration, no database

Scheduling
  Every fifteen minutes is ample:

    */15 * * * * cd /srv/zycart && pnpm alerts:send >> /var/log/zycart-alerts.log 2>&1

  That path is an example, not a configured one.
`.trim();

export function parseAlertsArgs(argv: readonly string[]): AlertsArgs {
  const args: AlertsArgs = { limit: ALERTS_DEFAULT_LIMIT, dryRun: false, help: false };

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
          throw new AlertsUsageError('--limit needs a whole number of 1 or more');
        }
        if (limit > ALERTS_MAX_LIMIT) {
          throw new AlertsUsageError(`--limit may be at most ${String(ALERTS_MAX_LIMIT)}`);
        }

        args.limit = limit;
        index += 1;
        break;
      }
      default:
        throw new AlertsUsageError(`Unknown option: ${String(arg)}`);
    }
  }

  return args;
}

export function formatAlertsSummary(summary: AlertSummary): string {
  const verb = summary.dryRun ? 'would queue' : 'queued';

  return [
    summary.dryRun ? 'Dry run — nothing was written or sent.' : 'Alerts',
    `  Products  ${String(summary.products)} with somebody waiting`,
    `  Alerts    ${verb} ${String(summary.queued)} · skipped ${String(summary.skipped)}`,
  ].join('\n');
}
