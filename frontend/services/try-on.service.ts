import { request, sendFile } from '@/services/api';
import type { TryOnResult, TryOnStatus } from '@/types/try-on';

export function getTryOnStatus(): Promise<TryOnStatus> {
  return request<TryOnStatus>('/api/try-on/status');
}

/**
 * One virtual try-on.
 *
 * The photo is the request body, as prepared by `preparePhoto`. The consent
 * header is the customer's ticked checkbox, carried to the server, which
 * refuses a try without it. A generation takes seconds rather than
 * milliseconds, so the timeout is the server's own ceiling plus a margin.
 */
export function createTryOn(
  productRef: string,
  photo: Blob,
  colour?: string,
  signal?: AbortSignal,
): Promise<TryOnResult> {
  const query = colour ? `?colour=${encodeURIComponent(colour)}` : '';

  return sendFile<TryOnResult>(`/api/try-on/${encodeURIComponent(productRef)}${query}`, photo, {
    headers: { 'X-Try-On-Consent': 'granted' },
    timeoutMs: 120_000,
    signal,
  });
}
