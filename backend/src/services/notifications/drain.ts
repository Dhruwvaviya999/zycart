import type { Types } from 'mongoose';
import { emailConfig, STALE_SENDING_MS } from '../../config/notifications';
import { logger } from '../../utils/logger';
import type { Env } from '../../config/env';
import { NotificationDelivery } from '../../models/notification-delivery.model';
import { deliverForDrain, eligibleForDrain, staleSendingBefore } from './notification.service';
import { getEmailProvider } from './runtime';
import { SECRET_BEARING_EVENTS } from './templates';

/**
 * Recovering the messages a crash stranded.
 *
 * ## The gap this closes
 *
 * Phase 14 attempts delivery in the request that caused the transition, after
 * its transaction commits. That is deliberate — it keeps a mail server off the
 * commerce critical path — and it leaves exactly one hole:
 *
 *     transaction commits
 *     ↓
 *     process crashes, or is redeployed
 *     ↓
 *     the message was never attempted
 *
 * The delivery sits at PENDING with `attempts: 0` and nothing picks it up.
 * Phase 14 documented that rather than hiding it. This is the fix, and it is
 * the smallest thing that could work: a finite command, run by cron.
 *
 * ## What it is not
 *
 * It is **not a worker**. There is no `while (true)`, no lease renewal, no
 * scheduler and no broker. It claims a bounded amount of work, does it, reports
 * what happened and exits. Everything that makes concurrent execution safe is
 * already in the database — the atomic claim that Phase 14 built for the admin
 * retry button — so two drains overlapping is not a case this file has to
 * reason about beyond treating "somebody else took it" as ordinary.
 *
 * It is **not a second retry policy**. Each eligible message gets exactly one
 * attempt per run. The next scheduled run is the retry, and the automatic
 * attempt budget still bounds how many times a message is tried in total.
 */

/**
 * How much work one run may take on.
 *
 * Bounded so a drain is a short, predictable command rather than something that
 * could spend an hour holding a mail server's attention. Fifty messages at a
 * few seconds each is already far more than a store of this size strands
 * between two cron ticks; a backlog larger than that is an incident, and the
 * next run picks up where this one stopped. The ceiling exists so that
 * `--limit` cannot be used to turn a finite command into an open-ended one.
 */
export const DRAIN_DEFAULT_LIMIT = 50;
export const DRAIN_MAX_LIMIT = 500;

/**
 * How many ids are read from the database at a time.
 *
 * Smaller than the limit on purpose: the set of eligible rows changes while the
 * drain works through it — other drains claim some, attempts move others out of
 * eligibility — so re-reading in pages keeps the view fresh without loading the
 * whole collection into memory.
 */
const PAGE_SIZE = 25;

export interface DrainOptions {
  /** Upper bound on messages attempted in this run. */
  limit: number;
  /** Also reclaim SENDING rows abandoned longer than the stale threshold. */
  includeStale: boolean;
  /** Report eligible work without claiming or sending anything. */
  dryRun: boolean;
}

export interface DrainSummary {
  /** Which transport this run would have used. `mock` delivers nothing. */
  provider: string;
  dryRun: boolean;
  includeStale: boolean;
  limit: number;
  /** Rows this run successfully took ownership of. */
  claimed: number;
  sent: number;
  failed: number;
  /**
   * Rows that were listed as eligible and then were not claimable — almost
   * always another drain, an administrator or the original request getting
   * there first. Expected under concurrency, and not an error.
   */
  skipped: number;
  /**
   * Abandoned SENDING rows this run did **not** touch, because
   * `includeStale` was off. The number an operator needs in order to know a
   * decision is waiting for them.
   */
  staleWaiting: number;
  /** Eligible rows left over because the limit was reached. */
  remaining: number;
  /** One line per failure, for the operator. Never a credential. */
  failures: { id: string; reason: string }[];
}

const emptySummary = (options: DrainOptions, provider: string): DrainSummary => ({
  provider,
  dryRun: options.dryRun,
  includeStale: options.includeStale,
  limit: options.limit,
  claimed: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  staleWaiting: 0,
  remaining: 0,
  failures: [],
});

/**
 * How many abandoned SENDING rows are sitting there.
 *
 * Counted even when `includeStale` is off — especially then. A row in SENDING
 * that nothing will ever touch again is the one genuinely stuck state this
 * subsystem has, and a drain that quietly ignored it would leave an operator
 * with no way to find out.
 */
async function countStale(now: Date): Promise<number> {
  const before = staleSendingBefore(now);

  /**
   * Secret-bearing messages are left out, as the drain's own eligibility leaves
   * them out: their link died with the process that was sending them, so no
   * command and no operator can do anything with one, and counting it would
   * report the same unfixable row on every run for ever.
   */
  const stuck = {
    status: 'SENDING' as const,
    lastAttemptAt: { $lt: before },
    event: { $nin: [...SECRET_BEARING_EVENTS] },
  };

  const count = await NotificationDelivery.countDocuments(stuck);

  /**
   * Logged only when there is something to say.
   *
   * A `notification_stale` line every five minutes reporting zero is how an
   * operator learns to filter the event out, and then misses the one run that
   * reports four. The oldest age is included because "three stale" and "three
   * stale, the oldest from six days ago" call for different responses.
   *
   * No recipient, no subject, no address — an id is enough to open the row in
   * the admin console, which is where the decision is actually made.
   */
  if (count > 0) {
    const oldest = await NotificationDelivery.findOne(stuck)
      .sort({ lastAttemptAt: 1 })
      .select('_id lastAttemptAt')
      .lean<{ _id: Types.ObjectId; lastAttemptAt?: Date }>();

    logger.warn('notification_stale', {
      count,
      staleAfterMs: STALE_SENDING_MS,
      oldestId: oldest ? String(oldest._id) : undefined,
      oldestAgeMs: oldest?.lastAttemptAt
        ? now.getTime() - oldest.lastAttemptAt.getTime()
        : undefined,
    });
  }

  return count;
}

/**
 * Works through the eligible backlog, once.
 *
 * ## Why each id is attempted at most once per run
 *
 * A temporary failure leaves a message PENDING with one more attempt spent, so
 * it would immediately be eligible again — and a loop that kept picking the
 * oldest eligible row would spend the whole run on one unreachable recipient
 * while a hundred others waited. Every id attempted is therefore excluded from
 * the next page, which is what makes a run a single pass over the backlog
 * rather than a retry loop over its first element. The next scheduled run is
 * the retry.
 *
 * ## Why a claim that fails is not a failure
 *
 * Between listing an id and claiming it, another drain may have taken it, an
 * administrator may have retried it, or the original request may have finally
 * completed. All three are correct outcomes; the row is somebody else's and
 * this run counts it as skipped and moves on.
 */
export async function drainNotifications(
  env: Env,
  options: DrainOptions,
): Promise<DrainSummary> {
  const now = new Date();
  const mode = options.includeStale ? 'drain-stale' : 'drain';
  const summary = emptySummary(options, emailConfig(env).provider);

  /**
   * The transport is built before a single row is claimed.
   *
   * A misconfigured drain that discovered its problem one message at a time
   * would spend an attempt on every pending delivery and push the whole backlog
   * to FAILED — turning a configuration mistake into data loss. Failing here
   * instead leaves every row exactly as it was, and the caller reports a
   * configuration error rather than a delivery one.
   *
   * A dry run skips it: reporting what is eligible needs no transport.
   */
  if (!options.dryRun) getEmailProvider(env);

  // Counted before the run as well as after, so an operator sees the decision
  // that is waiting for them even if the run itself does nothing.
  summary.staleWaiting = options.includeStale ? 0 : await countStale(now);

  const attempted: Types.ObjectId[] = [];

  while (attempted.length < options.limit) {
    const page = await eligibleForDrain(mode, Math.min(PAGE_SIZE, options.limit - attempted.length), {
      now,
      exclude: attempted,
    });

    if (page.length === 0) break;

    for (const id of page) {
      if (attempted.length >= options.limit) break;

      attempted.push(id);

      if (options.dryRun) {
        summary.claimed += 1;
        continue;
      }

      await attemptOne(env, id, mode, summary);
    }
  }

  return finish(summary, mode, options, now, attempted);
}

async function attemptOne(
  env: Env,
  id: Types.ObjectId,
  mode: 'drain' | 'drain-stale',
  summary: DrainSummary,
): Promise<void> {
  const outcome = await deliverForDrain(env, id, mode);

  switch (outcome.result) {
    case 'SENT':
      summary.claimed += 1;
      summary.sent += 1;
      return;

    case 'NOT_ELIGIBLE':
      summary.skipped += 1;
      return;

    case 'FAILED':
    case 'RETRYABLE':
      summary.claimed += 1;
      summary.failed += 1;
      // Bounded, so one bad night cannot produce a megabyte of output.
      if (summary.failures.length < 20) {
        summary.failures.push({ id: String(id), reason: outcome.reason });
      }
      return;
  }
}

/** Counts what a further run would still find. */
async function finish(
  summary: DrainSummary,
  mode: 'drain' | 'drain-stale',
  options: DrainOptions,
  now: Date,
  attempted: readonly Types.ObjectId[],
): Promise<DrainSummary> {
  /**
   * Deliberately a fresh read rather than arithmetic on what was processed.
   *
   * Messages are raised by ordinary traffic while a drain runs, and the honest
   * answer to "is there more?" is what the database says now — not what was
   * eligible when this run started. Rows this run already attempted are
   * excluded, because the next run is their retry, not this one.
   */
  const stillEligible = await eligibleForDrain(mode, options.limit + 1, {
    now,
    exclude: attempted,
  });

  summary.remaining = stillEligible.length;

  if (!options.includeStale) summary.staleWaiting = await countStale(now);

  return summary;
}
