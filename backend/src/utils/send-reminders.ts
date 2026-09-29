import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { loadEnv } from '../config/env';
import { configureObservability } from '../config/logging';
import { emailConfig } from '../config/notifications';
import { sendReminders } from '../services/reminders/reminders';
import {
  formatRemindersSummary,
  parseRemindersArgs,
  REMINDERS_USAGE,
  RemindersUsageError,
} from '../services/reminders/reminders-cli';

/**
 * Sends cart and failed-payment reminders.
 *
 *   pnpm reminders:send
 *   pnpm reminders:send --dry-run
 *
 * The shell around `services/reminders`: parse, connect, run, report, exit —
 * the same shape as `notifications:drain`, and scheduled the same way, by cron.
 */

const EXIT_CANNOT_RUN = 1;

async function main(): Promise<void> {
  let args;

  try {
    args = parseRemindersArgs(process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof RemindersUsageError ? `Error: ${error.message}\n` : String(error),
    );
    console.error(REMINDERS_USAGE);
    process.exitCode = EXIT_CANNOT_RUN;
    return;
  }

  if (args.help) {
    console.log(REMINDERS_USAGE);
    return;
  }

  const env = loadEnv();

  // Before anything can log, so every record is structured and redacted — this
  // command talks to a mail server, and SMTP errors quote credentials back.
  configureObservability(env);

  await connectDatabase(env.MONGODB_URI);

  try {
    const summary = await sendReminders(env, { limit: args.limit, dryRun: args.dryRun });

    console.log(formatRemindersSummary(summary));

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
  console.error(`Reminder run failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(EXIT_CANNOT_RUN);
});
