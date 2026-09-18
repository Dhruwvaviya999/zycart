import { create } from 'zustand';
import { fetchHealth, toErrorMessage } from '@/services/api';
import type { HealthData } from '@/types/api';

type Status = 'idle' | 'loading' | 'online' | 'offline';

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
      set({ status: 'online', message: response.message, data: response.data });
    } catch (error) {
      set({ status: 'offline', message: toErrorMessage(error), data: undefined });
    }
  },
}));
