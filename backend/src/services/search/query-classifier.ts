/**
 * Decides whether a search is worth a model call.
 *
 * This runs before every smart search and is the single biggest cost control in
 * the phase: "nike shoes" is the overwhelming majority of real searches, and
 * sending it to a model to be told it means "nike shoes" would add a second of
 * latency and a bill to the most common path in the store.
 *
 * The heuristics are deliberately small and readable. Getting one wrong is
 * cheap in both directions — a missed natural-language query still runs as a
 * keyword search and returns products, and an unnecessary model call is one
 * cheap request — so this is tuned to be obvious rather than clever. It is not
 * an intent classifier and should not grow into one.
 */

/** A budget or a price bound: "under 3000", "below ₹5,000", "less than 2k". */
const PRICE_INTENT = /\b(under|below|less than|cheaper than|up ?to|within|budget|around|max)\b/i;

/** Quality language that maps onto a rating floor rather than to keywords. */
const QUALITY_INTENT = /\b(highly|best|top|well)[- ]?(rated|reviewed)\b|\bgood reviews\b/i;

/** First-person shopping language — a sentence, not a product name. */
const SPEAKING_TO_SOMEONE =
  /\b(i|me|my|need|want|looking for|show me|find me|help me|suggest|recommend|something|anything)\b/i;

/** Purpose and occasion language, which only a reading of the sentence resolves. */
const PURPOSE_INTENT =
  /\b(for|suitable|good for|to wear|gift|office|travel|work|daily|everyday)\b/i;

const CURRENCY = /(₹|\brs\.?\b|\binr\b)/i;

/** Above this, a query is prose rather than a product name. */
const LONG_QUERY_WORDS = 5;

export type QueryKind = 'keyword' | 'natural_language';

export interface Classification {
  kind: QueryKind;
  /** Why, for the server log and for the tests. Never shown to a customer. */
  reason: string;
}

export function classifyQuery(query: string): Classification {
  const text = query.trim();
  const words = text.split(/\s+/).filter(Boolean);

  // Nothing to interpret, and nothing a model could add.
  if (words.length === 0) return { kind: 'keyword', reason: 'empty' };

  /**
   * One or two words is a product, a brand or a category. Even "black shoes",
   * which a model would happily decompose into a colour and a category, is
   * served perfectly well by the keyword search — the colour is in the product
   * text. Paying for interpretation here buys nothing.
   */
  if (words.length <= 2 && !CURRENCY.test(text)) {
    return { kind: 'keyword', reason: 'short query' };
  }

  if (PRICE_INTENT.test(text) && /\d/.test(text)) {
    return { kind: 'natural_language', reason: 'price intent' };
  }

  if (CURRENCY.test(text)) return { kind: 'natural_language', reason: 'currency' };
  if (QUALITY_INTENT.test(text)) return { kind: 'natural_language', reason: 'quality intent' };
  if (SPEAKING_TO_SOMEONE.test(text)) return { kind: 'natural_language', reason: 'sentence' };

  if (words.length >= LONG_QUERY_WORDS) {
    return { kind: 'natural_language', reason: 'long query' };
  }

  if (PURPOSE_INTENT.test(text)) return { kind: 'natural_language', reason: 'purpose intent' };

  return { kind: 'keyword', reason: 'no natural-language signal' };
}

export const looksNaturalLanguage = (query: string): boolean =>
  classifyQuery(query).kind === 'natural_language';
