'use client';

import { useCallback, useMemo, useState } from 'react';
import { matchesSearch, priceBounds, products } from '@/data/products';
import type { CategorySlug, Product, SortKey } from '@/types/product';
import { discountPercent } from '@/lib/format';

export interface ShopFilters {
  query: string;
  categories: CategorySlug[];
  brands: string[];
  priceRange: [number, number];
  minRating: number;
  inStockOnly: boolean;
  sort: SortKey;
}

export const defaultFilters: ShopFilters = {
  query: '',
  categories: [],
  brands: [],
  priceRange: [priceBounds.min, priceBounds.max],
  minRating: 0,
  inStockOnly: false,
  sort: 'featured',
};

const sorters: Record<SortKey, (a: Product, b: Product) => number> = {
  featured: (a, b) => b.unitsSold - a.unitsSold,
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  rating: (a, b) => b.rating - a.rating,
  discount: (a, b) =>
    discountPercent(b.price, b.compareAtPrice) - discountPercent(a.price, a.compareAtPrice),
};

export const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'discount', label: 'Biggest discount' },
];

export function useShopFilters(initial: Partial<ShopFilters>) {
  const [filters, setFilters] = useState<ShopFilters>({ ...defaultFilters, ...initial });

  const update = useCallback(<K extends keyof ShopFilters>(key: K, value: ShopFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const toggleInArray = useCallback(<T extends string>(key: 'categories' | 'brands', value: T) => {
    setFilters((current) => {
      const list = current[key] as T[];
      return {
        ...current,
        [key]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
      };
    });
  }, []);

  const reset = useCallback(() => setFilters(defaultFilters), []);

  const results = useMemo(() => {
    const term = filters.query.trim();

    return products
      .filter((product) => {
        if (term && !matchesSearch(product, term)) return false;
        if (filters.categories.length && !filters.categories.includes(product.category)) {
          return false;
        }
        if (filters.brands.length && !filters.brands.includes(product.brand)) return false;
        if (product.price < filters.priceRange[0] || product.price > filters.priceRange[1]) {
          return false;
        }
        if (filters.minRating && product.rating < filters.minRating) return false;
        if (filters.inStockOnly && !product.inStock) return false;
        return true;
      })
      .sort(sorters[filters.sort]);
  }, [filters]);

  const activeCount =
    filters.categories.length +
    filters.brands.length +
    (filters.minRating > 0 ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0) +
    (filters.priceRange[0] !== priceBounds.min || filters.priceRange[1] !== priceBounds.max
      ? 1
      : 0);

  return { filters, results, activeCount, update, toggleInArray, reset };
}
