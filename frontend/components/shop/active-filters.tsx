'use client';

import { X } from 'lucide-react';
import { categoryName } from '@/data/categories';
import { priceBounds } from '@/data/products';
import { formatPrice } from '@/lib/format';
import type { ShopFilters } from '@/components/shop/use-shop-filters';
import { cn } from '@/lib/utils';

interface ActiveFiltersProps {
  filters: ShopFilters;
  update: <K extends keyof ShopFilters>(key: K, value: ShopFilters[K]) => void;
  toggleInArray: (key: 'categories' | 'brands', value: string) => void;
  reset: () => void;
  className?: string;
}

/**
 * Every narrowing currently applied, each one removable. Without this the only
 * way back from a filtered view is to reopen the panel and remember what you set.
 */
export function ActiveFilters({
  filters,
  update,
  toggleInArray,
  reset,
  className,
}: ActiveFiltersProps) {
  const chips: { key: string; label: string; remove: () => void }[] = [];

  if (filters.query.trim()) {
    chips.push({
      key: 'query',
      label: `“${filters.query.trim()}”`,
      remove: () => update('query', ''),
    });
  }

  for (const slug of filters.categories) {
    chips.push({
      key: `category-${slug}`,
      label: categoryName(slug),
      remove: () => toggleInArray('categories', slug),
    });
  }

  for (const brand of filters.brands) {
    chips.push({
      key: `brand-${brand}`,
      label: brand,
      remove: () => toggleInArray('brands', brand),
    });
  }

  const [low, high] = filters.priceRange;
  if (low !== priceBounds.min || high !== priceBounds.max) {
    chips.push({
      key: 'price',
      label: `${formatPrice(low)} – ${formatPrice(high)}`,
      remove: () => update('priceRange', [priceBounds.min, priceBounds.max]),
    });
  }

  if (filters.minRating > 0) {
    chips.push({
      key: 'rating',
      label: `${filters.minRating}★ and above`,
      remove: () => update('minRating', 0),
    });
  }

  if (filters.inStockOnly) {
    chips.push({
      key: 'stock',
      label: 'In stock only',
      remove: () => update('inStockOnly', false),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <h2 className="text-caption sr-only">Active filters</h2>

      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          className="focus-ring text-caption group inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-1.5 pr-2 pl-3 font-medium transition-colors hover:border-foreground/25 hover:bg-surface-strong"
        >
          {chip.label}
          <X
            className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden
          />
          <span className="sr-only">Remove filter</span>
        </button>
      ))}

      <button
        type="button"
        onClick={reset}
        className="focus-ring text-caption rounded-md px-1.5 py-1 font-medium text-brand transition-colors hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
