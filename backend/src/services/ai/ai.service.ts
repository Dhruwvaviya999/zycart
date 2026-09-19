import { AI_LIMITS, AI_UNAVAILABLE_MESSAGE } from '../../config/ai';
import { AppError } from '../../utils/AppError';
import * as productService from '../product.service';
import { productQuerySchema } from '../../validators/product.validator';
import type { AiChatInput, ClientMessage } from '../../validators/ai.validator';
import { buildSystemPrompt } from './prompts';
import { AiProviderError, type AiProvider, type AiToolResult, type AiTurn } from './provider';
import { executeTool, toolDefinitions, toolsFor, type AiTool } from './tools';
import type { AiProductView } from './tools/product-view';
import type { ToolContext } from './tools/types';

/**
 * The ZyCart AI service: system prompt, conversation, tool loop, safety limits.
 *
 * The controller above it is four lines. The provider below it performs one
 * model call and knows nothing about shopping. Everything that decides what the
 * assistant may do, how long it may take and what the customer gets back
 * happens here.
 */

export interface AiCartAction {
  type: 'cart_updated';
  productId: string;
  productName: string;
  quantity: number;
  selectedColor: string | null;
  selectedSize: string | null;
}

export interface AiComparison {
  productIds: string[];
  rows: { label: string; values: (string | null)[] }[];
}

export interface AiChatResult {
  message: string;
  /** Live catalogue data, assembled by the server — never parsed out of the reply. */
  products: AiProductView[];
  comparison: AiComparison | null;
  actions: AiCartAction[];
  /** Echoed back by the client on the next turn so "the second one" resolves. */
  productIds: string[];
}

export interface AiChatOptions {
  provider: AiProvider;
  userId: string | null;
  /** Aborted when the customer stops the response or the connection drops. */
  signal?: AbortSignal;
}

/** Said when the provider is throttling, which a retry usually fixes. */
const AI_BUSY_MESSAGE =
  'The shopping assistant is busy right now. Please try again in a few seconds.';

/** Said when the model spent its turns on tools and never reached an answer. */
const AI_NO_ANSWER_MESSAGE =
  'I looked, but I could not put an answer together for that. Could you try rephrasing it?';

const MAX_PRODUCT_CARDS = 12;

/**
 * Trims the submitted history to the window the model actually sees.
 *
 * The client may send more than this; it is not trusted to have trimmed
 * anything. Oldest turns go first, and a window that now opens on an assistant
 * turn has that turn dropped — a conversation has to start with the customer.
 */
export function trimHistory(messages: ClientMessage[]): ClientMessage[] {
  const window = messages.slice(-AI_LIMITS.maxMessages);

  let start = 0;
  while (start < window.length && window[start]?.role !== 'user') start += 1;

  return window.slice(start);
}

/**
 * Re-reads the products an earlier assistant turn showed.
 *
 * The client echoes back ids and nothing else — no names, no prices, no stock.
 * Those are read here from MongoDB, so a browser cannot put a stale price or a
 * fabricated product into the conversation, and an id that has since been
 * deleted or deactivated simply drops out of the transcript. Ids are not
 * sensitive: the worst a forged one can do is name a product the public
 * catalogue would have returned anyway, and every tool still validates its own.
 */
async function resolveReferencedNames(messages: ClientMessage[]): Promise<Map<string, string>> {
  const ids = [...new Set(messages.flatMap((message) => message.productIds ?? []))].slice(0, 60);

  if (ids.length === 0) return new Map();

  const { items } = await productService.listProducts(
    productQuerySchema.parse({ ids: ids.join(','), limit: 100 }),
  );

  return new Map(
    (items as { id?: string; name?: string }[])
      .filter(
        (item): item is { id: string; name: string } => Boolean(item.id) && Boolean(item.name),
      )
      .map((item) => [item.id, item.name]),
  );
}

/**
 * Builds the conversation the model receives.
 *
 * Client messages carry text and product ids. Everything else — the system
 * prompt, the product names, the page the customer is on — is added here from
 * server-side data, which is why `<page_context>` and `<products_shown>` mean
 * something: the validator strips those markers out of customer text, so the
 * only ones in the transcript are the ones this function put there.
 */
async function buildTurns(input: AiChatInput): Promise<AiTurn[]> {
  const history = trimHistory(input.messages);
  const names = await resolveReferencedNames(history);

  const turns: AiTurn[] = history.map((message) => {
    if (message.role === 'user') return { role: 'user', text: message.content };

    const shown = (message.productIds ?? [])
      .map((id) => ({ id, name: names.get(id) }))
      .filter((entry): entry is { id: string; name: string } => Boolean(entry.name));

    const text =
      shown.length === 0
        ? message.content
        : `${message.content}\n<products_shown>\n${shown
            .map((entry, index) => `${String(index + 1)}. ${entry.name} (id: ${entry.id})`)
            .join('\n')}\n</products_shown>`;

    return { role: 'assistant', text, toolCalls: [] };
  });

  /**
   * Product-page context. The browser sends an id; the product is read here.
   * Sending the product object itself would make a page a customer can leave
   * open for an hour the source of truth for its own price.
   */
  if (input.productId) {
    const last = turns.at(-1);

    if (last?.role === 'user') {
      try {
        const product = (await productService.getProduct(input.productId)) as {
          id?: string;
          name?: string;
        };

        if (product.name) {
          last.text = `${last.text}\n<page_context>The customer is looking at this product page: ${product.name} (id: ${String(product.id)}). Use get_product for its details.</page_context>`;
        }
      } catch {
        // A product that has gone since the page was opened is not worth
        // failing the whole conversation over — carry on without the context.
      }
    }
  }

  return turns;
}

/** Everything the loop gathers along the way, kept out of the loop body. */
interface Collected {
  shown: Map<string, AiProductView>;
  comparison: AiComparison | null;
  actions: AiCartAction[];
}

/** Reads the structured facts out of one tool result, never out of the prose. */
function collect(name: string, payload: unknown, into: Collected): void {
  if (name === 'compare_products') {
    const result = payload as {
      products?: { id?: string }[];
      rows?: { label: string; values: (string | null)[] }[];
    };

    into.comparison = {
      productIds: (result.products ?? []).map((product) => String(product.id)),
      rows: result.rows ?? [],
    };
    return;
  }

  if (name === 'add_to_cart') {
    const result = payload as {
      added?: boolean;
      product?: { id?: string; name?: string };
      quantityInCart?: number;
      selectedColor?: string | null;
      selectedSize?: string | null;
    };

    if (result.added === true && result.product?.id) {
      into.actions.push({
        type: 'cart_updated',
        productId: result.product.id,
        productName: result.product.name ?? '',
        quantity: result.quantityInCart ?? 1,
        selectedColor: result.selectedColor ?? null,
        selectedSize: result.selectedSize ?? null,
      });
    }
  }
}

/**
 * Runs one round of tool calls.
 *
 * Every call is charged against one budget, so a model that asks for six
 * searches in a single turn spends the request's whole allowance rather than
 * six rounds' worth. Calls past the budget are answered rather than silently
 * dropped — the assistant is told it has run out, so it answers with what it
 * already has instead of waiting for a result that will never arrive.
 */
async function runToolCalls(
  calls: { id: string; name: string; input: unknown }[],
  available: AiTool[],
  context: ToolContext,
  budget: { remaining: number },
  into: Collected,
): Promise<AiToolResult[]> {
  const results: AiToolResult[] = [];

  for (const call of calls) {
    if (budget.remaining <= 0) {
      results.push({
        toolCallId: call.id,
        name: call.name,
        content: JSON.stringify({
          error: 'No tool calls left for this request. Answer with what you already have.',
        }),
        isError: true,
      });
      continue;
    }

    budget.remaining -= 1;

    const outcome = await executeTool(call.name, call.input, context, available);
    if (!outcome.isError) collect(call.name, outcome.payload, into);

    results.push({
      toolCallId: call.id,
      name: call.name,
      content: JSON.stringify(outcome.payload),
      isError: outcome.isError,
    });
  }

  return results;
}

/** Maps a provider failure onto a calm, sanitised HTTP error. */
function toHttpError(error: AiProviderError): AppError {
  console.error(`[ai] provider failure (${error.kind}): ${error.message}`);
  return new AppError(error.kind === 'rate_limit' ? AI_BUSY_MESSAGE : AI_UNAVAILABLE_MESSAGE, 503);
}

export async function chat(input: AiChatInput, options: AiChatOptions): Promise<AiChatResult> {
  const authenticated = options.userId !== null;
  const available = toolsFor(authenticated);
  const definitions = toolDefinitions(available);
  const system = buildSystemPrompt({ authenticated });

  const collected: Collected = { shown: new Map(), comparison: null, actions: [] };
  const context: ToolContext = { userId: options.userId, shown: collected.shown };
  const budget = { remaining: AI_LIMITS.maxToolCalls };

  const turns = await buildTurns(input);

  /**
   * One deadline for the whole request, tool rounds included. Without it a
   * conversation that kept calling tools could stay inside the per-call timeout
   * indefinitely and still never answer.
   */
  const deadline = AbortSignal.timeout(AI_LIMITS.requestDeadlineMs);
  const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline;

  let message = '';
  let toolRoundsUsed = 0;

  try {
    for (let round = 0; round <= AI_LIMITS.maxToolRounds; round += 1) {
      // The last permitted round offers no tools, so the model has to answer.
      const allowTools =
        round < AI_LIMITS.maxToolRounds && budget.remaining > 0 && definitions.length > 0;

      const response = await options.provider.generate({
        system,
        turns,
        tools: definitions,
        allowTools,
        maxOutputTokens: AI_LIMITS.maxOutputTokens,
        signal,
      });

      /**
       * A policy decline. Nothing a shopping assistant is asked should reach
       * one, so it is treated as an unavailability rather than described — an
       * explanation would only be a longer way of saying the same thing.
       */
      if (response.stopReason === 'refusal') {
        console.warn('[ai] provider declined the request');
        throw new AppError(AI_UNAVAILABLE_MESSAGE, 503);
      }

      if (response.text) message = response.text;

      if (response.toolCalls.length === 0) break;

      toolRoundsUsed += 1;

      turns.push({
        role: 'assistant',
        text: response.text,
        toolCalls: response.toolCalls,
        raw: response.raw,
      });

      turns.push({
        role: 'tool_results',
        results: await runToolCalls(response.toolCalls, available, context, budget, collected),
      });
    }
  } catch (error) {
    if (error instanceof AiProviderError) throw toHttpError(error);
    if (error instanceof AppError) throw error;

    // A tool threw something that was not a business refusal — a database
    // outage, a bug. The customer is told the assistant is unavailable; the
    // detail stays in the log.
    console.error('[ai] request failed:', error);
    throw new AppError(AI_UNAVAILABLE_MESSAGE, 503);
  }

  const products = [...collected.shown.values()].slice(0, MAX_PRODUCT_CARDS);

  console.info(
    `[ai] ok session=${options.userId ? 'account' : 'guest'} rounds=${String(toolRoundsUsed)} ` +
      `tools=${String(AI_LIMITS.maxToolCalls - budget.remaining)} products=${String(products.length)}`,
  );

  return {
    message: message || AI_NO_ANSWER_MESSAGE,
    products,
    comparison: collected.comparison,
    actions: collected.actions,
    productIds: products.map((product) => product.id),
  };
}
