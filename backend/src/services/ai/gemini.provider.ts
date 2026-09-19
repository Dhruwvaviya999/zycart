import {
  ApiError,
  FunctionCallingConfigMode,
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type GenerateContentResponse,
  type Part,
} from '@google/genai';
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
 * The Google Gemini implementation.
 *
 * It exists because Phase 10's provider boundary said it could: everything
 * above `provider.ts` — the system prompt, the tool registry, the permission
 * checks, the loop, the limits, the whole assistant and now the search
 * interpreter — is unchanged by this file existing. Adding a second model
 * vendor was one new file and one new enum value, which is the entire point of
 * having written the interface that way.
 *
 * Only this file and `anthropic.provider.ts` import a model SDK.
 */

/**
 * Gemini finish reasons, mapped onto ZyCart's five.
 *
 * The safety family becomes `refusal`, which the AI service already treats as
 * an unavailability rather than something to explain to a shopper.
 * `MALFORMED_FUNCTION_CALL` is deliberately `other`: the turn produced nothing
 * usable, and the loop will simply answer without it.
 */
function toStopReason(reason: string | undefined, hasCalls: boolean): AiStopReason {
  if (hasCalls) return 'tool_use';

  switch (reason) {
    case 'STOP':
      return 'end';
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'SAFETY':
    case 'PROHIBITED_CONTENT':
    case 'BLOCKLIST':
    case 'SPII':
    case 'IMAGE_SAFETY':
    case 'IMAGE_PROHIBITED_CONTENT':
      return 'refusal';
    default:
      return 'other';
  }
}

/**
 * Rebuilds the conversation.
 *
 * Gemini calls the assistant `model` and carries tool results as
 * `functionResponse` parts on a `user` turn — which is why `AiToolResult` has
 * to know its own tool name: responses are matched by name here, not only by
 * id as they are elsewhere.
 *
 * A previous assistant turn is replayed from `raw` when we have it, so the
 * parts go back exactly as they came.
 */
function toContents(turns: AiTurn[]): Content[] {
  const contents: Content[] = [];

  for (const turn of turns) {
    if (turn.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: turn.text }] });
      continue;
    }

    if (turn.role === 'tool_results') {
      contents.push({
        role: 'user',
        parts: turn.results.map((result) => ({
          functionResponse: {
            id: result.toolCallId,
            name: result.name,
            /**
             * The result is already a JSON string, but Gemini wants an object.
             * It is wrapped rather than re-parsed: a tool result is data the
             * model reads, and `{ result: "…" }` keeps it one shape whether the
             * tool returned an object, an error or a bare string.
             */
            response: { result: result.content, isError: result.isError },
          },
        })),
      });
      continue;
    }

    if (Array.isArray(turn.raw)) {
      contents.push({ role: 'model', parts: turn.raw as Part[] });
      continue;
    }

    const parts: Part[] = [];
    if (turn.text) parts.push({ text: turn.text });

    for (const call of turn.toolCalls) {
      parts.push({
        functionCall: {
          id: call.id,
          name: call.name,
          args: call.input as Record<string, unknown>,
        },
      });
    }

    if (parts.length > 0) contents.push({ role: 'model', parts });
  }

  return contents;
}

function toFunctionDeclarations(request: AiGenerateRequest): FunctionDeclaration[] {
  return request.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    // The raw JSON Schema passthrough, so the schema Zod generated is the
    // schema the model is given — no translation into a second dialect.
    parametersJsonSchema: tool.schema,
  }));
}

/**
 * Thinking costs latency, and on the free tier it costs quota.
 *
 * Shopping chat and one-shot query interpretation are retrieval and
 * classification, not reasoning, so thinking is turned off where the model
 * allows it. Only the Flash family accepts a zero budget — Pro requires one —
 * so this is applied by capability rather than unconditionally.
 */
const thinkingFor = (model: string) =>
  /flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {};

/** Markers Google uses for "you have run out", as opposed to "you may not". */
const isQuota = (message: string): boolean =>
  /RESOURCE_EXHAUSTED|quota|rate.?limit|exceeded/i.test(message);

/** Classifies a thrown SDK error without letting its text escape this process. */
function toProviderError(error: unknown): AiProviderError {
  if (error instanceof Error && error.name === 'AbortError') {
    return new AiProviderError('Request aborted', 'timeout');
  }

  if (error instanceof ApiError) {
    const status = error.status;

    /**
     * A 403 is two different problems wearing the same status code.
     *
     * Gemini answers an exhausted quota with 403 and `RESOURCE_EXHAUSTED`, not
     * with 429 — so classifying every 403 as a credential failure sends an
     * operator hunting for a key problem that does not exist while the real
     * cause, a free tier that refills in a minute, goes unmentioned. The body
     * is the only thing that distinguishes them.
     */
    if (status === 429 || (status === 403 && isQuota(error.message))) {
      return new AiProviderError('Provider quota or rate limit reached', 'rate_limit');
    }

    if (status === 401 || status === 403) {
      return new AiProviderError('Provider rejected the credentials', 'auth');
    }

    return new AiProviderError(`Provider error (status ${String(status)})`, 'upstream');
  }

  return new AiProviderError(
    error instanceof Error ? error.message : 'Unknown provider failure',
    'unknown',
  );
}

/**
 * Gemini has no per-request timeout on the client, so one is imposed here.
 *
 * Without it a stalled connection would sit until the service's own request
 * deadline, spending the whole budget on a call that was never going to answer.
 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function createGeminiProvider(config: AiConfig): AiProvider {
  const client = new GoogleGenAI({ apiKey: config.apiKey });

  const readCandidate = (response: GenerateContentResponse) => {
    const candidate = response.candidates?.[0];
    return { parts: candidate?.content?.parts ?? [], finishReason: candidate?.finishReason };
  };

  return {
    name: `gemini:${config.model}`,

    async generate(request: AiGenerateRequest): Promise<AiGenerateResponse> {
      try {
        const response = await client.models.generateContent({
          model: config.model,
          contents: toContents(request.turns),
          config: {
            systemInstruction: request.system,
            maxOutputTokens: request.maxOutputTokens,
            abortSignal: withTimeout(request.signal, config.timeoutMs),
            ...thinkingFor(config.model),
            ...(request.tools.length > 0
              ? {
                  tools: [{ functionDeclarations: toFunctionDeclarations(request) }],
                  toolConfig: {
                    functionCallingConfig: {
                      mode: request.allowTools
                        ? FunctionCallingConfigMode.AUTO
                        : FunctionCallingConfigMode.NONE,
                    },
                  },
                }
              : {}),
          },
        });

        const { parts, finishReason } = readCandidate(response);

        const text = parts
          .map((part) => part.text ?? '')
          .join('')
          .trim();

        const toolCalls: AiToolCall[] = parts
          .filter((part) => part.functionCall?.name)
          .map((part, index) => ({
            // Gemini does not always return a call id, and the loop needs a
            // stable one to match the result back. Index is enough: a result is
            // matched within the turn that produced it.
            id: part.functionCall?.id ?? `gemini_call_${String(index)}`,
            name: part.functionCall?.name ?? '',
            input: part.functionCall?.args ?? {},
          }));

        return {
          text,
          toolCalls,
          stopReason: toStopReason(finishReason, toolCalls.length > 0),
          raw: parts,
        };
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async generateStructured(request: AiStructuredRequest): Promise<unknown> {
      try {
        const response = await client.models.generateContent({
          model: config.model,
          contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
          config: {
            systemInstruction: request.system,
            maxOutputTokens: request.maxOutputTokens,
            abortSignal: withTimeout(request.signal, config.timeoutMs),
            ...thinkingFor(config.model),
            // The model is constrained to the schema by the API rather than by
            // the prompt, so "return only JSON" is an API guarantee instead of
            // an instruction the model may narrate its way around.
            responseMimeType: 'application/json',
            responseJsonSchema: request.schema,
          },
        });

        const text = response.text?.trim();
        if (!text) throw new AiProviderError('Provider returned no content', 'upstream');

        try {
          return JSON.parse(text);
        } catch {
          // Constrained decoding makes this unlikely, and it is still checked:
          // truncation at `maxOutputTokens` can cut a valid object in half.
          throw new AiProviderError('Provider returned malformed JSON', 'upstream');
        }
      } catch (error) {
        throw error instanceof AiProviderError ? error : toProviderError(error);
      }
    },
  };
}
