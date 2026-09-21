import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_AUTOMATIC_ATTEMPTS, STALE_SENDING_MS } from '../src/config/notifications';
import {
  DRAIN_DEFAULT_LIMIT,
  DRAIN_MAX_LIMIT,
  type DrainSummary,
} from '../src/services/notifications/drain';
import {
  DRAIN_USAGE,
  DrainUsageError,
  formatDrainSummary,
  parseDrainArgs,
} from '../src/services/notifications/drain-cli';

/**
 * The drain command's surface.
 *
 * What a drain *does* to a database — claim, send, skip, recover a stale row —
 * cannot be decided without one, and is verified against a real replica set in
 * `verify-notifications.ts`, including two drains racing each other. What can
 * be decided here is everything an operator actually interacts with: the
 * arguments it accepts, the arguments it refuses, and whether its output can be
 * misread.
 *
 * The last of those matters more than it sounds. A drain that prints "8 sent"
 * while configured with the mock provider has delivered nothing, and an
 * operator reading a cron log has no other way to find that out.
 */

const summary = (overrides: Partial<DrainSummary> = {}): DrainSummary => ({
  provider: 'smtp',
  dryRun: false,
  includeStale: false,
  limit: DRAIN_DEFAULT_LIMIT,
  claimed: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  staleWaiting: 0,
  remaining: 0,
  failures: [],
  ...overrides,
});

/* ---------------------------------------------------------------- */

describe('Drain arguments', () => {
  it('defaults to a bounded run that sends nothing it should not', () => {
    const args = parseDrainArgs([]);

    assert.equal(args.limit, DRAIN_DEFAULT_LIMIT);
    assert.equal(args.dryRun, false);
    // The dangerous option is off unless asked for. See `--include-stale`.
    assert.equal(args.includeStale, false);
    assert.equal(args.help, false);
  });

  it('reads the flags it documents', () => {
    const args = parseDrainArgs(['--dry-run', '--include-stale', '--limit', '7']);

    assert.equal(args.dryRun, true);
    assert.equal(args.includeStale, true);
    assert.equal(args.limit, 7);
  });

  for (const flag of ['--help', '-h']) {
    it(`treats ${flag} as a request for the usage text`, () => {
      assert.equal(parseDrainArgs([flag]).help, true);
    });
  }

  it('accepts the maximum limit and refuses one past it', () => {
    assert.equal(parseDrainArgs(['--limit', String(DRAIN_MAX_LIMIT)]).limit, DRAIN_MAX_LIMIT);
    assert.throws(() => parseDrainArgs(['--limit', String(DRAIN_MAX_LIMIT + 1)]), DrainUsageError);
  });

  for (const value of ['0', '-1', '1.5', 'all', '', 'NaN', 'Infinity', '1e3']) {
    it(`refuses --limit ${value || '(empty)'}`, () => {
      assert.throws(() => parseDrainArgs(['--limit', value]), DrainUsageError);
    });
  }

  it('refuses --limit with nothing after it', () => {
    assert.throws(() => parseDrainArgs(['--limit']), DrainUsageError);
  });

  /**
   * A cron entry with a typo in it has been silently doing something other than
   * what it says for as long as it has been installed. This command exists so
   * stranded work gets noticed; an ignored flag would be the same failure mode
   * one level up.
   */
  for (const flag of ['--force', '--all', '-x', 'drain', '--Dry-Run', '--limit=5']) {
    it(`refuses the unrecognised argument "${flag}"`, () => {
      assert.throws(() => parseDrainArgs([flag]), DrainUsageError);
    });
  }

  it('reports which argument it refused', () => {
    assert.throws(() => parseDrainArgs(['--nope']), /unrecognised option "--nope"/);
  });
});

/* ---------------------------------------------------------------- */

describe('The usage text', () => {
  it('states what the command will not do, not only what it will', () => {
    assert.match(DRAIN_USAGE, /does not retry FAILED deliveries/);
    assert.match(DRAIN_USAGE, /does not loop/);
  });

  it('warns that reclaiming a stale delivery can duplicate a message', () => {
    assert.match(DRAIN_USAGE, /second copy of the same\s+message/);
  });

  it('documents every exit code the command can produce', () => {
    for (const code of ['0', '1', '2']) {
      assert.match(DRAIN_USAGE, new RegExp(`^\\s{2}${code}\\s`, 'm'));
    }
  });

  it('gives a cron example and marks it as an example', () => {
    assert.match(DRAIN_USAGE, /\*\/5 \* \* \* \*/);
    assert.match(DRAIN_USAGE, /an example, not a configured one/);
  });

  it('names the configuration it needs and promises no secrets', () => {
    assert.match(DRAIN_USAGE, /EMAIL_PROVIDER/);
    assert.match(DRAIN_USAGE, /MONGODB_URI/);
    assert.match(DRAIN_USAGE, /No secret is printed/);
  });

  /** §92: the help text must not name a secret an operator could be tempted to echo. */
  it('mentions no credential variable', () => {
    for (const secretName of ['SMTP_PASSWORD', 'RAZORPAY_KEY_SECRET', 'JWT_SECRET']) {
      assert.ok(!DRAIN_USAGE.includes(secretName), `usage mentions ${secretName}`);
    }
  });

  it('agrees with the thresholds it describes', () => {
    assert.ok(DRAIN_USAGE.includes(String(DRAIN_DEFAULT_LIMIT)));
    assert.ok(DRAIN_USAGE.includes(String(DRAIN_MAX_LIMIT)));
    assert.ok(DRAIN_USAGE.includes(String(Math.round(STALE_SENDING_MS / 60_000))));
  });
});

/* ---------------------------------------------------------------- */

describe('Drain output', () => {
  /**
   * §60: a drain run against the mock provider must not read like a successful
   * delivery. This is the single most misreadable line the command can print.
   */
  it('says on its own line when nothing is actually being delivered', () => {
    const output = formatDrainSummary(summary({ provider: 'mock', claimed: 8, sent: 8 }));

    assert.match(output, /^Provider: +mock — messages are recorded, nothing is delivered$/m);
    assert.match(output, /Sent: +8/);
  });

  it('does not say that about a real transport', () => {
    const output = formatDrainSummary(summary({ provider: 'smtp', claimed: 8, sent: 8 }));

    assert.match(output, /^Provider: +smtp$/m);
    assert.ok(!output.includes('nothing is delivered'));
  });

  it('reports a dry run as eligible work rather than as work done', () => {
    const output = formatDrainSummary(summary({ dryRun: true, claimed: 3 }));

    assert.match(output, /DRY RUN/);
    assert.match(output, /Eligible: +3 \(nothing was claimed or sent\)/);
    // A dry run has no send outcome, so it must not print one — and no
    // "Remaining", which would invite the reading that some of it was dealt
    // with.
    assert.ok(!output.includes('Sent:'));
    assert.ok(!output.includes('Claimed:'));
    assert.ok(!output.includes('Remaining:'));
  });

  it('prints every count of a real run', () => {
    const output = formatDrainSummary(
      summary({ claimed: 5, sent: 3, failed: 2, skipped: 1, remaining: 4 }),
    );

    assert.match(output, /Claimed: +5/);
    assert.match(output, /Sent: +3/);
    assert.match(output, /Failed: +2/);
    assert.match(output, /Skipped: +1/);
    assert.match(output, /Remaining: +4/);
  });

  /**
   * §95: a report that claims success while messages failed is a report that
   * trains an operator to stop reading it.
   */
  it('never calls a run with failures complete', () => {
    const output = formatDrainSummary(summary({ claimed: 5, sent: 3, failed: 2 }));

    assert.ok(!/\bcomplete\b/i.test(output));
    assert.ok(!/\bsuccess/i.test(output));
  });

  it('surfaces abandoned deliveries with what to do about them', () => {
    const output = formatDrainSummary(summary({ staleWaiting: 2 }));

    assert.match(output, /Stale: +2 stuck in SENDING — not touched\./);
    assert.match(output, /--include-stale/);
    assert.match(output, /\/admin\/notifications/);
  });

  it('says nothing about stale deliveries when there are none', () => {
    assert.ok(!formatDrainSummary(summary({ sent: 1, claimed: 1 })).includes('Stale:'));
  });

  it('lists the reason for each failure', () => {
    const output = formatDrainSummary(
      summary({
        claimed: 1,
        failed: 1,
        failures: [{ id: '6aafc8838a06a152405fd014', reason: 'SMTP connection timed out.' }],
      }),
    );

    assert.match(output, /failed 6aafc8838a06a152405fd014: SMTP connection timed out\./);
  });

  /**
   * §92/§55: whatever the transport said, the line that reaches a log file is
   * one ZyCart wrote. The provider adapters already scrub credentials out of a
   * failure reason; this asserts the formatter adds no route around that by
   * printing anything other than the fields it is given.
   */
  it('prints only the reason it was handed', () => {
    const output = formatDrainSummary(
      summary({
        provider: 'smtp',
        claimed: 1,
        failed: 1,
        failures: [{ id: 'abc', reason: 'The mail server did not respond in time (SMTP timeout).' }],
      }),
    );

    for (const term of ['password', 'auth plain', 'secret']) {
      assert.ok(!output.toLowerCase().includes(term), `output contains "${term}"`);
    }
  });
});

/* ---------------------------------------------------------------- */

describe('Drain bounds', () => {
  it('has a default below its ceiling', () => {
    assert.ok(DRAIN_DEFAULT_LIMIT >= 1);
    assert.ok(DRAIN_DEFAULT_LIMIT < DRAIN_MAX_LIMIT);
  });

  /**
   * The ceiling is what stops `--limit` turning a finite command into an
   * open-ended one. It has to be a number a run can actually finish.
   */
  it('has a ceiling a single run could plausibly complete', () => {
    assert.ok(DRAIN_MAX_LIMIT <= 1_000);
  });

  /**
   * The drain must not be a second retry policy. One attempt per run means the
   * automatic budget still bounds how many times a message is tried in total —
   * so the two numbers have to stay independent, and the budget has to be the
   * smaller idea.
   */
  it('leaves the automatic attempt budget as the bound on total attempts', () => {
    assert.ok(MAX_AUTOMATIC_ATTEMPTS >= 1);
    assert.ok(MAX_AUTOMATIC_ATTEMPTS < DRAIN_DEFAULT_LIMIT);
  });

  it('treats a delivery as abandoned only well after any transport timeout', () => {
    // The SMTP transport's own ceilings are seconds; this is minutes.
    assert.ok(STALE_SENDING_MS >= 5 * 60_000);
  });
});
