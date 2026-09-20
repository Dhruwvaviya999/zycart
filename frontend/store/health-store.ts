import { create } from 'zustand';
import { fetchHealth, toErrorMessage } from '@/services/api';
import type { HealthData } from '@/types/api';

/**
 * Three outcomes, not two.
 *
 * `offline` is the API being unreachable. `degraded` is the API answering,
 * correctly, that it is not ready — a 503 with a full report in the body. They
 * look identical to a client that only tracks up and down, and they call for
 * completely different action: one is a network or a deployment, the other is
 * a database.
 */
type Status = 'idle' | 'loading' | 'online' | 'degraded' | 'offline';

interface HealthState {
  status: Status;
  message: string;
  data?: HealthData;
  check: () => Promise<void>;
}

export const useHealthStore = create<HealthState>((set) => ({
  status: 'idle',
  message: '',
  check: async () => {
    set({ status: 'loading', message: 'Contacting the API...' });

    try {
      const response = await fetchHealth();
      const data = response.data;

      set({
        status: data?.status === 'ok' ? 'online' : 'degraded',
        message: response.message ?? '',
        data,
      });
    } catch (error) {
      set({ status: 'offline', message: toErrorMessage(error), data: undefined });
    }
  },
}));
