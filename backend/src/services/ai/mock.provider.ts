import type {
  AiGenerateRequest,
  AiGenerateResponse,
  AiProvider,
  AiStructuredRequest,
  AiToolCall,
  AiToolSchema,
} from './provider';

/**
 * A provider that answers from a script instead of a model.
 *
 * Two jobs, both of them testing rather than shipping:
 *
 *  - Tests can assert that a tool refuses a forged product id, clamps a
 *    quantity or demands authentication without spending a model call or
 *    needing credentials. The rules being tested are ZyCart's, so a real model
 *    in the loop would only add nondeterminism to the assertion.
 *  - A contributor with no API key can still open the assistant and see the
 *    panel, the product cards and the error states behave.
 *
 * `AI_PROVIDER=mock` is refused in production by env validation — a scripted
 * assistant that looks real is worse than an honestly unavailable one.
 */

let nextId = 0;
const call = (name: string, input: Record<string, unknown>): AiToolCall => ({
  id: `mock_tool_${String((nextId += 1))}`,
  name,
  input,
});

/** The last thing the customer actually typed, lowercased. */
function lastUserText(request: AiGenerateRequest): string {
  for (let index = request.turns.length - 1; index >= 0; index -= 1) {
    const turn = request.turns[index];
    if (turn?.role === 'user') return turn.text.toLowerCase();
  }
  return '';
}

const OBJECT_ID = /[0-9a-f]{24}/;

/**
 * Product ids this conversation has already been shown, in the order shown.
 *
 * Read from two places, because a real model reads both: the tool results of
 * the current request, and the `<products_shown>` list the service rebuilds
 * into earlier assistant turns from ids the client echoed back. The second is
 * what makes "the second one" work across requests, so the mock has to follow
 * it or it could not stand in for a model on a follow-up.
 */
function seenProductIds(request: AiGenerateRequest): string[] {
  const ids: string[] = [];

  const add = (id: string | undefined) => {
    if (id && OBJECT_ID.test(id) && !ids.includes(id)) ids.push(id);
  };

  for (const turn of request.turns) {
    if (turn.role === 'assistant') {
      for (const match of turn.text.matchAll(/\(id: ([0-9a-f]{24})\)/g)) add(match[1]);
      continue;
    }

    if (turn.role !== 'tool_results') continue;

    for (const result of turn.results) {
      for (const match of result.content.matchAll(/"id":"([0-9a-f]{24})"/g)) add(match[1]);
    }
  }

  return ids;
}

const RUPEES = /(?:₹|rs\.?\s*|under\s+)(\d[\d,]*)/i;

function budgetFrom(text: string): number | undefined {
  const raw = RUPEES.exec(text)?.[1];
  if (!raw) return undefined;

  const value = Number(raw.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Describes what the tools returned on this request.
 *
 * Reads the current round's results rather than the conversation, so the reply
 * cannot claim products that an earlier turn mentioned and this one never
 * fetched — the same discipline the real assistant is held to by its prompt.
 */
function answerFrom(request: AiGenerateRequest): string {
  const last = request.turns.at(-1);
  if (last?.role !== 'tool_results') return 'What would you like to look for?';

  if (last.results.every((result) => result.isError)) {
    const first = last.results[0];
    return `I was not able to do that. (Mock provider relaying the tool: ${
      first ? readError(first.content) : 'refused'
    })`;
  }

  const summaries = last.results.map((result) => summarise(result.content));
  return summaries.join(' ');
}

/** Pulls the `error` field out of a tool result without trusting its shape. */
function readError(content: string): string {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      return String((parsed as { error: unknown }).error);
    }
  } catch {
    // Not JSON; fall through.
  }
  return 'refused';
}

/** One sentence about one tool result, from its shape alone. */
function summarise(content: string): string {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return 'Here is what I found.';
  }

  if (Array.isArray(parsed.products)) {
    const count = parsed.products.length;
    if (parsed.rows) return `Here is how those ${String(count)} compare.`;
    return count === 0
      ? 'I could not find anything matching that in the catalogue.'
      : `I found ${String(count)} ${count === 1 ? 'product' : 'products'} in the ZyCart catalogue.`;
  }

  if (parsed.added === true) {
    return `Added ${String((parsed.product as { name?: string } | undefined)?.name ?? 'it')} to your cart.`;
  }

  if (typeof parsed.itemCount === 'number') {
    return parsed.itemCount === 0
      ? 'Your cart is empty at the moment.'
      : `You have ${String(parsed.itemCount)} ${parsed.itemCount === 1 ? 'item' : 'items'} in your cart.`;
  }

  if (parsed.product) {
    return `Here are the details for ${String((parsed.product as { name?: string }).name ?? 'that product')}.`;
  }

  return 'Here is what I found.';
}

/**
 * Decides one turn the way a model roughly would: reach for a tool when the
 * request needs catalogue data, then answer once the results are in.
 *
 * The intents are tested in order of specificity, not convenience. "Add the
 * second one to my cart" names the cart, so a cart-reading rule that looked for
 * the word "cart" first would answer the wrong question — and would make the
 * mock a misleading stand-in for exactly the follow-up the real assistant is
 * most often asked.
 */
function scripted(request: AiGenerateRequest): AiGenerateResponse {
  const text = lastUserText(request);
  const seen = seenProductIds(request);

  // Results are in, so this turn is the answer rather than another request.
  if (!request.allowTools || request.turns.at(-1)?.role === 'tool_results') {
    return { text: answerFrom(request), toolCalls: [], stopReason: 'end' };
  }

  const asksToAdd = /\badd\b/.test(text) && /\b(cart|basket|bag)\b/.test(text);
  const asksToCompare = /\bcompare\b/.test(text);
  const asksAboutCart = /\b(cart|basket)\b/.test(text);

  if (asksToAdd && seen[0]) {
    const ordinal = /\bsecond\b/.test(text) ? 1 : /\bthird\b/.test(text) ? 2 : 0;

    return {
      text: '',
      toolCalls: [call('add_to_cart', { productId: seen[ordinal] ?? seen[0], quantity: 1 })],
      stopReason: 'tool_use',
    };
  }

  if (asksToCompare && seen.length >= 2) {
    return {
      text: '',
      toolCalls: [call('compare_products', { productIds: seen.slice(0, 2) })],
      stopReason: 'tool_use',
    };
  }

  if (asksAboutCart) {
    return { text: '', toolCalls: [call('get_cart', {})], stopReason: 'tool_use' };
  }

  if (text.trim().length === 0) {
    return {
      text: 'What are you shopping for, and roughly what budget did you have in mind?',
      toolCalls: [],
      stopReason: 'end',
    };
  }

  const maxPrice = budgetFrom(text);

  return {
    text: '',
    toolCalls: [
      call('search_products', {
        query: text.replace(RUPEES, '').trim().slice(0, 60),
        ...(maxPrice === undefined ? {} : { maxPrice }),
      }),
    ],
    stopReason: 'tool_use',
  };
}

/**
 * @param script Responses to return in order, for a test that needs an exact
 *   sequence. Once exhausted — or when omitted — the heuristic above takes over.
 */
/** Colour words the seeded catalogue actually uses, lowercased. */
const COLOURS = [
  'black',
  'white',
  'blue',
  'green',
  'grey',
  'gray',
  'red',
  'pink',
  'brown',
  'beige',
  'tan',
  'teal',
  'navy',
  'silver',
  'gold',
];

/** Words that mean "well reviewed" rather than a number. */
const HIGHLY_RATED =
  /\b(highly[- ]rated|best[- ]rated|top[- ]rated|well[- ]reviewed|good reviews)\b/g;
const IN_STOCK = /\b(in stock|available now|available)\b/g;
const CHEAPEST = /\b(cheapest|lowest price|budget)\b/g;

/**
 * A `/g` regex carries `lastIndex` between calls, so a module-level one shared
 * by `.test()` and `.replace()` silently starts the next request mid-string and
 * misses a match it found a moment ago. Resetting before each test is the fix.
 */
const has = (pattern: RegExp, text: string): boolean => {
  pattern.lastIndex = 0;
  return pattern.test(text);
};

/**
 * A deterministic stand-in for query interpretation.
 *
 * It reads the same hints a model would be asked to read — a budget, a colour,
 * a rating adjective, an availability request — and returns them as structured
 * fields. Crude compared with a model, and that is fine: its job is to let the
 * search pipeline, its validation and its fallbacks be tested end to end
 * without credentials, not to understand English.
 *
 * The result is filtered to the fields the caller's schema actually declares,
 * so the mock cannot invent a field the contract does not have.
 */
function interpret(prompt: string, schema: AiToolSchema): Record<string, unknown> {
  const text = prompt.toLowerCase();
  const out: Record<string, unknown> = {};

  const maxPrice = budgetFrom(text);
  if (maxPrice !== undefined) out.maxPrice = maxPrice;

  const colour = COLOURS.find((name) => new RegExp(`\\b${name}\\b`).test(text));
  if (colour) out.color = colour.charAt(0).toUpperCase() + colour.slice(1);

  if (has(HIGHLY_RATED, text)) out.minRating = 4;
  if (has(IN_STOCK, text)) out.inStock = true;
  if (has(CHEAPEST, text)) out.sort = 'price_asc';

  /**
   * Whatever is left after the parts that became filters. Stop words go too,
   * because "something for office use" should search for "office use" rather
   * than for the word "something".
   */
  const keywords = text
    .replace(RUPEES, ' ')
    .replace(new RegExp(`\\b(${COLOURS.join('|')})\\b`, 'g'), ' ')
    .replace(HIGHLY_RATED, ' ')
    .replace(IN_STOCK, ' ')
    .replace(CHEAPEST, ' ')
    .replace(
      /\b(i|need|want|looking|for|a|an|the|some|something|please|show|me|find|get|under|below|less|than|with|good|nice|and|to|my|in|of|that|is|are|can|you)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (keywords) out.query = keywords.slice(0, 60);

  const allowed = new Set(Object.keys(schema.properties));
  return Object.fromEntries(Object.entries(out).filter(([key]) => allowed.has(key)));
}

export function createMockProvider(script: AiGenerateResponse[] = []): AiProvider {
  const queued = [...script];

  return {
    name: 'mock',

    generate(request: AiGenerateRequest): Promise<AiGenerateResponse> {
      return Promise.resolve(queued.shift() ?? scripted(request));
    },

    generateStructured(request: AiStructuredRequest): Promise<unknown> {
      return Promise.resolve(interpret(request.prompt, request.schema));
    },
  };
}
