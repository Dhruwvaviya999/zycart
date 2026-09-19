import Anthropic from '@anthropic-ai/sdk';
import type { AiConfig } from '../../config/ai';
import {
  AiProviderError,
  type AiGenerateRequest,
  type AiGenerateResponse,
  type AiProvider,
  type AiStopReason,
  type AiToolCall,
  type AiTurn,
} from './provider';

/**
 * The Anthropic implementation — the only file in ZyCart that imports a model
 * SDK, and the only one that knows which model is answering.
 */

/**
 * Shopping chat is latency-sensitive, and the work is retrieval and comparison
 * rather than hard reasoning. Low effort keeps a reply inside a few seconds and
 * costs a fraction of the default; it is the setting this workload is actually
 * shaped for, not a downgrade applied to save money.
 */
const EFFORT = 'low' as const;

/**
 * A note on what is deliberately not sent: the server-side refusal `fallbacks`
 * parameter.
 *
 * It re-runs a policy decline on a second model inside the same call, which is
 * valuable for general-purpose traffic. This is a shopping assistant confined
 * to five catalogue tools, so a decline is close to unreachable — and the
 * parameter is beta, model-gated, and rejected with a 400 by models that do not
 * support it. `AI_MODEL` is configurable, so that 400 would be one edit of an
 * environment variable away, and it would break every request rather than a
 * rare one. A refusal is instead handled explicitly by the service, which
 * reports it as an unavailability. The trade is a worse outcome on a case that
 * should not occur, in exchange for not putting an untestable beta flag on the
 * critical path of every conversation.
 */

function toStopReason(reason: string | null): AiStopReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    default:
      return 'other';
  }
}

/**
 * Rebuilds the request messages.
 *
 * An assistant turn is replayed from `raw` whenever we have it, so the
 * provider's own blocks — including any signed reasoning — survive the round
 * trip byte for byte. Only a turn we synthesised ourselves is rebuilt.
 */
function toMessages(turns: AiTurn[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  for (const turn of turns) {
    if (turn.role === 'user') {
      messages.push({ role: 'user', content: turn.text });
      continue;
    }

    if (turn.role === 'tool_results') {
      messages.push({
        role: 'user',
        content: turn.results.map((result) => ({
          type: 'tool_result' as const,
          tool_use_id: result.toolCallId,
          content: result.content,
          is_error: result.isError,
        })),
      });
      continue;
    }

    if (Array.isArray(turn.raw)) {
      messages.push({ role: 'assistant', content: turn.raw as Anthropic.ContentBlockParam[] });
      continue;
    }

    const content: Anthropic.ContentBlockParam[] = [];
    if (turn.text) content.push({ type: 'text', text: turn.text });

    for (const call of turn.toolCalls) {
      content.push({
        type: 'tool_use',
        id: call.id,
        name: call.name,
        input: call.input as Record<string, unknown>,
      });
    }

    if (content.length > 0) messages.push({ role: 'assistant', content });
  }

  return messages;
}

/** Classifies a thrown SDK error without letting its text escape this process. */
function toProviderError(error: unknown): AiProviderError {
  if (error instanceof Anthropic.APIUserAbortError) {
    return new AiProviderError('Request aborted', 'timeout');
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiProviderError('Provider timed out', 'timeout');
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiProviderError('Provider rejected the credentials', 'auth');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiProviderError('Provider rate limit reached', 'rate_limit');
  }
  if (error instanceof Anthropic.APIError) {
    return new AiProviderError(`Provider error (status ${String(error.status)})`, 'upstream');
  }

  return new AiProviderError(
    error instanceof Error ? error.message : 'Unknown provider failure',
    'unknown',
  );
}

export function createAnthropicProvider(config: AiConfig): AiProvider {
  const client = new Anthropic({
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    // One retry only. A shopper is waiting, and the request already carries its
    // own deadline — the SDK default of two would spend it on retries.
    maxRetries: 1,
  });

  return {
    name: `anthropic:${config.model}`,

    async generate(request: AiGenerateRequest): Promise<AiGenerateResponse> {
      try {
        const response = await client.messages.create(
          {
            model: config.model,
            max_tokens: request.maxOutputTokens,
            output_config: { effort: EFFORT },

            /**
             * The system prompt and the tool list are identical on every call,
             * and the render order is tools -> system -> messages. Marking the
             * end of the system prompt caches that whole prefix, so each extra
             * round in a conversation re-reads it instead of re-paying for it.
             * Below the model's minimum cacheable prefix this is simply a no-op.
             */
            system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],

            tools: request.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.schema,
              // Guarantees the arguments validate against the schema. It does
              // not replace the Zod check inside each tool — that one enforces
              // ZyCart's rules, not the shape.
              strict: true,
            })),

            tool_choice: request.allowTools ? { type: 'auto' } : { type: 'none' },

            messages: toMessages(request.turns),
          },
          { signal: request.signal },
        );

        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim();

        const toolCalls: AiToolCall[] = response.content
          .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
          .map((block) => ({ id: block.id, name: block.name, input: block.input }));

        return {
          text,
          toolCalls,
          stopReason: toStopReason(response.stop_reason),
          raw: response.content,
        };
      } catch (error) {
        throw toProviderError(error);
      }
    },
  };
}
