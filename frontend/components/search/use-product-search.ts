'use client';

import { useEffect, useState } from 'react';
import { toErrorMessage } from '@/services/api';
import { getProducts } from '@/services/product.service';
import type { ProductSummary } from '@/types/product';

const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 6;

export interface ProductSearchState {
  products: ProductSummary[];
  loading: boolean;
  error?: string;
  /** True once a real query has settled and produced nothing. */
  isEmpty: boolean;
  hasQuery: boolean;
}

interface Settled {
  query: string;
  products: ProductSummary[];
  error?: string;
}

/**
 * Debounced catalogue search against `GET /api/products?search=`. The server
 * owns matching, so the overlay and the shop page always agree on results.
 *
 * Only the last settled response is stored; everything the caller reads is
 * derived from whether that response matches the query being typed. Backtracking
 * to a term already fetched therefore answers instantly.
 */
export function useProductSearch(query: string, delay = 280): ProductSearchState {
  const [settled, setSettled] = useState<Settled>({ query: '', products: [] });

  const term = query.trim();
  const hasQuery = term.length >= MIN_QUERY_LENGTH;
  const matched = hasQuery && settled.query === term;

  useEffect(() => {
    if (!hasQuery || settled.query === term) return;

    let cancelled = false;

    const timer = window.setTimeout(() => {
      getProducts({ search: term, limit: RESULT_LIMIT })
        .then((result) => {
          if (!cancelled) setSettled({ query: term, products: result.items });
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setSettled({ query: term, products: [], error: toErrorMessage(cause) });
          }
        });
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term, hasQuery, delay, settled.query]);

  return {
    products: matched ? settled.products : [],
    loading: hasQuery && !matched,
    error: matched ? settled.error : undefined,
    isEmpty: matched && settled.error === undefined && settled.products.length === 0,
    hasQuery,
  };
}
