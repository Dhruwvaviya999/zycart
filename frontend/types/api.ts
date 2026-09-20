import type { Pagination } from './product';

/**
 * Every backend response follows this envelope. `message` is present on errors
 * and on writes; read endpoints answer with `data` alone.
 */
export interface ApiResponse<TData = undefined> {
  success: boolean;
  message?: string;
  data?: TData;
  errors?: { path: string; message: string }[];
  /**
   * Present on server faults only, from Phase 16.
   *
   * An opaque reference to the one request that failed, which a customer can
   * quote and an operator can search the structured log for. It is not sent
   * with 4xx responses, so the validation shape this client parses
   * field-by-field is unchanged.
   */
  requestId?: string;
}

/** List endpoints add pagination metadata alongside the array. */
export interface ApiListResponse<TItem> extends ApiResponse<TItem[]> {
  pagination?: Pagination;
}

/**
 * `GET /api/health`, as Phase 16 defines it.
 *
 * Every field is either a fixed enum value or a fact the storefront already
 * knows about itself. Nothing here names a host, a credential or a path, and
 * the backend's own schema (`validators/health.validator.ts`) is `.strict()`,
 * so a field added to the API without being considered fails a test there
 * rather than arriving here unannounced.
 */
export type HealthCheckStatus =
  | 'ok'
  | 'unavailable'
  | 'configured'
  | 'not_configured'
  | 'mock'
  | 'disabled';

export interface HealthChecks {
  database: 'ok' | 'unavailable';
  /** `mock` records messages and delivers nothing. */
  email: 'configured' | 'mock';
  payments: 'configured' | 'not_configured';
  ai: 'configured' | 'disabled' | 'not_configured';
}

export interface HealthData {
  /**
   * Readiness, not liveness.
   *
   * Driven by the database alone: everything else in `checks` is a deployment
   * choice that was valid at boot and cannot break at run time. A store
   * configured for cash on delivery is `ok`; a store that cannot reach MongoDB
   * is not, and the response arrives with HTTP 503.
   */
  status: 'ok' | 'unavailable';
  service: string;
  /** From the API's package manifest, or null when it could not be read. */
  version: string | null;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: HealthChecks;
}

export type HealthResponse = ApiResponse<HealthData>;
