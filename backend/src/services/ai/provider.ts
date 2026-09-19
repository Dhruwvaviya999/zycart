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

export interface AiGenerateResponse {
  text: string;
  toolCalls: AiToolCall[];
  stopReason: AiStopReason;
  raw?: unknown;
}

export interface AiProvider {
  readonly name: string;
  generate(request: AiGenerateRequest): Promise<AiGenerateResponse>;
}

export type AiFailureKind = 'timeout' | 'auth' | 'rate_limit' | 'upstream' | 'unknown';

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
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
