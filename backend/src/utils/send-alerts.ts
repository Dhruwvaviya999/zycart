import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { loadEnv } from '../config/env';
import { configureObservability } from '../config/logging';
import { emailConfig } from '../config/notifications';
import { processAlerts } from '../services/alerts/alert.service';
import {
  ALERTS_USAGE,
  AlertsUsageError,
  formatAlertsSummary,
  parseAlertsArgs,
} from '../services/alerts/alerts-cli';

/**
 * Sends back-in-stock and price-drop alerts.
 *
 *   pnpm alerts:send
 *   pnpm alerts:send --dry-run
 *
 * The shell around `services/alerts`: parse, connect, run, report, exit — the
 * same shape as `reminders:send`, and scheduled the same way, by cron.
 */

const EXIT_CANNOT_RUN = 1;

async function main(): Promise<void> {
  let args;

  try {
    args = parseAlertsArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof AlertsUsageError ? `Error: ${error.message}\n` : String(error));
    console.error(ALERTS_USAGE);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  if (args.help) {
    console.log(ALERTS_USAGE);
    return;
  }

  const env = loadEnv();

  // Before anything can log, so every record is structured and redacted — this
  // command talks to a mail server, and SMTP errors quote credentials back.
  configureObservability(env);

  await connectDatabase(env.MONGODB_URI);

  try {
    const summary = await processAlerts(env, { limit: args.limit, dryRun: args.dryRun });

    console.log(formatAlertsSummary(summary));

    if (!args.dryRun && emailConfig(env).provider !== 'smtp') {
      console.log('Email provider is "mock": messages were recorded, and none were delivered.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  // The message, not the stack: a stack is noise in a cron log, and an error
  // from a mail transport is the one place a credential could surface.
  console.error(`Alert run failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(EXIT_CANNOT_RUN);
});
