'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Clock, Loader2, Search, SearchX, Tag, TrendingUp, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { popularSearches, recentSearches } from '@/data/navigation';
import { useProductSearch } from '@/components/search/use-product-search';
import { useUiStore } from '@/store/ui-store';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

export function SearchOverlay() {
  const open = useUiStore((state) => state.searchOpen);
  const setOpen = useUiStore((state) => state.setSearchOpen);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const { results, loading, isEmpty, hasQuery } = useProductSearch(query);

  // Cmd/Ctrl-K opens search from anywhere on the site.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery('');
  }

  function submit(term: string) {
    const trimmed = term.trim();
    if (!trimmed) return;
    setOpen(false);
    router.push(`/shop?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-0 max-w-full translate-y-0 gap-0 overflow-hidden rounded-none border-x-0 border-t-0 p-0 sm:top-[8vh] sm:max-w-2xl sm:rounded-2xl sm:border"
      >
        <DialogTitle className="sr-only">Search ZyCart</DialogTitle>
        <DialogDescription className="sr-only">
          Search products, brands and categories across the ZyCart catalogue.
        </DialogDescription>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(query);
          }}
          className="flex items-center gap-3 border-b border-border px-4 sm:px-5"
        >
          <Search className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />

          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search products, brands and categories..."
            aria-label="Search products, brands and categories"
            className="text-body h-14 w-full bg-transparent outline-none placeholder:text-muted-foreground sm:h-16"
          />

          {loading && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="focus-ring inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="focus-ring text-caption hidden shrink-0 rounded-md border border-border px-2 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Esc
          </button>
        </form>

        <div className="max-h-[70vh] overflow-y-auto overscroll-contain p-4 sm:max-h-[60vh] sm:p-5">
          {!hasQuery && (
            <div className="space-y-6">
              <Suggestions
                icon={Clock}
                title="Recent searches"
                terms={recentSearches}
                onPick={submit}
              />
              <Suggestions
                icon={TrendingUp}
                title="Popular searches"
                terms={popularSearches}
                onPick={submit}
              />
            </div>
          )}

          {isEmpty && (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <div className="mb-4 grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
                <SearchX className="size-5" aria-hidden />
              </div>
              <p className="text-h4">No matches for &ldquo;{query.trim()}&rdquo;</p>
              <p className="text-small mt-2 max-w-sm text-muted-foreground">
                Check the spelling, or try a broader term like the category or brand name.
              </p>
            </div>
          )}

          {hasQuery && !isEmpty && (
            <div className="space-y-6">
              {results.products.length > 0 && (
                <section>
                  <SectionLabel>Products</SectionLabel>
                  <ul className="mt-2 space-y-1">
                    {results.products.map((product) => (
                      <li key={product.id}>
                        <Link
                          href={`/products/${product.slug}`}
                          onClick={() => setOpen(false)}
                          className="focus-ring flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted"
                        >
                          <span className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-surface">
                            {product.images[0] && (
                              <Image
                                src={product.images[0].url}
                                alt=""
                                fill
                                sizes="48px"
                                className="object-cover"
                              />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="text-caption block text-muted-foreground">
                              {product.brand}
                            </span>
                            <span className="text-small block truncate font-medium">
                              {product.name}
                            </span>
                          </span>
                          <span className="text-price shrink-0">{formatPrice(product.price)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {results.categories.length > 0 && (
                <section>
                  <SectionLabel>Categories</SectionLabel>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {results.categories.map((category) => (
                      <Link
                        key={category.slug}
                        href={`/shop?category=${category.slug}`}
                        onClick={() => setOpen(false)}
                        className="focus-ring text-small inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 transition-colors hover:bg-muted"
                      >
                        <Tag className="size-3.5 text-muted-foreground" aria-hidden />
                        {category.name}
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {results.brands.length > 0 && (
                <section>
                  <SectionLabel>Brands</SectionLabel>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {results.brands.map((brand) => (
                      <Link
                        key={brand}
                        href={`/shop?brand=${encodeURIComponent(brand)}`}
                        onClick={() => setOpen(false)}
                        className="focus-ring text-small inline-flex rounded-full border border-border px-3 py-1.5 transition-colors hover:bg-muted"
                      >
                        {brand}
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-label px-2 text-muted-foreground">{children}</h2>;
}

interface SuggestionsProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  terms: string[];
  onPick: (term: string) => void;
}

function Suggestions({ icon: Icon, title, terms, onPick }: SuggestionsProps) {
  return (
    <section>
      <h2 className="text-label flex items-center gap-1.5 px-2 text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </h2>
      <div className={cn('mt-2 flex flex-wrap gap-2 px-2')}>
        {terms.map((term) => (
          <button
            key={term}
            type="button"
            onClick={() => onPick(term)}
            className="focus-ring text-small rounded-full border border-border px-3 py-1.5 transition-colors hover:border-brand/40 hover:bg-brand-subtle hover:text-brand"
          >
            {term}
          </button>
        ))}
      </div>
    </section>
  );
}
