import { escapeRegex } from '../../validators/common';

/**
 * Deterministic relevance scoring.
 *
 * This is the whole ranking system, and it is ordinary code on purpose. A model
 * is good at reading "something comfortable for the office under ₹3,000" and
 * saying which catalogue fields that means; it is a poor and expensive way to
 * decide whether a shoe outranks a sandal, because the answer would change
 * between two identical searches and no one could explain either one.
 *
 * So the split is: the model interprets, this file ranks. Every number below is
 * visible, every input is a catalogue field, and the same query against the
 * same catalogue always produces the same order.
 */

/** What scoring needs from a product. A subset of the list projection. */
export interface RankableProduct {
  id: string;
  name: string;
  shortDescription?: string;
  tags?: string[];
  brand?: { name?: string } | null;
  category?: { name?: string } | null;
  colors?: { name?: string }[];
  price: number;
  rating?: number;
  reviewCount?: number;
  stock?: number;
}

export interface RelevanceInput {
  /** The free-text part of the search, already separated from the filters. */
  terms: string;
  /** A colour the shopper asked for, if any. */
  color?: string;
  /** The budget, used to reward products that sit comfortably inside it. */
  maxPrice?: number;
}

/**
 * The weights.
 *
 * Ordered by how strong a claim each signal makes that this is the product the
 * shopper meant. A name match is near-certain; a word appearing somewhere in a
 * description is weak evidence and is weighted accordingly. Quality and
 * availability adjust the order among products that match equally well — they
 * never promote an irrelevant product above a relevant one, which is why the
 * largest of them is smaller than a single name-token hit.
 */
export const WEIGHTS = {
  /** The whole query appears in the product name: "air max" in "Air Max Heritage Runner". */
  phraseInName: 6,
  /** Every word of the query appears in the name, in any order. */
  allTermsInName: 3,
  /** Per word, for the fields below. Capped by the number of query words. */
  termInName: 1.5,
  termInTags: 1,
  termInBrand: 0.9,
  termInCategory: 0.9,
  termInDescription: 0.35,
  /** The product genuinely offers the colour that was asked for. */
  colorMatch: 1.2,
  /** Scaled by rating/5, and only once a product has been reviewed at all. */
  rating: 1,
  /** Comfortably inside the stated budget rather than at its ceiling. */
  priceFit: 0.5,
  inStock: 0.4,
  /** Sold out. Still shown — the shopper asked for it — but never near the top. */
  outOfStock: -3,
} as const;

/**
 * Words that carry no meaning in a product search.
 *
 * They matter more than they look. Product copy is full of them, so a search
 * that keeps "this" or "for" as a term will match a product because its
 * description contains the word "this" — which is how a nonsense query comes
 * back with a confident-looking result. Dropping them is also what lets
 * "comfortable shoes for the office" behave like "comfortable shoes office"
 * rather than demanding a product whose text contains the word "for".
 */
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'these',
  'those',
  'are',
  'was',
  'were',
  'you',
  'your',
  'our',
  'its',
  'has',
  'have',
  'had',
  'but',
  'not',
  'all',
  'any',
  'can',
  'get',
  'got',
  'out',
  'off',
  'per',
  'via',
  'into',
  'onto',
  'than',
  'then',
  'them',
  'they',
  'their',
  'there',
  'here',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'how',
  'some',
  'more',
  'most',
  'much',
  'very',
  'just',
  'also',
  'like',
  'want',
  'need',
  'looking',
  'show',
  'find',
  'give',
  'please',
  'something',
  'anything',
  'about',
]);

/**
 * Splits a query into the words worth matching on.
 *
 * Stop words are dropped — unless that would leave nothing, in which case the
 * words are kept: a search for "the who" should still look for something.
 */
export function tokenize(value: string): string[] {
  const words = [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .filter((token) => token.length > 1),
    ),
  ];

  const meaningful = words.filter((token) => !STOP_WORDS.has(token));
  return meaningful.length > 0 ? meaningful : words;
}

/**
 * The singular form of a word, when stripping a trailing "s" is safe.
 *
 * Kept in step with the search filter's own pattern: what the query matched on
 * must be what the ranking scores on, or a product can be returned by the
 * filter and then scored as though it matched nothing.
 */
export function stem(token: string): string {
  return token.length >= 4 && token.endsWith('s') ? token.slice(0, -1) : token;
}

const contains = (haystack: string | undefined, token: string): boolean =>
  haystack !== undefined && haystack.toLowerCase().includes(stem(token));

/**
 * Scores one product against one query.
 *
 * Exported so it can be tested directly and so the ranking can be explained
 * without running a search.
 */
export function scoreProduct(product: RankableProduct, input: RelevanceInput): number {
  const tokens = tokenize(input.terms);
  const name = product.name.toLowerCase();
  const phrase = input.terms.trim().toLowerCase();

  let score = 0;

  if (phrase.length > 2 && name.includes(phrase)) score += WEIGHTS.phraseInName;

  if (tokens.length > 0 && tokens.every((token) => name.includes(stem(token)))) {
    score += WEIGHTS.allTermsInName;
  }

  const tags = (product.tags ?? []).join(' ').toLowerCase();

  for (const token of tokens) {
    if (name.includes(stem(token))) score += WEIGHTS.termInName;
    if (tags.includes(stem(token))) score += WEIGHTS.termInTags;
    if (contains(product.brand?.name, token)) score += WEIGHTS.termInBrand;
    if (contains(product.category?.name, token)) score += WEIGHTS.termInCategory;
    if (contains(product.shortDescription, token)) score += WEIGHTS.termInDescription;
  }

  if (input.color) {
    /**
     * Matched the same way the filter matches it — on a word boundary, so
     * "Black" credits a "Triple Black" colourway. If these two disagreed, a
     * product could pass the colour filter and then be ranked as though it had
     * not, which is the kind of mismatch that makes a ranking look random.
     */
    const wanted = new RegExp(`\\b${escapeRegex(input.color)}\\b`, 'i');
    if ((product.colors ?? []).some((color) => color.name && wanted.test(color.name))) {
      score += WEIGHTS.colorMatch;
    }
  }

  /**
   * Rating contributes only once a product has been reviewed. An unrated
   * product scores zero here rather than negative — it is new, not bad, and
   * Phase 8 was careful to make that distinction everywhere else too.
   */
  if ((product.reviewCount ?? 0) > 0) {
    score += ((product.rating ?? 0) / 5) * WEIGHTS.rating;
  }

  /**
   * A small reward for sitting inside a stated budget with room to spare.
   * Anything above the budget was already excluded by the filter, so this only
   * separates "₹2,000 of a ₹3,000 budget" from "₹2,999 of it".
   */
  if (input.maxPrice && input.maxPrice > 0) {
    const headroom = 1 - Math.min(product.price, input.maxPrice) / input.maxPrice;
    score += headroom * WEIGHTS.priceFit;
  }

  score += (product.stock ?? 0) > 0 ? WEIGHTS.inStock : WEIGHTS.outOfStock;

  return score;
}

/**
 * Ranks a candidate set.
 *
 * The tiebreakers matter as much as the score. Two products that match a query
 * equally well must come back in the same order on every request, or paging
 * through results would show the same product twice and skip another — so ties
 * fall through to price and then to the product id, which is stable and unique.
 */
export function rankByRelevance<T extends RankableProduct>(
  products: T[],
  input: RelevanceInput,
): T[] {
  const scored = products.map((product) => ({ product, score: scoreProduct(product, input) }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.product.price !== b.product.price) return a.product.price - b.product.price;
    return a.product.id.localeCompare(b.product.id);
  });

  return scored.map((entry) => entry.product);
}
