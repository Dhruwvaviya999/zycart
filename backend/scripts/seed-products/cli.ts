/**
 * Command-line options for `seed:products`.
 *
 * Hand-rolled rather than a dependency: a dozen flags do not justify one, and
 * the backend's dependency list is otherwise all runtime code.
 */

export interface CliOptions {
  count: number;
  seed: string;
  /** Whether the seed was chosen by the user (and so the run is reproducible by intent). */
  seedGiven: boolean;
  /** UTC midnight of the dataset's "today". */
  anchor: Date;
  clear: boolean;
  replaceAll: boolean;
  append: boolean;
  yes: boolean;
  withRatings: boolean;
  batchSize: number;
  dryRun: boolean;
  out: string | null;
  allowProduction: boolean;
  help: boolean;
}

export const MAX_COUNT = 50_000;

export const USAGE = `
Usage: pnpm seed:products [options]
       npm run seed:products -- [options]

Generates realistic synthetic products and bulk-inserts them into MongoDB.

Options:
  --count <n>        Products to generate (default 500, max ${MAX_COUNT}). 0 with --clear only clears.
  --seed <value>     Make the dataset reproducible. Same seed + count + date = same products.
                     Without it a random seed is chosen and printed.
  --date <YYYY-MM-DD>
                     The dataset's "today" (default: today, UTC). Product ages and the
                     new-arrival flag count back from it. Pin it for byte-identical reruns.
  --clear            Delete previously generated products (SKU prefix ZG-) first.
  --replace-all      Delete EVERY product first (including hand-written ones), with their
                     reviews, alerts, ledger rows and cart/wishlist entries. Requires --yes.
  --append           Add to existing generated products instead of refusing.
  --yes              Confirm a destructive --replace-all.
  --no-ratings       Leave products unrated (rating aggregates at zero).
  --batch-size <n>   Documents per insertMany call (default 500).
  --dry-run          Generate and validate only; never connects to MongoDB.
  --out <file>       Also write the generated dataset to a JSON file.
  --allow-production Permit running when NODE_ENV=production.
  -h, --help         Show this help.

Examples:
  pnpm seed:products --count 500 --clear
  pnpm seed:products --count 1000 --seed demo --clear
  pnpm seed:products --count 5000 --seed load-test --clear --batch-size 1000
  pnpm seed:products --count 50 --dry-run --out sample.json
`.trim();

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    count: 500,
    seed: '',
    seedGiven: false,
    anchor: todayUtc(),
    clear: false,
    replaceAll: false,
    append: false,
    yes: false,
    withRatings: true,
    batchSize: 500,
    dryRun: false,
    out: null,
    allowProduction: false,
    help: false,
  };

  // `npm run x -- --count 5` and `--count=5` are both accepted; a bare `--` is ignored.
  const tokens = argv
    .flatMap((token) =>
      token.startsWith('--') && token.includes('=') ? token.split(/=(.*)/s, 2) : [token],
    )
    .filter((token) => token !== '--');

  const valueOf = (flag: string, index: number): string => {
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
    return value;
  };
  const integerOf = (flag: string, raw: string, min: number, max: number): number => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`${flag} must be a whole number from ${min} to ${max}`);
    return value;
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const flag = tokens[i]!;
    switch (flag) {
      case '--count':
        options.count = integerOf(flag, valueOf(flag, i++), 0, MAX_COUNT);
        break;
      case '--seed':
        options.seed = valueOf(flag, i++);
        options.seedGiven = true;
        break;
      case '--date': {
        const raw = valueOf(flag, i++);
        const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(NaN);
        if (Number.isNaN(date.getTime())) throw new Error('--date must look like 2026-10-05');
        if (date > todayUtc()) throw new Error('--date cannot be in the future');
        options.anchor = date;
        break;
      }
      case '--batch-size':
        options.batchSize = integerOf(flag, valueOf(flag, i++), 1, 5_000);
        break;
      case '--out':
        options.out = valueOf(flag, i++);
        break;
      case '--clear':
        options.clear = true;
        break;
      case '--replace-all':
        options.replaceAll = true;
        break;
      case '--append':
        options.append = true;
        break;
      case '--yes':
        options.yes = true;
        break;
      case '--no-ratings':
        options.withRatings = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--allow-production':
        options.allowProduction = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
  }

  if (options.append && (options.clear || options.replaceAll))
    throw new Error('--append cannot be combined with --clear or --replace-all');
  if (options.count === 0 && !options.clear && !options.replaceAll && !options.help)
    throw new Error('--count 0 only makes sense with --clear or --replace-all');
  if (!options.seed) options.seed = randomSeed();

  return options;
}
