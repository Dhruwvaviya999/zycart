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

/**
 * The single active item, or `null` where the current URL is not part of the
 * primary navigation at all — the cart and the account pages, for instance,
 * which have their own controls in the header and should not borrow Shop's.
 */
export function activeNavLabel(items: NavLink[], location: NavLocation): string | null {
  let best: { label: string; score: number } | null = null;

  for (const item of items) {
    if (!item.match) continue;
    const score = matchScore(item.match, location);
    if (score === null) continue;
    if (!best || score > best.score) best = { label: item.label, score };
  }

  return best?.label ?? null;
}
