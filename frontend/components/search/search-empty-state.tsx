'use client';

import Link from 'next/link';
import { PackageSearch } from 'lucide-react';
import { formatPrice } from '@/lib/format';
import type { ShopFilters } from '@/components/shop/shop-filters';
import { cn } from '@/lib/utils';

/**
 * What to show when a search matches nothing.
 *
 * "No products found" is technically true and practically useless. What a
 * shopper needs is the one change most likely to produce results — and it
 * differs per search, so the suggestions are derived from the filters that are
 * actually applied rather than from a fixed list.
 *
 * Every suggestion here relaxes something real. There is no "try a different
 * spelling" for a query with no spelling problem, and no "raise your budget"
 * for a shopper who never set one.
 */

interface Suggestion {
  label: string;
  patch: Partial<ShopFilters>;
}

function suggestionsFor(filters: ShopFilters): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (filters.maxPrice !== undefined) {
    suggestions.push({
      label: `Raise the budget above ${formatPrice(filters.maxPrice)}`,
      patch: { maxPrice: undefined },
    });
  }

  if (filters.color) {
    suggestions.push({
      label: `Any colour, not just ${filters.color}`,
      patch: { color: undefined },
    });
  }

  if (filters.minRating !== undefined) {
    suggestions.push({ label: 'Include lower-rated products', patch: { minRating: undefined } });
  }

  if (filters.category) {
    suggestions.push({ label: 'Search every category', patch: { category: undefined } });
  }

  if (filters.brand) {
    suggestions.push({ label: 'Search every brand', patch: { brand: undefined } });
  }

  if (filters.inStockOnly) {
    suggestions.push({ label: 'Include out-of-stock products', patch: { inStockOnly: false } });
  }

  // Only worth offering when the words are doing the narrowing — dropping a
  // one-word query usually just shows the whole catalogue.
  if (filters.query.trim().split(/\s+/).length > 2) {
    suggestions.push({ label: 'Search with fewer words', patch: { query: '', interpreted: [] } });
  }

  return suggestions.slice(0, 4);
}

interface SearchEmptyStateProps {
  filters: ShopFilters;
  onChange: (patch: Partial<ShopFilters>) => void;
  onReset: () => void;
  className?: string;
}

export function SearchEmptyState({ filters, onChange, onReset, className }: SearchEmptyStateProps) {
  const suggestions = suggestionsFor(filters);
  const searched = filters.query.trim();

  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-3xl border border-dashed border-border bg-surface/50 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
        <PackageSearch className="size-5" aria-hidden />
      </div>

      <h2 className="text-h3">
        {searched ? <>No matches for &ldquo;{searched}&rdquo;</> : 'No products found'}
      </h2>

      <p className="text-small mt-2 max-w-md text-pretty text-muted-foreground">
        {suggestions.length > 0
          ? 'Nothing in the catalogue matches every requirement. Loosening one of these usually helps.'
          : 'Nothing matches this combination of filters.'}
      </p>

      {suggestions.length > 0 && (
        <ul className="mt-6 flex flex-wrap justify-center gap-2">
          {suggestions.map((suggestion) => (
            <li key={suggestion.label}>
              <button
                type="button"
                onClick={() => onChange(suggestion.patch)}
                className="focus-ring text-small rounded-full border border-border bg-background px-3.5 py-2 font-medium transition-colors hover:border-brand/40 hover:bg-brand-subtle hover:text-brand"
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onReset}
          className="focus-ring text-small inline-flex h-10 items-center rounded-xl bg-foreground px-4 font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          Clear all filters
        </button>

        <Link
          href="/ai-shopping"
          className="focus-ring text-small inline-flex h-10 items-center rounded-xl border border-border px-4 font-medium transition-colors hover:bg-muted"
        >
          Ask ZyCart AI instead
        </Link>
      </div>
    </div>
  );
}
