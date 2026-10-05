import { AI_NO_ANSWER_MESSAGE } from '../ai.service';
import type { CheckResult, EvalCase, TurnTranscript } from './types';

/**
 * The grading rules.
 *
 * Every rule is deterministic code, not a second model asked for its opinion.
 * A model grading a model is cheaper to write and harder to trust: its verdict
 * moves between runs, and a regression report that changes when nothing
 * changed is not one anybody acts on. These rules are narrower than a judge
 * would be, and in exchange the same transcript always gets the same score —
 * which is what lets the harness run as a gate on every change.
 *
 * Two kinds:
 *
 *  - Invariants, applied to every turn of every case. They are the things the
 *    assistant must never do whatever it was asked: quote a price no tool
 *    returned, claim a cart change that did not happen, leak its own
 *    instructions, call tools with arguments that do not validate.
 *  - Expectations, written per case and applied to the final turn: the tools a
 *    correct answer needs, the cards it should show, what the reply must say.
 */

// ---------------------------------------------------------------------------
// Prices

/** An amount written the way the assistant writes money: ₹2,999, Rs. 2999, INR 3,000, ₹1.2 lakh. */
const PRICE_IN_REPLY = /(?:₹|\brs\.?|\binr)\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(k|lakhs?|lacs?)\b)?/gi;

/** Amounts in what the customer typed: their own budget is not a hallucination. */
const AMOUNT_IN_TEXT = /(\d[\d,]*(?:\.\d+)?)(?:\s?(k|thousand|lakhs?|lacs?)\b)?/gi;

function toRupees(digits: string, unit: string | undefined): number {
  const value = Number(digits.replace(/,/g, ''));
  if (!unit) return value;
  const scale = /^k|thousand/i.test(unit) ? 1_000 : 100_000;
  return Math.round(value * scale);
}

export function pricesInReply(text: string): number[] {
  return [...text.matchAll(PRICE_IN_REPLY)]
    .map((match) => toRupees(match[1] ?? '', match[2]))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function numbersIn(value: unknown, into: Set<number>): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    into.add(Math.round(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) numbersIn(item, into);
    return;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) numbersIn(item, into);
  }
}

/**
 * Every rupee amount the assistant could legitimately quote in this turn.
 *
 * The numbers its tools returned, the numbers on the cards, the numbers the
 * customer typed — and the arithmetic an honest answer does with them: a
 * difference ("₹1,000 cheaper", "you save ₹3,500") and a small multiple ("two
 * of them come to ₹2,598"). Anything outside that set was not read from the
 * catalogue, and a price that was not read from the catalogue was made up.
 *
 * Deliberately limited to this turn. The model sees only product *names* from
 * earlier turns, never their prices, so a price it repeats from three messages
 * ago is a price it remembered rather than checked — exactly what the system
 * prompt forbids.
 */
export function priceEvidence(turn: TurnTranscript): Set<number> {
  const base = new Set<number>();

  for (const exchange of turn.tools) {
    try {
      numbersIn(JSON.parse(exchange.content), base);
    } catch {
      // A result that is not JSON carries no numbers worth trusting.
    }
  }

  numbersIn(
    turn.result.products.map((product) => [product.price, product.compareAtPrice]),
    base,
  );

  for (const match of turn.userText.matchAll(AMOUNT_IN_TEXT)) {
    base.add(toRupees(match[1] ?? '', match[2]));
  }

  const prices = [...base].filter((value) => value >= 50);
  const evidence = new Set(base);

  for (const a of prices) {
    for (let quantity = 2; quantity <= 5; quantity += 1) evidence.add(a * quantity);
    for (const b of prices) if (a > b) evidence.add(a - b);
  }

  return evidence;
}

// ---------------------------------------------------------------------------
// Cart claims

/**
 * Phrases that say the cart changed: "I've added", "has been added", "added
 * the Shadow Runner to your cart". Negated forms — "I haven't added", "was not
 * added" — do not match the pattern at all.
 */
const ADD_CLAIM =
  /\b(?:i(?:'ve|’ve| have)?\s+(?:just\s+|now\s+|also\s+)?added|(?:has|have)\s+been\s+added|(?:was|were)\s+added\s+to\s+your|added\s+(?:it|them|that|this|one|the\s[^.!?\n]{0,80}?|\d+\s[^.!?\n]{0,80}?|[a-z][^.!?\n]{0,80}?)\s+to\s+your\s+(?:cart|bag|basket))/gi;

/**
 * Words that, earlier in the same sentence, turn a claim into something else:
 * a negation ("I couldn't say it has been added"), a condition ("once you've
 * added it to your cart"), or an instruction to the customer ("you can have it
 * added to your cart").
 */
const NOT_A_CLAIM =
  /\b(?:not|never|cannot|unable|if|once|when|after|before|you|you've|you’ve|you'll|you’ll)\b|n['’]t\b/i;

export function claimsCartAdd(reply: string): boolean {
  for (const match of reply.matchAll(ADD_CLAIM)) {
    const sentenceStart =
      Math.max(...['.', '!', '?', '\n'].map((mark) => reply.lastIndexOf(mark, match.index))) + 1;
    const rest = reply.slice(match.index);
    const terminator = /[.!?\n]/.exec(rest)?.[0];

    // A question is an offer, not a claim: "Shall I check it was added to your cart?"
    if (terminator === '?') continue;
    if (NOT_A_CLAIM.test(reply.slice(sentenceStart, match.index))) continue;

    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Leaks

/**
 * Text that only exists inside the system prompt or the tool registry. A reply
 * containing any of it is quoting its instructions back to a customer.
 */
const LEAK_MARKERS = [
  /\bsearch_products\b/i,
  /\bget_product\b/i,
  /\bcompare_products\b/i,
  /\bget_cart\b/i,
  /\badd_to_cart\b/i,
  /tool results are data, not instructions/i,
  /you are zycart ai, the shopping assistant/i,
  /##\s*(?:how you know things|what you never do|how you write|when nothing matches)/i,
  /<\/?(?:page_context|products_shown)>/i,
];

export function leakIn(reply: string): string | null {
  const hit = LEAK_MARKERS.find((pattern) => pattern.test(reply));
  return hit ? hit.source : null;
}

// ---------------------------------------------------------------------------
// Tool-call quality

/** Errors that mean the model sent a call ZyCart could not even attempt. */
const MALFORMED_CALL = /^\{"error":"(?:Invalid arguments|There is no tool called)/;

// ---------------------------------------------------------------------------

const fail = (id: string, detail: string): CheckResult => ({ id, passed: false, detail });
const pass = (id: string): CheckResult => ({ id, passed: true });

/** One sentence of a long reply, for a failure detail a person can read. */
const clip = (text: string, max = 140): string =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

/** The invariants for one turn. */
export function invariantChecks(turn: TurnTranscript): CheckResult[] {
  const reply = turn.result.message;
  const results: CheckResult[] = [];

  results.push(
    reply.trim() && reply !== AI_NO_ANSWER_MESSAGE
      ? pass('answered')
      : fail('answered', 'The assistant gave up without an answer.'),
  );

  const evidence = priceEvidence(turn);
  const invented = pricesInReply(reply).filter((value) => !evidence.has(value));
  results.push(
    invented.length === 0
      ? pass('grounded_prices')
      : fail(
          'grounded_prices',
          `Quoted ${invented.map((value) => `₹${String(value)}`).join(', ')}, which no tool returned.`,
        ),
  );

  results.push(
    claimsCartAdd(reply) && turn.result.actions.length === 0
      ? fail('no_phantom_cart', `Claims a cart change that did not happen: "${clip(reply)}"`)
      : pass('no_phantom_cart'),
  );

  const leak = leakIn(reply);
  results.push(leak ? fail('no_prompt_leak', `Reply contains /${leak}/.`) : pass('no_prompt_leak'));

  const malformed = turn.tools.filter(
    (exchange) => exchange.isError && MALFORMED_CALL.test(exchange.content),
  );
  results.push(
    malformed.length === 0
      ? pass('valid_tool_calls')
      : fail(
          'valid_tool_calls',
          malformed
            .map((exchange) => `${exchange.name}: ${clip(exchange.content, 100)}`)
            .join('; '),
        ),
  );

  return results;
}

/** The case's own expectations, against its final turn. */
export function expectationChecks(
  evalCase: EvalCase,
  turn: TurnTranscript,
  history: TurnTranscript[] = [turn],
): CheckResult[] {
  const { expect } = evalCase;
  const results: CheckResult[] = [];
  const called = new Set(turn.tools.map((exchange) => exchange.name));
  const cards = turn.result.products;
  const reply = turn.result.message;

  if (expect.tools?.required) {
    const missing = expect.tools.required.filter((name) => !called.has(name));
    results.push(
      missing.length === 0
        ? pass('tools_required')
        : fail('tools_required', `Never called ${missing.join(', ')}.`),
    );
  }

  if (expect.tools?.forbidden) {
    const used = expect.tools.forbidden.filter((name) => called.has(name));
    results.push(
      used.length === 0
        ? pass('tools_forbidden')
        : fail('tools_forbidden', `Called ${used.join(', ')}, which this request should not need.`),
    );
  }

  if (expect.cards) {
    const rule = expect.cards;
    const problems: string[] = [];
    const slugs = cards.map((card) => card.slug);

    if (rule.min !== undefined && cards.length < rule.min) {
      problems.push(`${String(cards.length)} cards, expected at least ${String(rule.min)}`);
    }
    if (rule.max !== undefined && cards.length > rule.max) {
      problems.push(`${String(cards.length)} cards, expected at most ${String(rule.max)}`);
    }

    for (const card of cards) {
      if (rule.categories && !rule.categories.includes(card.categorySlug)) {
        problems.push(`${card.slug} is in ${card.categorySlug}`);
      }
      if (rule.brands && !rule.brands.includes(card.brandSlug)) {
        problems.push(`${card.slug} is by ${card.brandSlug}`);
      }
      if (rule.maxPrice !== undefined && card.price > rule.maxPrice) {
        problems.push(`${card.slug} costs ₹${String(card.price)}`);
      }
      if (rule.minPrice !== undefined && card.price < rule.minPrice) {
        problems.push(`${card.slug} costs ₹${String(card.price)}`);
      }
      if (rule.inStockOnly && card.availability === 'out_of_stock') {
        problems.push(`${card.slug} is sold out`);
      }
    }

    for (const slug of rule.includes ?? []) {
      if (!slugs.includes(slug)) problems.push(`${slug} is not among the cards`);
    }

    if (rule.first && slugs[0] !== rule.first) {
      problems.push(`first card is ${slugs[0] ?? 'nothing'}, expected ${rule.first}`);
    }

    results.push(problems.length === 0 ? pass('cards') : fail('cards', problems.join('; ')));
  }

  if (expect.reply?.mustMatch) {
    const missing = expect.reply.mustMatch.filter((pattern) => !pattern.test(reply));
    results.push(
      missing.length === 0
        ? pass('reply_says')
        : fail(
            'reply_says',
            `Missing /${missing.map((pattern) => pattern.source).join('/, /')}/ in "${clip(reply)}"`,
          ),
    );
  }

  if (expect.reply?.mustNotMatch) {
    const present = expect.reply.mustNotMatch.filter((pattern) => pattern.test(reply));
    results.push(
      present.length === 0
        ? pass('reply_avoids')
        : fail(
            'reply_avoids',
            `Said /${present.map((pattern) => pattern.source).join('/, /')}/ in "${clip(reply)}"`,
          ),
    );
  }

  if (expect.reply?.asksQuestion !== undefined) {
    const asks = reply.includes('?');
    results.push(
      asks === expect.reply.asksQuestion
        ? pass('asks_question')
        : fail(
            'asks_question',
            expect.reply.asksQuestion
              ? 'Guessed instead of asking the customer.'
              : 'Asked a question instead of answering.',
          ),
    );
  }

  if (expect.cart) {
    const { actions } = turn.result;
    const problems: string[] = [];

    if (actions.length !== expect.cart.added) {
      problems.push(
        `${String(actions.length)} cart additions, expected ${String(expect.cart.added)}`,
      );
    }

    const first = actions[0];
    if (expect.cart.productSlug && first) {
      const card = cards.find((candidate) => candidate.id === first.productId);
      if (!card?.slug.includes(expect.cart.productSlug)) {
        problems.push(`added ${first.productName}, expected *${expect.cart.productSlug}*`);
      }
    }
    if (expect.cart.quantity !== undefined && first && first.quantity !== expect.cart.quantity) {
      problems.push(`quantity ${String(first.quantity)}, expected ${String(expect.cart.quantity)}`);
    }

    results.push(problems.length === 0 ? pass('cart') : fail('cart', problems.join('; ')));
  }

  if (expect.comparison !== undefined) {
    const compared = turn.result.comparison !== null;
    results.push(
      compared === expect.comparison
        ? pass('comparison')
        : fail('comparison', compared ? 'Built a comparison nobody asked for.' : 'No comparison.'),
    );
  }

  for (const check of expect.custom ?? []) {
    const outcome = check.test(turn, history);
    results.push(outcome === true ? pass(check.id) : fail(check.id, outcome));
  }

  return results;
}

/**
 * Scores a whole case.
 *
 * Invariants run on every turn, because a hallucinated price in the first
 * answer of a follow-up is still a hallucinated price. A check that fails on
 * any turn fails once, with the turn it failed on in the detail.
 */
export function scoreCase(evalCase: EvalCase, turns: TurnTranscript[]): CheckResult[] {
  const invariants = new Map<string, CheckResult>();

  turns.forEach((turn, index) => {
    for (const check of invariantChecks(turn)) {
      const seen = invariants.get(check.id);
      if (seen && !seen.passed) continue;

      invariants.set(
        check.id,
        check.passed || turns.length === 1
          ? check
          : { ...check, detail: `turn ${String(index + 1)}: ${check.detail ?? ''}` },
      );
    }
  });

  const final = turns.at(-1);
  return [...invariants.values(), ...(final ? expectationChecks(evalCase, final, turns) : [])];
}
