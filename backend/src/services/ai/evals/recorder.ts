import {
  AiProviderError,
  type AiFailureKind,
  type AiGenerateRequest,
  type AiProvider,
  type AiTurn,
} from '../provider';
import type { ModelCall, ToolExchange } from './types';

/**
 * A provider that watches another one.
 *
 * The harness runs conversations through the real `chat()` — the same prompt,
 * loop, limits and tools a customer gets — and that function returns only what
 * the storefront needs: a reply, cards and actions. Grading needs more: which
 * tools were called with which arguments, what they returned, how long each
 * model call took and what it consumed. All of that crosses the provider
 * boundary, so it is read here, without a single line of the request path
 * changing to make it observable.
 */
export interface RecordingProvider extends AiProvider {
  /** Clears what was recorded, before the next customer turn. */
  reset(): void;
  calls(): ModelCall[];
  /** Every tool exchange of the current turn, in the order they ran. */
  toolExchanges(): ToolExchange[];
  /** The kind of the last provider failure, if the turn ended in one. */
  lastFailure(): AiFailureKind | null;
}

export function createRecordingProvider(inner: AiProvider): RecordingProvider {
  let calls: ModelCall[] = [];
  let lastTurns: AiTurn[] = [];
  let failure: AiFailureKind | null = null;

  return {
    name: inner.name,

    reset() {
      calls = [];
      lastTurns = [];
      failure = null;
    },

    calls: () => calls,
    toolExchanges: () => pairExchanges(lastTurns),
    lastFailure: () => failure,

    async generate(request: AiGenerateRequest) {
      // Copied, because the service keeps appending to the same array.
      lastTurns = [...request.turns];
      const started = performance.now();

      try {
        const response = await inner.generate(request);

        calls.push({
          latencyMs: performance.now() - started,
          stopReason: response.stopReason,
          toolCallCount: response.toolCalls.length,
          ...(response.usage ? { usage: response.usage } : {}),
        });

        return response;
      } catch (error) {
        failure = error instanceof AiProviderError ? error.kind : 'unknown';
        throw error;
      }
    },

    generateStructured: (request) => inner.generateStructured(request),
  };
}

/**
 * Matches each tool call to the result it produced.
 *
 * Read from the last request the model received, which holds every round of
 * the turn. Results are matched by id rather than position: a provider may
 * return several calls in one round, and the pairing must not depend on it
 * preserving their order.
 */
export function pairExchanges(turns: AiTurn[]): ToolExchange[] {
  const exchanges: ToolExchange[] = [];

  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (turn?.role !== 'assistant' || turn.toolCalls.length === 0) continue;

    const next = turns[index + 1];
    const results = next?.role === 'tool_results' ? next.results : [];

    for (const call of turn.toolCalls) {
      const result = results.find((candidate) => candidate.toolCallId === call.id);

      exchanges.push({
        name: call.name,
        input: call.input,
        content: result?.content ?? '',
        isError: result?.isError ?? true,
      });
    }
  }

  return exchanges;
}
