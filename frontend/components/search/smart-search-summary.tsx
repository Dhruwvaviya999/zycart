'use client';

import { AlertTriangle, Sparkles, X } from 'lucide-react';
import { formatPrice } from '@/lib/format';
import type { ShopFilters } from '@/components/shop/shop-filters';
import type { Brand, Category } from '@/types/product';
import { cn } from '@/lib/utils';

/**
 * What the search was understood to mean — and how to disagree with it.
 *
 * This is the whole honesty contract of smart search in one component. A
 * shopper who types a sentence and gets a filtered page deserves to see which
 * filters they were given, and to remove any of them in one tap. Without that,
 * an interpretation is indistinguishable from a broken search.
 *
 * It renders only when a search actually was interpreted. A plain keyword
 * search shows nothing here, because there is nothing to explain.
 */

interface SmartSearchSummaryProps {
  filters: ShopFilters;
  categories: Category[];
  brands: Brand[];
  /** Shown when interpretation was attempted and failed. */
  notice?: string;
  onChange: (patch: Partial<ShopFilters>) => void;
  className?: string;
}

interface Chip {
  field: string;
  label: string;
  clear: Partial<ShopFilters>;
}

/**
 * Turns the interpreted fields into readable chips.
 *
 * Each one carries the patch that removes it, so "Under ₹3,000" and the tap
 * that undoes it are the same object — there is no second place where the
 * meaning of a chip is decided.
 */
function toChips(filters: ShopFilters, categories: Category[], brands: Brand[]): Chip[] {
  const chips: Chip[] = [];
  const interpreted = new Set(filters.interpreted);

  const nameOf = (list: { slug: string; name: string }[], value: string) =>
    list.find((entry) => entry.slug === value || entry.name === value)?.name ?? value;

  if (interpreted.has('category') && filters.category) {
    chips.push({
      field: 'category',
      label: nameOf(categories, filters.category),
      clear: { category: undefined },
    });
  }

  if (interpreted.has('brand') && filters.brand) {
    chips.push({
      field: 'brand',
      label: nameOf(brands, filters.brand),
      clear: { brand: undefined },
    });
  }

  if (interpreted.has('color') && filters.color) {
    chips.push({ field: 'color', label: filters.color, clear: { color: undefined } });
  }

  if (interpreted.has('maxPrice') && filters.maxPrice !== undefined) {
    chips.push({
      field: 'maxPrice',
      label: `Under ${formatPrice(filters.maxPrice)}`,
      clear: { maxPrice: undefined },
    });
  }

  if (interpreted.has('minPrice') && filters.minPrice !== undefined) {
    chips.push({
      field: 'minPrice',
      label: `Over ${formatPrice(filters.minPrice)}`,
      clear: { minPrice: undefined },
    });
  }

  if (interpreted.has('minRating') && filters.minRating !== undefined) {
    chips.push({
      field: 'minRating',
      label: `${filters.minRating}★ and up`,
      clear: { minRating: undefined },
    });
  }

  if (interpreted.has('inStock') && filters.inStockOnly) {
    chips.push({ field: 'inStock', label: 'In stock', clear: { inStockOnly: false } });
  }

  return chips;
}

export function SmartSearchSummary({
  filters,
  categories,
  brands,
  notice,
  onChange,
  className,
}: SmartSearchSummaryProps) {
  const chips = toChips(filters, categories, brands);

  // Nothing was interpreted and nothing went wrong: an ordinary keyword search,
  // which needs no explanation at all.
  if (chips.length === 0 && !notice) return null;

  /**
   * Removing a chip also removes it from the interpreted set, so it stops being
   * presented as something the search decided — and so the next search treats
   * whatever remains as the shopper's own choice.
   */
  const remove = (chip: Chip) => {
    onChange({
      ...chip.clear,
      interpreted: filters.interpreted.filter((field) => field !== chip.field),
    });
  };

  const clearAll = () =>
    onChange({
      ...Object.assign({}, ...chips.map((chip) => chip.clear)),
      interpreted: [],
    });

  return (
    <section
      aria-label="How this search was understood"
      className={cn(
        'rounded-2xl border border-brand/20 bg-brand-subtle/40 px-4 py-3.5 sm:px-5',
        className,
      )}
    >
      {notice ? (
        <p className="text-small flex items-start gap-2.5 text-pretty">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">{notice}</span>
        </p>
      ) : (
        <>
          <p className="text-caption flex items-center gap-1.5 font-medium text-brand">
            <Sparkles className="size-3.5" aria-hidden />
            Smart filters applied
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <button
                key={chip.field}
                type="button"
                onClick={() => remove(chip)}
                aria-label={`Remove the ${chip.label} filter`}
                className="focus-ring text-caption inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 font-medium transition-colors hover:border-destructive/40 hover:text-destructive"
              >
                {chip.label}
                <X className="size-3" aria-hidden />
              </button>
            ))}

            {chips.length > 1 && (
              <button
                type="button"
                onClick={clearAll}
                className="focus-ring text-caption rounded-md px-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Clear smart filters
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
