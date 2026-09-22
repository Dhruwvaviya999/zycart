import type { NavLink, NavMatch } from '@/data/navigation';

/**
 * Which primary navigation item the current URL belongs to.
 *
 * The rule the indicator used to follow was "the item whose href has no query
 * or hash and whose href equals the pathname". That is one line and it is
 * wrong in four ways at once: `Deals` and `New Arrivals` — both filtered views
 * of `/shop` — could never light up however you got to them, `Categories`
 * could never light up at all, a product page dropped the indicator entirely
 * even though a product is inside the shop, and nothing described what should
 * happen when two items both have a claim on the same URL.
 *
 * So the rule is no longer inferred from the href. Each item declares what it
 * matches, and the URL picks the winner by score: an exact pathname beats a
 * prefix, and every search param or hash the item names on top of that beats
 * an item that named fewer. `/shop?sort=discount` therefore resolves to Deals
 * rather than Shop, while `/shop?category=shoes` stays Shop, because Deals
 * asked for a `sort` this URL does not have.
 *
 * There is no state here and nothing to keep in sync: the location is the only
 * input, so a client navigation, a refresh, a pasted URL and the back button
 * all arrive at the same answer by the same route.
 */
export interface NavLocation {
  pathname: string;
  /** Anything with `get` — `URLSearchParams` and Next's read-only wrapper both fit. */
  params: Pick<URLSearchParams, 'get'>;
  /** Includes the leading `#`, or is empty. */
  hash: string;
}

/** `null` means "does not match"; a number is how specific the match is. */
export function matchScore(match: NavMatch, location: NavLocation): number | null {
  let score: number | null = null;

  if (match.paths?.includes(location.pathname)) {
    score = 4;
  } else if (match.prefixes?.some((prefix) => isUnder(location.pathname, prefix))) {
    score = 1;
  }

  if (score === null) return null;

  // Every named param has to be present *and* equal. A partial match is a
  // different view of the same page, not this one.
  for (const [key, value] of Object.entries(match.query ?? {})) {
    if (location.params.get(key) !== value) return null;
    score += 2;
  }

  if (match.hash !== undefined) {
    if (location.hash !== match.hash) return null;
    score += 2;
  }

  return score;
}

/** True for the path itself and for anything nested under it — never for `/shopping`. */
function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Anything with a `match` can be scored — the primary nav, the account rail. */
interface Matchable {
  match?: NavMatch;
}

/**
 * The single active item, or `null` where the current URL is not part of this
 * navigation at all — the cart, for instance, which has its own control in the
 * header and should not borrow Shop's.
 *
 * Generic over the item, because the primary nav and the account rail draw
 * themselves differently and key off different fields, but must not disagree
 * about *which* item is current.
 */
export function activeNavItem<T extends Matchable>(items: T[], location: NavLocation): T | null {
  let best: { item: T; score: number } | null = null;

  for (const item of items) {
    if (!item.match) continue;
    const score = matchScore(item.match, location);
    if (score === null) continue;
    if (!best || score > best.score) best = { item, score };
  }

  return best?.item ?? null;
}

export function activeNavLabel(items: NavLink[], location: NavLocation): string | null {
  return activeNavItem(items, location)?.label ?? null;
}

/**
 * For navigations whose destinations are plain paths.
 *
 * The account rail has no query- or hash-scoped entries, so it needs neither
 * `useSearchParams` nor the Suspense boundary that comes with it — but it does
 * need the same nesting rule, which is the whole reason it shares this module
 * rather than testing `pathname === href` for itself.
 */
export function activePathItem<T extends Matchable>(items: T[], pathname: string): T | null {
  return activeNavItem(items, { pathname, params: EMPTY_PARAMS, hash: '' });
}

const EMPTY_PARAMS: Pick<URLSearchParams, 'get'> = { get: () => null };
