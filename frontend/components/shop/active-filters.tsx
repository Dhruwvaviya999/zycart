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

  if (filters.query.trim()) {
    chips.push({
      key: 'query',
      label: `“${filters.query.trim()}”`,
      remove: () => onChange({ query: '' }),
    });
  }

  if (filters.category) {
    const name = categories.find((entry) => entry.slug === filters.category)?.name;
    chips.push({
      key: 'category',
      label: name ?? filters.category,
      remove: () => onChange({ category: undefined }),
    });
  }

  if (filters.brand) {
    const name = brands.find((entry) => entry.slug === filters.brand)?.name;
    chips.push({
      key: 'brand',
      label: name ?? filters.brand,
      remove: () => onChange({ brand: undefined }),
    });
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
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

  if (filters.inStockOnly) {
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
