import { request, send } from '@/services/api';
import type { AiChatRequest, AiChatResponse } from '@/types/ai';

/**
 * The only route from the browser to ZyCart AI.
 *
 * It goes to Express, never to a model provider. There is no provider SDK in
 * the client bundle and no key in the browser: `AI_API_KEY` is read by the
 * server and nowhere else, which is also why there is no `NEXT_PUBLIC_`
 * anything here.
 */

/**
 * Longer than the shared default, and a little longer than the server's own
 * deadline, so a request that runs long ends as the server's controlled error
 * rather than as an axios timeout with nothing useful to say.
 */
const AI_TIMEOUT_MS = 60_000;

export function sendChat(body: AiChatRequest, signal?: AbortSignal): Promise<AiChatResponse> {
  return send<AiChatResponse>('post', '/api/ai/chat', body, {
    timeoutMs: AI_TIMEOUT_MS,
    ...(signal ? { signal } : {}),
  });
}

/**
 * Whether this deployment has an assistant at all.
 *
 * Answers `false` rather than failing when the API is unreachable: the
 * storefront works without AI, so an unreachable status endpoint should hide
 * the launcher, not break the page that renders it.
 */
export async function getAiStatus(): Promise<boolean> {
  try {
    const { enabled } = await request<{ enabled: boolean }>('/api/ai/status');
    return enabled;
  } catch {
    return false;
  }
}
