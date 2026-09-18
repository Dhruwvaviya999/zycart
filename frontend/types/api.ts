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
}

/** List endpoints add pagination metadata alongside the array. */
export interface ApiListResponse<TItem> extends ApiResponse<TItem[]> {
  pagination?: Pagination;
}

export interface HealthData {
  environment: string;
  uptimeSeconds: number;
  database: string;
  timestamp: string;
}

export type HealthResponse = ApiResponse<HealthData>;
