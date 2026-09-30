/**
 * The price limits a customer wrote, read without a model.
 *
 * "Find running shoes under ₹3,000" states a budget, and a budget is a
 * requirement: a shopper who says ₹3,000 has told the store what they will not
 * pay. The assistant's model is asked to pass it on as `maxPrice`, and usually
 * does — but "usually" is the problem. A model that finds nothing under the
 * budget is inclined to be helpful and search again without it, and every
 * product a search returns becomes a card in front of the customer. So the
 * limit is read here, from the customer's own words, and applied to every
 * search in that request whatever the model asked for (`limitToBudget`).
 *
 * ## Why it is strict about what counts
 *
 * A false budget is worse than a missed one: the model still reads the
 * sentence, so a budget this misses is usually still applied, while one it
 * invents filters out everything the customer wanted. So a number counts only
 * after a price word ("under", "below", "within", "over"…), only when it is
 * plausibly rupees — written with ₹/Rs/INR/rupees, or at least ₹100 — and never
 * when a unit follows it: "kids under 10", "under 200 grams" and "Under
 * Armour" are not budgets.
 */

export interface PriceBounds {
  minPrice?: number;
  maxPrice?: number;
}

const CURRENCY = String.raw`(?:₹|rs\.?|inr)`;

/** A number as people write prices: 3000, 3,000, 2,999.50, 3k, 1.5k, 2 lakh. */
const AMOUNT = String.raw`(${CURRENCY}\s*)?(\d[\d,]*(?:\.\d+)?)(?:\s*(k|thousand|lakhs?|lacs?)(?![a-z]))?(\s*(?:rupees|rs\.?|inr|/-)(?![a-z]))?`;

/** Words after a number that make it a measurement, an age or a size — not a price. */
const NOT_A_PRICE_AFTER =
  /^\s*(?:%|percent|g|gm|grams?|kg|kgs|mg|ml|l|ltr|litres?|liters?|cm|mm|m|inch(?:es)?|ft|feet|years?|yrs?|months?|mah|w|watts?|v|volts?|gb|tb|mb|mp|hz|px|people|persons?|pcs|pieces|pack|km|mins?|minutes?|hours?|hrs?|days?)\b/i;

const MAX_WORDS = String.raw`under|below|less than|cheaper than|lower than|up ?to|within|max(?:imum)?|at most|no more than|not more than|budget(?: of| is)?`;
const MIN_WORDS = String.raw`over|above|more than|at least|min(?:imum)?|starting (?:at|from)`;

const MAX_PATTERN = new RegExp(String.raw`\b(?:${MAX_WORDS})\s*(?:of\s+|is\s+)?${AMOUNT}`, 'gi');
const MIN_PATTERN = new RegExp(String.raw`\b(?:${MIN_WORDS})\s*${AMOUNT}`, 'gi');
const RANGE_PATTERN = new RegExp(
  String.raw`\b(?:between|from)\s*${AMOUNT}\s*(?:and|to|-|–)\s*${AMOUNT}`,
  'gi',
);
/** "₹3,000 or less", "3000 max". */
const TRAILING_MAX_PATTERN = new RegExp(
  String.raw`${AMOUNT}\s*(?:or less|or below|or under|max(?:imum)?)\b`,
  'gi',
);

const MULTIPLIER: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  lacs: 100_000,
};

/** Below this, a bare number is an age, a size or a count far more often than a price. */
const MIN_BARE_AMOUNT = 100;

/**
 * One amount from a match's groups, or null when it is not a price.
 *
 * `groups` is the four capture groups of `AMOUNT`, in order; `rest` is the
 * text after the whole match, checked for a unit that would make it a
 * measurement instead.
 */
function amountFrom(groups: (string | undefined)[], rest: string): number | null {
  const [currencyBefore, digits, unit, currencyAfter] = groups;
  if (!digits) return null;

  const value = Number.parseFloat(digits.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;

  const amount = Math.round(value * (unit ? (MULTIPLIER[unit.toLowerCase()] ?? 1) : 1));
  const hasCurrency = Boolean(currencyBefore ?? currencyAfter);

  // Glued to a word — "1080p", "5g", "50s" — it is a name, not a price.
  if (/^[a-z]/i.test(rest)) return null;

  if (!hasCurrency && !unit && NOT_A_PRICE_AFTER.test(rest)) return null;
  if (!hasCurrency && !unit && amount < MIN_BARE_AMOUNT) return null;

  return amount > 0 ? amount : null;
}

/**
 * The price limits in a message, or `{}` when it states none.
 *
 * When a message states more than one ceiling ("under 3000, or 5000 at a
 * push") the highest wins, and the lowest floor: reading too wide a budget
 * costs a product card, too narrow a one costs the answer.
 */
export function readBudget(text: string): PriceBounds {
  const maxima: number[] = [];
  const minima: number[] = [];
  const at = (match: RegExpExecArray) => text.slice(match.index + match[0].length);

  for (const match of text.matchAll(RANGE_PATTERN)) {
    const low = amountFrom(match.slice(1, 5), '');
    const high = amountFrom(match.slice(5, 9), at(match));

    if (low !== null && high !== null) {
      minima.push(Math.min(low, high));
      maxima.push(Math.max(low, high));
    }
  }

  for (const match of text.matchAll(MAX_PATTERN)) {
    const amount = amountFrom(match.slice(1, 5), at(match));
    if (amount !== null) maxima.push(amount);
  }

  for (const match of text.matchAll(TRAILING_MAX_PATTERN)) {
    const amount = amountFrom(match.slice(1, 5), '');
    if (amount !== null) maxima.push(amount);
  }

  for (const match of text.matchAll(MIN_PATTERN)) {
    const amount = amountFrom(match.slice(1, 5), at(match));
    if (amount !== null) minima.push(amount);
  }

  const bounds: PriceBounds = {};
  if (maxima.length > 0) bounds.maxPrice = Math.max(...maxima);
  if (minima.length > 0) bounds.minPrice = Math.min(...minima);

  // "over 5000 under 3000" contradicts itself; the ceiling is the part a
  // shopper is least willing to break.
  if (
    bounds.minPrice !== undefined &&
    bounds.maxPrice !== undefined &&
    bounds.minPrice > bounds.maxPrice
  ) {
    delete bounds.minPrice;
  }

  return bounds;
}

/**
 * The price range a search may use: what the model asked for, never wider
 * than what the customer wrote.
 *
 * `clamped` says whether the customer's budget changed anything, so the tool
 * can tell the model its search was held to it.
 */
export function limitToBudget(
  requested: PriceBounds,
  budget: PriceBounds,
): PriceBounds & { clamped: boolean } {
  let maxPrice = requested.maxPrice;
  let minPrice = requested.minPrice;

  if (budget.maxPrice !== undefined && (maxPrice === undefined || maxPrice > budget.maxPrice)) {
    maxPrice = budget.maxPrice;
  }

  if (budget.minPrice !== undefined && (minPrice === undefined || minPrice < budget.minPrice)) {
    minPrice = budget.minPrice;
  }

  // A floor from the model above the customer's ceiling is the model's
  // contradiction, not the customer's: the customer's words win.
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    minPrice =
      budget.minPrice !== undefined && budget.minPrice <= maxPrice ? budget.minPrice : undefined;
  }

  const clamped = maxPrice !== requested.maxPrice || minPrice !== requested.minPrice;

  return {
    ...(minPrice === undefined ? {} : { minPrice }),
    ...(maxPrice === undefined ? {} : { maxPrice }),
    clamped,
  };
}
