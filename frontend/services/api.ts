import axios, { AxiosError } from 'axios';
import type { ApiListResponse, ApiResponse, HealthResponse } from '@/types/api';
import type { Pagination } from '@/types/product';

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

export const api = axios.create({
  baseURL,
  timeout: 10_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Carries the HTTP status so callers can tell "this product does not exist"
 * from "the catalogue is unreachable" — the two need different UI.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/**
 * Turns an unknown throwable into a message safe to render.
 * The backend already returns `{ success, message }`, so prefer that when present.
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;

  if (error instanceof AxiosError) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    if (message) return message;
    if (error.code === 'ECONNABORTED') return 'Request timed out';
    if (!error.response) return `Cannot reach the API at ${baseURL}`;
    return error.message;
  }

  return error instanceof Error ? error.message : 'Unexpected error';
}

function toApiError(error: unknown): ApiError {
  const status = error instanceof AxiosError ? error.response?.status : undefined;
  return new ApiError(toErrorMessage(error), status);
}

/** Unwraps `{ success, data }`, normalising every failure into an `ApiError`. */
export async function request<TData>(path: string, params?: object): Promise<TData> {
  try {
    const { data } = await api.get<ApiResponse<TData>>(path, { params });

    if (!data.success || data.data === undefined) {
      throw new ApiError(data.message ?? 'The API returned an unexpected response');
    }

    return data.data;
  } catch (error) {
    throw error instanceof ApiError ? error : toApiError(error);
  }
}

/** As `request`, but keeps the pagination metadata that sits beside the array. */
export async function requestList<TItem>(
  path: string,
  params?: object,
): Promise<{ items: TItem[]; pagination: Pagination }> {
  try {
    const { data } = await api.get<ApiListResponse<TItem>>(path, { params });

    if (!data.success || !Array.isArray(data.data)) {
      throw new ApiError(data.message ?? 'The API returned an unexpected response');
    }

    const items = data.data;
    return {
      items,
      pagination: data.pagination ?? {
        page: 1,
        limit: items.length,
        total: items.length,
        totalPages: 1,
      },
    };
  } catch (error) {
    throw error instanceof ApiError ? error : toApiError(error);
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/api/health');
  return data;
}
