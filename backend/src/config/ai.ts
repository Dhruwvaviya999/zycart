import type { Env } from './env';

/**
 * ZyCart AI configuration: what the assistant is allowed to be, and how much
 * of it a single request may consume.
 *
 * Everything here is decided once, on the server, from validated environment
 * variables. Nothing in this file is ever sent to the browser, and the API key
 * is never logged, printed at startup, or included in an error message.
 */

export type AiProviderName = 'gemini' | 'huggingface' | 'mock';

/** A provider that is actually usable, with its credentials already resolved. */
  export interface AiConfig {
    provider: AiProviderName;
    /** Present for a real provider; the mock needs no credentials. */
    apiKey: string;
    model: string;
    timeoutMs: number;
  }

  /**
 * The model each vendor is asked for when `AI_MODEL` is unset.
 *
 * Flash rather than Pro for Gemini: the two jobs ZyCart gives a model —
 * shopping chat and one-shot query interpretation — are retrieval and
 * classification, where Flash is the right size, and it is the tier a free API
 * key can actually run.
 */
const DEFAULT_MODEL: Record<AiProviderName, string> = {
  gemini: 'gemini-3.5-flash-lite',
  /**
   * Hugging Face routes by repository id, and the assistant is useless without
   * tool calling, so the default is a model known to support it rather than the
   * most capable one available. Left unpinned to a backend deliberately: an
   * operator who finds a backend that handles these schemas well should pin it
   * with a `:provider` suffix, which is a decision about their account, not a
   * default this file can make for them.
   */
  huggingface: 'meta-llama/Llama-3.3-70B-Instruct',
  mock: 'mock-1',
};

/**
 * The AI configuration, or null when this deployment runs without an assistant.
 *
 * Null is a legitimate, fully supported state — the storefront does not depend
 * on the assistant for anything — and it is reported at startup rather than
 * discovered by a customer opening the chat.
 *
 * Deliberately *not* a startup failure, which is where this differs from the
 * Razorpay rule next door. A half-configured payment gateway can create orders
 * it cannot verify, so booting is the dangerous outcome. A missing AI key can
 * only disable one feature, and refusing to start the whole store over it would
 * cause more harm than the mistake it guards against.
 */
export function aiConfig(env: Env): AiConfig | null {
  if (!env.AI_ENABLED) return null;

  const model = env.AI_MODEL ?? DEFAULT_MODEL[env.AI_PROVIDER];

  if (env.AI_PROVIDER === 'mock') {
    return { provider: 'mock', apiKey: '', model, timeoutMs: env.AI_TIMEOUT_MS };
  }

  if (!env.AI_API_KEY) return null;

  return {
    provider: env.AI_PROVIDER,
    apiKey: env.AI_API_KEY,
    model,
    timeoutMs: env.AI_TIMEOUT_MS,
  };
}

export const isAiConfigured = (env: Env): boolean => aiConfig(env) !== null;

/**
 * Why the assistant is unavailable, in words an operator can act on. Never
 * shown to a customer — the storefront only learns `enabled: false`.
 */
export function aiUnavailableReason(env: Env): string | null {
  if (!env.AI_ENABLED) return 'AI_ENABLED is false';
  if (env.AI_PROVIDER !== 'mock' && !env.AI_API_KEY) return 'AI_API_KEY is not set';
  return null;
}

/**
 * The ceilings on one AI request.
 *
 * These are the cost and abuse controls for this phase, and they are plain
 * numbers on purpose: an LLM call is unbounded in a way a database query is
 * not, so every axis along which it could run away — history length, message
 * size, tool calls, result size, wall clock — is capped here rather than left
 * to the model's judgement.
 */
export const AI_LIMITS = {
  /** Conversation turns kept from the client's history, oldest dropped first. */
  maxMessages: 16,
  /** Characters in one message. Roughly a long paragraph; not a document. */
  maxMessageLength: 2_000,
  /** Characters across the whole submitted history, before trimming. */
  maxHistoryLength: 24_000,
  /** Messages the client may submit at all, before trimming to `maxMessages`. */
  maxSubmittedMessages: 40,

  /** Model round-trips per request: the answer plus this many tool rounds. */
  maxToolRounds: 4,
  /** Total tool executions per request, across all rounds. */
  maxToolCalls: 8,

  /** Products handed to the model by one search. Enough to choose from. */
  defaultSearchLimit: 6,
  maxSearchLimit: 10,
  /** Products one comparison may cover. */
  minCompareProducts: 2,
  maxCompareProducts: 4,

  /** Product ids the client may echo back per assistant turn, for "the second one". */
  maxReferencedIds: 12,

  /** Images, specifications and description length passed into the context. */
  maxImagesPerProduct: 2,
  maxSpecifications: 15,
  maxHighlights: 6,
  maxDescriptionLength: 600,

  /** Wall clock for the whole request, including every tool round. */
  requestDeadlineMs: 55_000,

  /** Output ceiling for one model turn. The assistant is meant to be brief. */
  maxOutputTokens: 2_048,
} as const;

/**
 * The reply when the assistant cannot answer, in the customer's words.
 *
 * One constant so a provider outage, a timeout and an unexpected failure all
 * say the same calm thing, and so no provider message, status code or stack
 * can reach the page through a path someone forgot to sanitise.
 */
export const AI_UNAVAILABLE_MESSAGE =
  "I couldn't reach the shopping assistant just now. Everything else in the store still works — please try again in a moment.";
