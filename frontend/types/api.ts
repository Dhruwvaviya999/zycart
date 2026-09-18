/** Every backend response follows this envelope. */
export interface ApiResponse<TData = undefined> {
  success: boolean;
  message: string;
  data?: TData;
}

export interface HealthData {
  environment: string;
  uptimeSeconds: number;
  database: string;
  timestamp: string;
}

export type HealthResponse = ApiResponse<HealthData>;
