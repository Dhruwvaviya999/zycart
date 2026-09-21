'use client';

import { X } from 'lucide-react';
import { formatPrice } from '@/lib/format';
import type { ShopFilters } from '@/components/shop/shop-filters';
import type { Brand, Category } from '@/types/product';
import { cn } from '@/lib/utils';

interface ActiveFiltersProps {
  filters: ShopFilters;
  categories: Category[];
  brands: Brand[];
  onChange: (patch: Partial<ShopFilters>) => void;
  onReset: () => void;
  className?: string;
}

/**
 * Every narrowing currently applied, each one removable. Without this the only
 * way back from a filtered view is to reopen the panel and remember what you set.
 *
 * Filters a smart search decided are deliberately left out: the "Smart filters
 * applied" band above already shows and removes those, and listing a budget in
 * both places is the same control twice with two different labels.
 */
export function ActiveFilters({
  filters,
  categories,
  brands,
  onChange,
  onReset,
  className,
}: ActiveFiltersProps) {
  const chips: { key: string; label: string; remove: () => void }[] = [];
  const interpreted = new Set(filters.interpreted);

  if (filters.query.trim()) {
    chips.push({
      key: 'query',
      label: `“${filters.query.trim()}”`,
      remove: () => onChange({ query: '' }),
    });
  }

  if (filters.category && !interpreted.has('category')) {
    const name = categories.find((entry) => entry.slug === filters.category)?.name;
    chips.push({
      key: 'category',
      label: name ?? filters.category,
      remove: () => onChange({ category: undefined }),
    });
  }

  if (filters.brand && !interpreted.has('brand')) {
    const name = brands.find((entry) => entry.slug === filters.brand)?.name;
    chips.push({
      key: 'brand',
      label: name ?? filters.brand,
      remove: () => onChange({ brand: undefined }),
    });
  }

  if (filters.color && !interpreted.has('color')) {
    chips.push({
      key: 'color',
      label: filters.color,
      remove: () => onChange({ color: undefined }),
    });
  }

  if (filters.minRating !== undefined && !interpreted.has('minRating')) {
    chips.push({
      key: 'rating',
      label: `${filters.minRating}★ and up`,
      remove: () => onChange({ minRating: undefined }),
    });
  }

  if (
    (filters.minPrice !== undefined || filters.maxPrice !== undefined) &&
    !interpreted.has('minPrice') &&
    !interpreted.has('maxPrice')
  ) {
    const low = filters.minPrice ?? 0;
    const high = filters.maxPrice;
    chips.push({
      key: 'price',
      label:
        high === undefined
          ? `${formatPrice(low)} and up`
          : `${formatPrice(low)} – ${formatPrice(high)}`,
      remove: () => onChange({ minPrice: undefined, maxPrice: undefined }),
    });
  }

  if (filters.inStockOnly && !interpreted.has('inStock')) {
    chips.push({
      key: 'stock',
      label: 'In stock only',
      remove: () => onChange({ inStockOnly: false }),
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
        onClick={onReset}
        className="focus-ring text-caption rounded-md px-1.5 py-1 font-medium text-brand transition-colors hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
