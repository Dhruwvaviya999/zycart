import {
  ApiError,
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
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
 * Only this file, `huggingface.provider.ts` and — from
 * Phase 19 — `gemini-image.provider.ts` import a model SDK. The image provider
 * reuses this file's error mapping and timeout, so a try-on and a chat turn
 * fail in the same vocabulary.
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
 * classification, not reasoning, so thinking is turned down as far as the model
 * allows. How you ask for that changed between model generations:
 *
 * - Gemini 3 and later replaced the numeric budget with `thinkingLevel`, and
 *   reject `thinkingBudget: 0` outright with a 400 INVALID_ARGUMENT. `MINIMAL`
 *   is the floor there, and it reports zero thought tokens.
 * - Gemini 2.x Flash accepts `thinkingBudget: 0`. Pro requires a budget, so the
 *   Flash check stays: this is applied by capability, not unconditionally.
 */
const thinkingFor = (model: string) => {
  if (/gemini-[3-9]/i.test(model)) {
    return { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } };
  }

  return /flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {};
};

/** Markers Google uses for "you have run out", as opposed to "you may not". */
const isQuota = (message: string): boolean =>
  /RESOURCE_EXHAUSTED|quota|rate.?limit|exceeded/i.test(message);

/**
 * "You never had any" — a quota of zero for this model (Phase 19).
 *
 * Google reports it in the same 429 as an exhausted allowance, and the only
 * difference is in the body: `…free_tier_input_token_count, limit: 0, model:
 * gemini-3.1-flash-image`. It is what a free-tier key gets for every image
 * model, since none of them has a free tier, and it never clears on its own.
 * The negative lookahead keeps `limit: 0` from matching `limit: 05` or
 * `limit: 000150`.
 */
export const hasNoQuota = (message: string): boolean => /\blimit:\s*0(?!\d)/i.test(message);

/** Classifies a thrown SDK error without letting its text escape this process. */
export function toProviderError(error: unknown): AiProviderError {
  // `AbortSignal.timeout` rejects with a TimeoutError; a caller's own abort is
  // an AbortError. Both mean the same thing here: no answer arrived in time.
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
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
      /**
       * Named in the message — the model and the fix — because this is a
       * configuration problem an operator has to act on, and the log line is
       * where they will look. It carries no part of Google's body verbatim.
       */
      return hasNoQuota(error.message)
        ? new AiProviderError(
            'This key has no quota for the model (Google reports limit: 0). Free-tier keys cannot ' +
              'use models without a free tier — enable billing on the Google AI project.',
            'no_quota',
          )
        : new AiProviderError('Provider quota or rate limit reached', 'rate_limit');
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
export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
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
          ...(response.usageMetadata
            ? {
                usage: {
                  inputTokens: response.usageMetadata.promptTokenCount ?? 0,
                  // Thinking tokens are billed as output, so they count as output.
                  outputTokens:
                    (response.usageMetadata.candidatesTokenCount ?? 0) +
                    (response.usageMetadata.thoughtsTokenCount ?? 0),
                },
              }
            : {}),
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
