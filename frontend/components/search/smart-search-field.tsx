'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { Loader2, Search, Sparkles, X } from 'lucide-react';
import { interpretSearch } from '@/services/smart-search.service';
import { buildShopHref, manualFilters, type ShopFilters } from '@/components/shop/shop-filters';
import type { SortKey } from '@/types/product';
import { cn } from '@/lib/utils';

/**
 * The shop's search field, now able to take a sentence.
 *
 * It submits rather than debounces, and that is a deliberate change. The field
 * used to navigate 350ms after the last keystroke, which is right for narrowing
 * by keyword and wrong for a sentence: "black shoes under 3000" would have been
 * searched as "black sho", then "black shoes u", then discarded — and if each
 * of those had been interpreted, as a model call apiece. One submit is one
 * search.
 *
 * Every submit goes through the same endpoint. The server's classifier decides
 * whether the query is worth interpreting, so a short literal search costs a
 * bounded database query and no model call at all; the browser never has to
 * guess which kind of search it is holding.
 */

interface SmartSearchFieldProps {
  filters: ShopFilters;
  /** Reports what the search resolved to, so the page can show a notice. */
  onNotice: (notice: string | undefined) => void;
  className?: string;
}

export function SmartSearchField({ filters, onNotice, className }: SmartSearchFieldProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(filters.query);
  const [syncedWith, setSyncedWith] = useState(filters.query);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef<AbortController | null>(null);

  // Adjusted during render so the field follows the URL when it changes from
  // somewhere else — a chip, Clear all, the back button — without an extra pass.
  if (syncedWith !== filters.query) {
    setSyncedWith(filters.query);
    setDraft(filters.query);
  }

  const submit = useCallback(
    async (raw: string) => {
      const query = raw.trim();

      // An emptied field is "show me everything again", not a search.
      if (!query) {
        onNotice(undefined);
        router.push(
          buildShopHref({ ...filters, query: '', interpreted: [], sort: 'newest', page: 1 }),
          { scroll: false },
        );
        return;
      }

      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      setBusy(true);

      try {
        const result = await interpretSearch(
          {
            query,
            // Only what the shopper chose themselves. A filter the last
            // interpretation contributed is not re-asserted here, so it cannot
            // outlive the query that produced it.
            retain: manualFilters(filters),
          },
          controller.signal,
        );

        onNotice(result.notice);

        router.push(
          buildShopHref({
            ...filters,
            // The model's extracted terms, not the whole sentence: searching
            // for "black shoes under 15000" would make "under" and "15000"
            // words a product has to contain, when they are already the
            // colour and budget filters beside them.
            query: result.filters.query,
            category: result.filters.category,
            brand: result.filters.brand,
            color: result.filters.color,
            minPrice: result.filters.minPrice,
            maxPrice: result.filters.maxPrice,
            minRating: result.filters.minRating,
            inStockOnly: result.filters.inStock ?? false,
            sort: result.filters.sort as SortKey,
            interpreted: result.interpreted,
            page: 1,
          }),
          { scroll: false },
        );
      } catch {
        if (controller.signal.aborted) return;

        /**
         * The endpoint itself was unreachable. The shopper still gets the
         * search they asked for — a plain keyword search, which is what the
         * server would have fallen back to anyway — and is told why it looks
         * literal rather than being left to wonder.
         */
        onNotice('Smart search is unavailable right now, so these are standard search results.');
        router.push(
          buildShopHref({ ...filters, query, interpreted: [], sort: 'relevance', page: 1 }),
          { scroll: false },
        );
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
        setBusy(false);
      }
    },
    [filters, onNotice, router],
  );

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(draft);
      }}
      className={className}
    >
      <label htmlFor="shop-search" className="sr-only">
        Search products, brands, or describe what you need
      </label>

{/* `h-11`, matching the `lg` step of the field ladder: this control sits
          in a row with the Filters button and the sort select, and 40px beside
          two 44px controls reads as a mistake rather than as a hierarchy. */}
      <div className="flex h-11 items-center gap-2 rounded-xl border border-input bg-background px-3.5 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/45">
        {busy ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-brand" aria-hidden />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}

        <input
          id="shop-search"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search or describe what you need..."
          enterKeyHint="search"
          className="text-small w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        />

        {draft && !busy && (
          <button
            type="button"
            onClick={() => {
              setDraft('');
              void submit('');
            }}
            aria-label="Clear search"
            className="focus-ring inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}

        <button
          type="submit"
          disabled={busy}
          aria-label="Search"
          className={cn(
            'focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[0.75rem] font-semibold transition-colors',
            'bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60',
          )}
        >
          <Sparkles className="size-3" aria-hidden />
          <span className="max-sm:sr-only">Search</span>
        </button>
      </div>

      {/*
        Announced rather than shown as a blocking state: the results already on
        screen stay readable while the next search resolves.
      */}
      <p aria-live="polite" className="sr-only">
        {busy ? 'Understanding your search' : ''}
      </p>
    </form>
  );
}
