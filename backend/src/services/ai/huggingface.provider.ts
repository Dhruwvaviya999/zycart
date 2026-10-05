import OpenAI from 'openai';
import type { AiConfig } from '../../config/ai';
import {
  AiProviderError,
  type AiGenerateRequest,
  type AiGenerateResponse,
  type AiProvider,
  type AiStopReason,
  type AiStructuredRequest,
  type AiToolCall,
  type AiTurn,
} from './provider';

/**
 * The Hugging Face implementation, spoken through the OpenAI wire format.
 *
 * Hugging Face does not serve the model itself here: the router at
 * `router.huggingface.co` forwards each call to whichever inference provider
 * hosts the requested model — Together, Fireworks, Novita and others. That has
 * one consequence worth stating plainly, because it is the difference between
 * this file and the other two providers: the vendor behind `AI_MODEL` changes
 * with the model, so support for tool calling and for schema-constrained JSON
 * varies per model rather than per account. Both are verified against the
 * configured model before a deployment trusts this provider, and both failure
 * modes are classified below rather than left to surface as a bare 400.
 *
 * `AI_MODEL` takes a full repository id, optionally pinned to one backend with
 * a suffix — `meta-llama/Llama-3.3-70B-Instruct` routes automatically,
 * `meta-llama/Llama-3.3-70B-Instruct:together` does not. Pinning is the safer
 * choice once a backend is known to handle tools correctly, since automatic
 * routing may otherwise move to one that does not.
 */

/** The router's OpenAI-compatible surface. Not the Hub API, which is separate. */
const HF_ROUTER_BASE_URL = 'https://router.huggingface.co/v1';

function toStopReason(reason: string | null | undefined, hasCalls: boolean): AiStopReason {
  // Some backends answer a tool call with `stop` rather than `tool_calls`. What
  // came back in the message decides this, not what the backend called it.
  if (hasCalls) return 'tool_use';

  switch (reason) {
    case 'stop':
      return 'end';
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'refusal';
    default:
      return 'other';
  }
}

/**
 * Rebuilds the request messages.
 *
 * An assistant turn is replayed from `raw` whenever we have it, so the exact
 * `tool_calls` array the backend emitted — ids included — goes back unchanged.
 * A rebuilt one risks renaming an id that the next `tool` message has to match,
 * and an unmatched id is a 400 on every backend.
 */
function toMessages(system: string, turns: AiTurn[]): OpenAI.ChatCompletionMessageParam[] {
  const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: 'system', content: system }];

  for (const turn of turns) {
    if (turn.role === 'user') {
      messages.push({ role: 'user', content: turn.text });
      continue;
    }

    /**
     * Every result becomes its own `tool` message, which is what the format
     * requires — there is no batched equivalent of a single message carrying
     * every result. `isError` has no wire representation either, so a
     * failed tool is reported to the model the only way this format allows: as
     * its content, which `executeTool` already serialises as an `error` object.
     */
    if (turn.role === 'tool_results') {
      for (const result of turn.results) {
        messages.push({ role: 'tool', tool_call_id: result.toolCallId, content: result.content });
      }
      continue;
    }

    if (turn.raw && typeof turn.raw === 'object') {
      messages.push(turn.raw as OpenAI.ChatCompletionAssistantMessageParam);
      continue;
    }

    messages.push({
      role: 'assistant',
      // Null rather than an empty string: a turn that only called tools has no
      // text, and some backends reject `""` where they accept an absent value.
      content: turn.text || null,
      ...(turn.toolCalls.length > 0
        ? {
            tool_calls: turn.toolCalls.map((call) => ({
              id: call.id,
              type: 'function' as const,
              function: { name: call.name, arguments: JSON.stringify(call.input) },
            })),
          }
        : {}),
    });
  }

  return messages;
}

function toFunctionTools(request: AiGenerateRequest): OpenAI.ChatCompletionTool[] {
  return request.tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.schema },
  }));
}

/**
 * Reads the tool calls off one message.
 *
 * `arguments` arrives as a string of JSON rather than an object, and a smaller
 * open model truncates or malforms it often enough that this cannot assume it
 * parses. Where it does not, the raw string is passed through as the call input:
 * `AiToolCall.input` is typed `unknown` and every tool re-validates it with Zod,
 * so a string fails that check and the model is told its call was malformed.
 * Substituting `{}` would instead present a broken call as a valid empty one,
 * and the tool would run with default arguments nobody asked for.
 */
function toToolCalls(message: OpenAI.ChatCompletionMessage | undefined): AiToolCall[] {
  return (message?.tool_calls ?? []).flatMap((call, index): AiToolCall[] => {
    if (call.type !== 'function') return [];

    const args = call.function.arguments;

    let input: unknown = args;
    try {
      input = args ? (JSON.parse(args) as unknown) : {};
    } catch {
      /* Left as the raw string, which the tool's own schema will reject. */
    }

    return [
      {
        // Some backends omit the id on a single call; the loop needs a stable
        // one to match the result back, and index is enough within a turn.
        id: call.id || `hf_call_${String(index)}`,
        name: call.function.name,
        input,
      },
    ];
  });
}

/** Classifies a thrown SDK error without letting its text escape this process. */
function toProviderError(error: unknown): AiProviderError {
  if (error instanceof OpenAI.APIUserAbortError) {
    return new AiProviderError('Request aborted', 'timeout');
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AiProviderError('Provider timed out', 'timeout');
  }
  if (error instanceof OpenAI.AuthenticationError) {
    return new AiProviderError('Provider rejected the credentials', 'auth');
  }
  if (error instanceof OpenAI.PermissionDeniedError) {
    /**
     * A 403 from the router means the token is valid but not entitled to this
     * model — a gated repository, or an inference provider the account has no
     * plan with. That is a credential problem in the sense an operator cares
     * about: unlike a rate limit, no amount of retrying fixes it.
     */
    return new AiProviderError('Provider rejected the credentials for this model', 'auth');
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new AiProviderError('Provider quota or rate limit reached', 'rate_limit');
  }
  if (error instanceof OpenAI.APIError) {
    return new AiProviderError(`Provider error (status ${String(error.status)})`, 'upstream');
  }

  return new AiProviderError(
    error instanceof Error ? error.message : 'Unknown provider failure',
    'unknown',
  );
}

export function createHuggingFaceProvider(config: AiConfig): AiProvider {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: HF_ROUTER_BASE_URL,
    timeout: config.timeoutMs,
    // One retry only. A shopper is waiting, and the request already carries its
    // own deadline — the SDK default of two would spend it on retries.
    maxRetries: 1,
  });

  return {
    name: `huggingface:${config.model}`,

    async generate(request: AiGenerateRequest): Promise<AiGenerateResponse> {
      try {
        const response = await client.chat.completions.create(
          {
            model: config.model,
            max_tokens: request.maxOutputTokens,
            messages: toMessages(request.system, request.turns),
            ...(request.tools.length > 0
              ? {
                  tools: toFunctionTools(request),
                  /**
                   * `none` still sends the tool list, which matters: the
                   * transcript already contains tool calls and their results,
                   * and a backend handed those without the declarations that
                   * describe them can reject the request. This forbids new
                   * calls without rewriting the history.
                   */
                  tool_choice: request.allowTools ? 'auto' : 'none',
                }
              : {}),
          },
          { signal: request.signal },
        );

        const message = response.choices[0]?.message;
        const toolCalls = toToolCalls(message);

        return {
          text: (message?.content ?? '').trim(),
          toolCalls,
          stopReason: toStopReason(response.choices[0]?.finish_reason, toolCalls.length > 0),
          ...(response.usage
            ? {
                usage: {
                  inputTokens: response.usage.prompt_tokens,
                  outputTokens: response.usage.completion_tokens,
                },
              }
            : {}),
          raw: message,
        };
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async generateStructured(request: AiStructuredRequest): Promise<unknown> {
      try {
        const response = await client.chat.completions.create(
          {
            model: config.model,
            max_tokens: request.maxOutputTokens,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.prompt },
            ],
            /**
             * Constrained by the backend rather than by the prompt, where the
             * backend supports it. Those that do not answer with a 400, which
             * `toProviderError` reports as `upstream` and the caller treats as a
             * failed interpretation — it falls back to the plain query rather
             * than acting on a guess. There is deliberately no "ask for JSON in
             * the prompt" path: unconstrained JSON from a small open model is
             * the thing this method exists to avoid.
             */
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'result', schema: request.schema, strict: true },
            },
          },
          { signal: request.signal },
        );

        const text = (response.choices[0]?.message.content ?? '').trim();
        if (!text) throw new AiProviderError('Provider returned no content', 'upstream');

        try {
          return JSON.parse(text) as unknown;
        } catch {
          // Constrained decoding makes this unlikely, and it is still checked:
          // truncation at `max_tokens` can cut a valid object in half.
          throw new AiProviderError('Provider returned malformed JSON', 'upstream');
        }
      } catch (error) {
        throw error instanceof AiProviderError ? error : toProviderError(error);
      }
    },
  };
}
