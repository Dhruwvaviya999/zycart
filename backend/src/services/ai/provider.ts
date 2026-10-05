/**
 * The boundary between ZyCart and whichever model happens to be answering.
 *
 * Everything above this line — the system prompt, the tools, the permission
 * checks, the conversation limits — is ZyCart's. Everything below it is one
 * provider's SDK. Nothing in `ai.service.ts`, the tools, the controller or the
 * frontend imports a provider SDK, so swapping the model behind the assistant
 * is a change to one file in this folder rather than a change to the business.
 *
 * The interface is deliberately *not* agentic: `generate` performs exactly one
 * model call and returns what came back. The loop that feeds tool results back
 * belongs to ZyCart, because that loop is where permissions are enforced, tool
 * arguments are validated and the call budget is spent — decisions no provider
 * helper can be trusted to make on the store's behalf.
 */

/** A JSON Schema object describing one tool's arguments. */
export interface AiToolSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
  /** Whatever else the schema generator emitted — descriptions, formats, bounds. */
  [key: string]: unknown;
}

export interface AiToolDefinition {
  name: string;
  description: string;
  schema: AiToolSchema;
}

export interface AiToolCall {
  id: string;
  name: string;
  /** Raw, model-generated, and never trusted — every tool re-validates it. */
  input: unknown;
}

export interface AiToolResult {
  toolCallId: string;
  /**
   * The tool that produced this result.
   *
   * Redundant for providers that match a result to its call by id alone, and
   * required by those that key function responses by name. The neutral shape
   * has to carry everything any provider needs, or a provider ends up
   * reconstructing it by parsing an id.
   */
  name: string;
  content: string;
  isError: boolean;
}

export type AiTurn =
  | { role: 'user'; text: string }
  | { role: 'tool_results'; results: AiToolResult[] }
  | {
      role: 'assistant';
      text: string;
      toolCalls: AiToolCall[];
      /**
       * The provider's own representation of this turn, echoed back verbatim on
       * the next call. Some providers attach signed reasoning to an assistant
       * turn that must survive the round trip unmodified; normalising it away
       * and rebuilding it would break that. Opaque to everything above here.
       */
      raw?: unknown;
    };

export interface AiGenerateRequest {
  system: string;
  turns: AiTurn[];
  tools: AiToolDefinition[];
  /**
   * False on the final turn of a request that has spent its tool budget: the
   * model must answer from what it already has rather than ask for more.
   */
  allowTools: boolean;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export type AiStopReason = 'end' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';

/**
 * What one call consumed, as the provider itself reported it.
 *
 * Optional because not every backend reports it, and an estimate would be a
 * number nobody could trust. Input includes cached and cache-written tokens;
 * output includes any reasoning the provider bills as output. Nothing in the
 * request path reads it — it exists so the evaluation harness can say what a
 * conversation actually cost.
 */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiGenerateResponse {
  text: string;
  toolCalls: AiToolCall[];
  stopReason: AiStopReason;
  usage?: AiUsage;
  raw?: unknown;
}

/**
 * A request for one object, described by a JSON Schema.
 *
 * Separate from `generate` because it is a different job with a different
 * failure mode: there is no conversation, no tools and no prose — either an
 * object matching the schema comes back or the caller falls back. Each provider
 * implements it with its own native structured-output mechanism rather than by
 * asking for JSON in a prompt and hoping.
 */
export interface AiStructuredRequest {
  system: string;
  prompt: string;
  schema: AiToolSchema;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface AiProvider {
  readonly name: string;
  generate(request: AiGenerateRequest): Promise<AiGenerateResponse>;
  /**
   * Returns the parsed JSON the model produced — and nothing more. It is still
   * model output, so the caller validates it against a Zod schema before any
   * part of it reaches a query. A provider that cannot produce valid JSON
   * throws rather than returning a guess.
   */
  generateStructured(request: AiStructuredRequest): Promise<unknown>;
}

/**
 * `rate_limit`, `no_quota` and `daily_quota` are deliberately different
 * (Phase 19).
 *
 * A rate limit is temporary: the allowance refills and the same request
 * succeeds a minute later. `no_quota` is a key with *no allowance at all* for
 * the model — a free-tier key asking for a model that has no free tier, which
 * Google reports as a quota of `limit: 0`. Waiting never helps; somebody has to
 * enable billing or choose another model, and telling a customer to "try again
 * in a minute" would be a promise the system cannot keep.
 *
 * `daily_quota` sits between them: the account's allowance for the *day* is
 * spent — Cloudflare's free 10,000 neurons — and comes back by itself, but at
 * the provider's reset, not in a minute. When the provider says when, it is
 * carried as `retryAt`.
 */
export type AiFailureKind =
  'timeout' | 'auth' | 'rate_limit' | 'no_quota' | 'daily_quota' | 'upstream' | 'unknown';

/**
 * A provider failure, classified but never quoted.
 *
 * `message` is for the server log. The customer sees `AI_UNAVAILABLE_MESSAGE`
 * and nothing else, so a provider's error text — which can echo request
 * content, model names or account details — has no route to the page.
 */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: AiFailureKind = 'unknown',
    /** Epoch milliseconds from which the same request can succeed again, when known. */
    public readonly retryAt?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
