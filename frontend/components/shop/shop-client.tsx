'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { PackageSearch, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { EmptyState } from '@/components/common/empty-state';
import { ProductGridSkeleton } from '@/components/common/loading-state';
import { Container } from '@/components/layout/container';
import { ProductGrid } from '@/components/product/product-grid';
import { ActiveFilters } from '@/components/shop/active-filters';
import { FilterPanel } from '@/components/shop/filter-panel';
import { ShopPagination } from '@/components/shop/shop-pagination';
import {
  buildShopHref,
  countActiveFilters,
  defaultFilters,
  SORT_OPTIONS,
  type ShopFilters,
} from '@/components/shop/shop-filters';
import type { Brand, Category, Pagination, ProductSummary, SortKey } from '@/types/product';
import { cn } from '@/lib/utils';

interface ShopClientProps {
  filters: ShopFilters;
  products: ProductSummary[];
  pagination: Pagination;
  categories: Category[];
  brands: Brand[];
  priceCeiling: number;
}

export function ShopClient({
  filters,
  products,
  pagination,
  categories,
  brands,
  priceCeiling,
}: ShopClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeCount = countActiveFilters(filters);

  /**
   * Filters live in the URL, so every change is a navigation. `useTransition`
   * keeps the current results on screen — dimmed — while the next page loads,
   * instead of blanking the grid on each keystroke.
   */
  const apply = useCallback(
    (patch: Partial<ShopFilters>) => {
      // Any change other than paging returns to the first page, or you can end
      // up on page 4 of a two-page result.
      const next: ShopFilters = { ...filters, ...patch, page: patch.page ?? 1 };
      startTransition(() => router.push(buildShopHref(next), { scroll: false }));
    },
    [filters, router],
  );

  function reset() {
    startTransition(() => router.push(buildShopHref(defaultFilters), { scroll: false }));
  }

  const heading = filters.query
    ? `Results for “${filters.query}”`
    : (categories.find((entry) => entry.slug === filters.category)?.name ?? 'All products');

  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Shop' }]} />

      <header className="mt-5 flex flex-col gap-2">
        <h1 className="text-h1">{heading}</h1>
        <p className="text-small text-muted-foreground" aria-live="polite">
          {pagination.total} {pagination.total === 1 ? 'product' : 'products'}
          {activeCount > 0 &&
            ` · ${activeCount} ${activeCount === 1 ? 'filter' : 'filters'} applied`}
        </p>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-h4">Filters</h2>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  className="focus-ring text-caption rounded-md font-medium text-brand transition-colors hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto pr-1">
              <FilterPanel
                filters={filters}
                categories={categories}
                brands={brands}
                priceCeiling={priceCeiling}
                onChange={apply}
              />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
            <ShopSearchField
              value={filters.query}
              onCommit={(query) => apply({ query })}
              className="w-full sm:w-auto sm:max-w-sm sm:min-w-56 sm:flex-1"
            />

            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger
                render={
                  <Button variant="outline" size="cta" className="lg:hidden">
                    <SlidersHorizontal className="size-4" data-icon="inline-start" />
                    Filters
                    {activeCount > 0 && (
                      <span className="ml-1 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground">
                        {activeCount}
                      </span>
                    )}
                  </Button>
                }
              />

              <SheetContent
                side="bottom"
                showCloseButton={false}
                className="flex max-h-[86vh] flex-col gap-0 p-0 data-[side=bottom]:h-auto data-[side=bottom]:rounded-t-3xl"
              >
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <SheetTitle className="text-h4">Filters</SheetTitle>
                  <div className="flex items-center gap-2">
                    {activeCount > 0 && (
                      <button
                        type="button"
                        onClick={reset}
                        className="focus-ring text-caption rounded-md font-medium text-brand"
                      >
                        Clear all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(false)}
                      aria-label="Close filters"
                      className="focus-ring inline-flex size-8 items-center justify-center rounded-full hover:bg-muted"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain px-5">
                  <FilterPanel
                    filters={filters}
                    categories={categories}
                    brands={brands}
                    priceCeiling={priceCeiling}
                    onChange={apply}
                  />
                </div>

                <div className="border-t border-border p-4">
                  <Button
                    size="cta-lg"
                    variant="brand"
                    className="w-full"
                    onClick={() => setDrawerOpen(false)}
                  >
                    Show {pagination.total} {pagination.total === 1 ? 'product' : 'products'}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-small hidden shrink-0 text-muted-foreground sm:inline">
                Sort by
              </span>
              <Select
                value={filters.sort}
                onValueChange={(value) => apply({ sort: value as SortKey })}
              >
                <SelectTrigger
                  size="default"
                  aria-label="Sort products"
                  className="h-10 w-[11.5rem] rounded-xl"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ActiveFilters
            filters={filters}
            categories={categories}
            brands={brands}
            onChange={apply}
            onReset={reset}
            className="mt-4"
          />

          {products.length > 0 ? (
            <>
              <div
                className={cn(
                  'mt-8 transition-opacity duration-200',
                  pending && 'pointer-events-none opacity-50',
                )}
                aria-busy={pending}
              >
                <ProductGrid products={products} columns={4} priorityCount={4} />
              </div>

              <ShopPagination
                pagination={pagination}
                onPageChange={(page) => apply({ page })}
                className="mt-12 border-t border-border pt-8"
              />
            </>
          ) : pending ? (
            <ProductGridSkeleton count={8} className="mt-8" />
          ) : (
            <EmptyState
              icon={PackageSearch}
              title="No products found."
              body="Nothing matches this combination of filters. Try widening the price range, or clear a filter or two."
              action={{ label: 'Clear all filters', onClick: reset }}
              secondaryAction={{ label: 'Back to home', href: '/' }}
              className="mt-8"
            />
          )}
        </div>
      </div>
    </Container>
  );
}

interface ShopSearchFieldProps {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
}

/**
 * Narrows the current result set. Typing is debounced so a search is one
 * navigation rather than one per character.
 */
function ShopSearchField({ value, onCommit, className }: ShopSearchFieldProps) {
  const [draft, setDraft] = useState(value);
  const [syncedWith, setSyncedWith] = useState(value);

  // Adjust during render so the field follows the URL when it changes from
  // somewhere else (a chip, Clear all) without an extra render pass.
  if (syncedWith !== value) {
    setSyncedWith(value);
    setDraft(value);
  }

  // Only the timer callback writes state, so typing is one navigation rather
  // than one per character.
  useEffect(() => {
    if (draft === value) return;

    const timer = window.setTimeout(() => onCommit(draft), 350);
    return () => window.clearTimeout(timer);
  }, [draft, value, onCommit]);

  return (
    <div className={className}>
      <label htmlFor="shop-search" className="sr-only">
        Search within these products
      </label>

      <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 transition-shadow focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/45">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />

        <input
          id="shop-search"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search these products..."
          className="text-small w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        />

        {draft && (
          <button
            type="button"
            onClick={() => setDraft('')}
            aria-label="Clear search"
            className="focus-ring inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
