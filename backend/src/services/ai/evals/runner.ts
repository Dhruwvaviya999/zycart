import { AppError } from '../../../utils/AppError';
import { aiChatSchema, type ClientMessage } from '../../../validators/ai.validator';
import { chat } from '../ai.service';
import type { AiFailureKind } from '../provider';
import type { RecordingProvider } from './recorder';
import { scoreCase } from './scorers';
import type { CaseResult, EvalCase, TurnTranscript } from './types';

/**
 * Plays one case through the real assistant.
 *
 * Each turn goes through `aiChatSchema` and then `chat()` — the validator and
 * the service the chat endpoint uses — so the conversation the model sees is
 * byte for byte the one a customer's browser would produce: earlier answers
 * echoed back as text plus product ids, never as prices or product objects.
 * The only thing between this and production is the HTTP layer.
 */

export interface RunOptions {
  provider: RecordingProvider;
  /** A fresh throwaway account id for a signed-in case, so carts never carry over. */
  newUserId: () => string;
  /** Attempts per case when the provider is throttling or briefly down. */
  maxAttempts?: number;
  /** First backoff after a throttled attempt; doubles each time. */
  backoffMs?: number;
}

/**
 * A failure that says nothing about the model and will not go away by itself:
 * a bad key, a key with no quota, a day's allowance spent. The run stops rather
 * than recording fifty identical errors as fifty results.
 */
export class FatalEvalError extends Error {
  constructor(
    message: string,
    public readonly kind: AiFailureKind,
  ) {
    super(message);
    this.name = 'FatalEvalError';
  }
}

const FATAL: AiFailureKind[] = ['auth', 'no_quota', 'daily_quota'];
const RETRYABLE: AiFailureKind[] = ['rate_limit', 'timeout', 'upstream'];

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function playTurns(evalCase: EvalCase, options: RunOptions): Promise<TurnTranscript[]> {
  const userId = evalCase.authenticated ? options.newUserId() : null;
  const history: ClientMessage[] = [];
  const transcripts: TurnTranscript[] = [];

  for (const text of evalCase.turns) {
    history.push({ role: 'user', content: text });
    options.provider.reset();

    const input = aiChatSchema.parse({ messages: history });
    const started = performance.now();
    const result = await chat(input, { provider: options.provider, userId });

    transcripts.push({
      userText: text,
      result,
      tools: options.provider.toolExchanges(),
      calls: [...options.provider.calls()],
      latencyMs: performance.now() - started,
    });

    // What the browser sends back on the next turn: the text and the ids.
    history.push({
      role: 'assistant',
      content: result.message,
      ...(result.productIds.length > 0 ? { productIds: result.productIds } : {}),
    });
  }

  return transcripts;
}

function summarise(evalCase: EvalCase, turns: TurnTranscript[], attempts: number): CaseResult {
  const checks = scoreCase(evalCase, turns);
  const final = turns.at(-1);
  const calls = turns.flatMap((turn) => turn.calls);
  const withUsage = calls.filter((call) => call.usage);
  const usageKnown = calls.length > 0 && withUsage.length === calls.length;

  return {
    id: evalCase.id,
    category: evalCase.category,
    description: evalCase.description,
    status: checks.every((check) => check.passed) ? 'pass' : 'fail',
    checks,
    attempts,
    reply: final?.result.message ?? '',
    cardSlugs: final?.result.products.map((product) => product.slug) ?? [],
    toolsCalled: final?.tools.map((exchange) => exchange.name) ?? [],
    latencyMs: turns.reduce((sum, turn) => sum + turn.latencyMs, 0),
    modelCalls: calls.length,
    toolCalls: turns.reduce((sum, turn) => sum + turn.tools.length, 0),
    inputTokens: usageKnown
      ? withUsage.reduce((sum, call) => sum + (call.usage?.inputTokens ?? 0), 0)
      : null,
    outputTokens: usageKnown
      ? withUsage.reduce((sum, call) => sum + (call.usage?.outputTokens ?? 0), 0)
      : null,
  };
}

function errored(evalCase: EvalCase, error: string, attempts: number): CaseResult {
  return {
    id: evalCase.id,
    category: evalCase.category,
    description: evalCase.description,
    status: 'error',
    checks: [],
    error,
    attempts,
    reply: '',
    cardSlugs: [],
    toolsCalled: [],
    latencyMs: 0,
    modelCalls: 0,
    toolCalls: 0,
    inputTokens: null,
    outputTokens: null,
  };
}

export async function runCase(evalCase: EvalCase, options: RunOptions): Promise<CaseResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  let backoff = options.backoffMs ?? 15_000;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return summarise(evalCase, await playTurns(evalCase, options), attempt);
    } catch (error) {
      const kind = options.provider.lastFailure();

      if (kind && FATAL.includes(kind)) {
        throw new FatalEvalError(
          `The provider refused the run (${kind}). Fix the key or quota and run again.`,
          kind,
        );
      }

      if (kind && RETRYABLE.includes(kind) && attempt < maxAttempts) {
        await pause(backoff);
        backoff *= 2;
        continue;
      }

      /**
       * No provider failure behind it: the service itself gave up — most often
       * a policy refusal, which it reports as unavailability. That is the
       * model's answer to the case, so it is scored as a failure rather than
       * set aside as an error.
       */
      if (!kind && error instanceof AppError) {
        return {
          ...errored(evalCase, '', attempt),
          status: 'fail',
          error: undefined,
          checks: [
            { id: 'answered', passed: false, detail: `The request failed: ${error.message}` },
          ],
        };
      }

      const reason = kind
        ? `provider ${kind}`
        : error instanceof Error
          ? error.message
          : String(error);
      return errored(evalCase, reason, attempt);
    }
  }
}
