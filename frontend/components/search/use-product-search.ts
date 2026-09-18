'use client';

import { useEffect, useMemo, useState } from 'react';
import { products } from '@/data/products';
import { categories } from '@/data/categories';
import { brands } from '@/data/products';
import type { Product } from '@/types/product';

export interface SearchResults {
  products: Product[];
  categories: typeof categories;
  brands: string[];
}

const EMPTY: SearchResults = { products: [], categories: [], brands: [] };

/**
 * Local catalogue search with a debounce, shaped so the body can be swapped for
 * a backend call in a later phase without changing any consumer.
 */
export function useProductSearch(query: string, delay = 220) {
  const [debounced, setDebounced] = useState(query);

  // Loading is derived, not stored: the input is "loading" exactly while the
  // live query has not yet caught up with the debounced one.
  const loading = query !== debounced;

  useEffect(() => {
    if (query === debounced) return;
    const timer = window.setTimeout(() => setDebounced(query), delay);
    return () => window.clearTimeout(timer);
  }, [query, debounced, delay]);

  const results = useMemo<SearchResults>(() => {
    const term = debounced.trim().toLowerCase();
    if (term.length < 2) return EMPTY;

    const matches = (haystack: string) => haystack.toLowerCase().includes(term);

    return {
      products: products
        .filter(
          (product) =>
            matches(product.name) ||
            matches(product.brand) ||
            matches(product.tagline) ||
            matches(product.category),
        )
        .slice(0, 6),
      categories: categories.filter(
        (category) => matches(category.name) || matches(category.tagline),
      ),
      brands: brands.filter((brand) => matches(brand)).slice(0, 5),
    };
  }, [debounced]);

  const total = results.products.length + results.categories.length + results.brands.length;

  return {
    results,
    loading,
    /** True once a real query has settled and produced nothing. */
    isEmpty: debounced.trim().length >= 2 && total === 0 && !loading,
    hasQuery: debounced.trim().length >= 2,
  };
}
