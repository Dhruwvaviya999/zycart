import axios, { AxiosError } from 'axios';
import type { ApiListResponse, ApiResponse, HealthResponse } from '@/types/api';
import type { Pagination } from '@/types/product';

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? '';

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
    /** Zod field messages keyed by field name, when the API sent any. */
    public readonly fields: Record<string, string> = {},
    /**
     * The API's correlation id for the request that failed (Phase 16).
     *
     * Present only on server faults, which is exactly when it is worth
     * anything: a customer looking at "Something went wrong" has a reference
     * to quote, and an operator can find the one log record that explains it.
     * Never shown for a validation error — the message already says what to
     * fix, and an incident reference beside it would only be alarming.
     */
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
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

/** The correlation header, which the API exposes to the browser through CORS. */
function readRequestIdHeader(error: AxiosError): string | undefined {
  const value: unknown = error.response?.headers['x-request-id'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toApiError(error: unknown): ApiError {
  if (!(error instanceof AxiosError)) return new ApiError(toErrorMessage(error));

  const payload = error.response?.data as ApiResponse | undefined;
  const fields = Object.fromEntries(
    (payload?.errors ?? [])
      .filter((issue) => issue.path)
      .map((issue) => [issue.path, issue.message] as const),
  );

  return new ApiError(
    toErrorMessage(error),
    error.response?.status,
    fields,
    // Preferred from the body, which the API only sets on 5xx. The header is
    // the fallback, since it is set on every response including ones that
    // never reached the error middleware.
    payload?.requestId ?? readRequestIdHeader(error),
  );
}

/**
 * Server components have no browser to attach the session cookie for them, so
 * they pass the incoming one through explicitly.
 */
export interface RequestOptions {
  cookie?: string;
  /**
   * Overrides the client's 10-second default. The AI endpoint needs it: a model
   * call plus its catalogue lookups is seconds of work, not milliseconds, and
   * a timeout tuned for a product query would cut every reply short.
   */
  timeoutMs?: number;
  /** Lets a caller abandon a slow request — the assistant's Stop button. */
  signal?: AbortSignal;
}

const headersFor = (options?: RequestOptions) =>
  options?.cookie ? { Cookie: options.cookie } : undefined;

/** Unwraps `{ success, data }`, normalising every failure into an `ApiError`. */
export async function request<TData>(
  path: string,
  params?: object,
  options?: RequestOptions,
): Promise<TData> {
  try {
    const { data } = await api.get<ApiResponse<TData>>(path, {
      params,
      headers: headersFor(options),
    });

    if (!data.success || data.data === undefined) {
      throw new ApiError(data.message ?? 'The API returned an unexpected response');
    }

    return data.data;
  } catch (error) {
    throw error instanceof ApiError ? error : toApiError(error);
  }
}

type Method = 'post' | 'patch' | 'delete';

/** A write that answers with data — the shape every mutation here returns. */
export async function send<TData>(
  method: Method,
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<TData> {
  try {
    const { data } = await api.request<ApiResponse<TData>>({
      method,
      url: path,
      data: body,
      headers: headersFor(options),
      ...(options?.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!data.success || data.data === undefined) {
      throw new ApiError(data.message ?? 'The API returned an unexpected response');
    }

    return data.data;
  } catch (error) {
    throw error instanceof ApiError ? error : toApiError(error);
  }
}

/** A write that answers with a message only, such as logout or a password change. */
export async function sendMessage(method: Method, path: string, body?: unknown): Promise<string> {
  try {
    const { data } = await api.request<ApiResponse>({ method, url: path, data: body });

    if (!data.success) {
      throw new ApiError(data.message ?? 'The API returned an unexpected response');
    }

    return data.message ?? 'Done';
  } catch (error) {
    throw error instanceof ApiError ? error : toApiError(error);
  }
}

/**
 * Field-level messages from a Zod failure, so a form can put each one beside the
 * input it belongs to instead of dumping them all on top.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}

/** As `request`, but keeps the pagination metadata that sits beside the array. */
export async function requestList<TItem>(
  path: string,
  params?: object,
  options?: RequestOptions,
): Promise<{ items: TItem[]; pagination: Pagination }> {
  try {
    const { data } = await api.get<ApiListResponse<TItem>>(path, {
      params,
      headers: headersFor(options),
    });

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

/**
 * The health endpoint, raw.
 *
 * Deliberately not routed through `request`: that helper throws on a
 * non-success envelope, and health answers **503 with a perfectly valid body**
 * when the API cannot reach its database. That body is the most interesting
 * one there is, and a client that threw it away would be unable to tell "the
 * API is not ready" from "the API is not there".
 *
 * `validateStatus` is widened for the same reason. Anything other than 200 or
 * 503 is still a failure, and still throws.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>('/api/health', {
    validateStatus: (status) => status === 200 || status === 503,
  });

  return data;
}
