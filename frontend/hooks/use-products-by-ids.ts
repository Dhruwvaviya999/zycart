'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getProductsByIds } from '@/services/product.service';
import { toErrorMessage } from '@/services/api';
import type { ProductSummary } from '@/types/product';

type Status = 'loading' | 'ready' | 'error';

export interface ProductsByIdsResult {
  products: Map<string, ProductSummary>;
  status: Status;
  error?: string;
  retry: () => void;
}

/**
 * Resolves the product ids the cart and wishlist keep in local storage.
 *
 * Already-fetched products are cached for the life of the page, so removing a
 * line or changing a quantity re-renders without another request; only ids that
 * have never been seen trigger a fetch.
 */
export function useProductsByIds(ids: string[], enabled = true): ProductsByIdsResult {
  const cache = useRef(new Map<string, ProductSummary>());
  const [products, setProducts] = useState<Map<string, ProductSummary>>(new Map());
  const [status, setStatus] = useState<Status>(ids.length === 0 ? 'ready' : 'loading');
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  const key = ids.join(',');
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;

    const wanted = key ? key.split(',') : [];
    const missing = wanted.filter((id) => !cache.current.has(id));

    if (missing.length === 0) {
      setProducts(new Map(cache.current));
      setStatus('ready');
      setError(undefined);
      return;
    }

    let cancelled = false;
    setStatus('loading');

    getProductsByIds(missing)
      .then((fetched) => {
        if (cancelled) return;
        for (const product of fetched) cache.current.set(product.id, product);
        setProducts(new Map(cache.current));
        setStatus('ready');
        setError(undefined);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(toErrorMessage(cause));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [key, enabled, attempt]);

  return { products, status, error, retry };
}
