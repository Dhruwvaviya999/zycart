'use client';

import { useEffect } from 'react';
import { useHealthStore } from '@/store/health-store';

/** Runs the health check once on mount and exposes the store state. */
export function useBackendHealth() {
  const status = useHealthStore((state) => state.status);
  const message = useHealthStore((state) => state.message);
  const data = useHealthStore((state) => state.data);
  const check = useHealthStore((state) => state.check);

  useEffect(() => {
    void check();
  }, [check]);

  return { status, message, data, recheck: check };
}
