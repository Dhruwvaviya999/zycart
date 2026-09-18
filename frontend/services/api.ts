import axios, { AxiosError } from 'axios';
import type { HealthResponse } from '@/types/api';

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

export const api = axios.create({
  baseURL,
  timeout: 10_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Turns an unknown throwable into a message safe to render.
 * The backend already returns { success, message }, so prefer that when present.
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    if (message) return message;
    if (error.code === 'ECONNABORTED') return 'Request timed out';
    if (!error.response) return `Cannot reach the API at ${baseURL}`;
    return error.message;
  }

  return error instanceof Error ? error.message : 'Unexpected error';
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/api/health');
  return data;
}
