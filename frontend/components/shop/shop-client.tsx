'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
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
import { ProductGridSkeleton } from '@/components/common/loading-state';
import { Container } from '@/components/layout/container';
import { ProductGrid } from '@/components/product/product-grid';
import { ActiveFilters } from '@/components/shop/active-filters';
import { FilterPanel } from '@/components/shop/filter-panel';
import { ShopPagination } from '@/components/shop/shop-pagination';
import { SmartSearchField } from '@/components/search/smart-search-field';
import { SmartSearchSummary } from '@/components/search/smart-search-summary';
import { SearchEmptyState } from '@/components/search/search-empty-state';
import {
  buildShopHref,
  countActiveFilters,
  defaultFilters,
  SORT_OPTIONS,
  type ShopFilters,
} from '@/components/shop/shop-filters';
import type { Brand, Category, Pagination, ProductSummary, SortKey } from '@/types/product';
import { cn } from '@/lib/utils';

/**
 * Filter fields whose URL name differs from the patch key that changes them.
 * `inStock` is stored as `inStockOnly` on the client but is called `inStock`
 * everywhere the server and the interpretation refer to it.
 */
const FIELD_ALIASES: Record<string, string> = { inStock: 'inStockOnly' };

interface ShopClientProps {
  filters: ShopFilters;
  products: ProductSummary[];
  pagination: Pagination;
  categories: Category[];
  brands: Brand[];
  priceCeiling: number;
  colors: string[];
}

export function ShopClient({
  filters,
  products,
  pagination,
  categories,
  brands,
  priceCeiling,
  colors,
}: ShopClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drawerOpen, setDrawerOpen] = useState(false);

  /**
   * Set only when interpretation was attempted and failed. Kept in component
   * state rather than in the URL: it describes one attempt, not the page, and
   * a refresh of a standard-results page should not keep apologising for a
   * model call that is no longer being made.
   */
  const [notice, setNotice] = useState<string>();

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

      /**
       * Any filter the shopper changes by hand stops being one the search
       * decided — so it survives the next smart search, and stops being
       * presented as something the interpretation chose. Explicit choices win,
       * and this is where that begins.
       */
      if (patch.interpreted === undefined) {
        const touched = Object.keys(patch).filter((key) => key !== 'page');
        next.interpreted = filters.interpreted.filter(
          (field) => !touched.includes(field) && !touched.includes(FIELD_ALIASES[field] ?? field),
        );
      }

      startTransition(() => router.push(buildShopHref(next), { scroll: false }));
    },
    [filters, router],
  );

  function reset() {
    setNotice(undefined);
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
                colors={colors}
                onChange={apply}
              />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
            <SmartSearchField
              filters={filters}
              onNotice={setNotice}
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
                    colors={colors}
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
              {/*
                `items` is what makes the trigger read "Newest first" rather
                than "newest": without it Base UI has no way to map the value
                back to a label, and the control was showing the raw sort key.
              */}
              <Select
                items={SORT_OPTIONS}
                value={filters.sort}
                onValueChange={(value) => apply({ sort: value as SortKey })}
              >
                <SelectTrigger size="lg" aria-label="Sort products" className="w-[12rem]">
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

          <SmartSearchSummary
            filters={filters}
            categories={categories}
            brands={brands}
            notice={notice}
            onChange={apply}
            className="mt-4"
          />

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
            <SearchEmptyState filters={filters} onChange={apply} onReset={reset} className="mt-8" />
          )}
        </div>
      </div>
    </Container>
  );
}
