'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/common/select-field';
import { cn } from '@/lib/utils';

/**
 * Listing state lives in the URL.
 *
 * Which means a filtered view can be bookmarked, shared with a colleague, and
 * reached again with the back button — all of which an operations team does
 * constantly ("send me the link to the unpaid ones"). It also means the state
 * survives a refresh without any client persistence.
 */
export function useAdminFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = useCallback((key: string) => searchParams.get(key) ?? '', [searchParams]);

  /**
   * Writes filters back to the URL.
   *
   * Any change other than the page itself resets to page one, because staying
   * on page four of a result set that no longer has four pages shows an
   * operator an empty table and no explanation.
   */
  const set = useCallback(
    (changes: Record<string, string | number | boolean | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === '' || value === false) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }

      if (!('page' in changes)) next.delete('page');

      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const clear = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return { get, set, clear, searchParams };
}

/**
 * A search box that waits for the typing to stop.
 *
 * 350ms, which is long enough that a normal typing rhythm produces one request
 * instead of twelve, and short enough that it does not feel laggy. The input is
 * uncontrolled between keystrokes and re-synced when the URL changes from
 * elsewhere — a "clear filters" button, or the back button.
 */
export function AdminSearch({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  /**
   * The typed text, plus the external value it was last reconciled against.
   *
   * Adjusting during render rather than in an effect is React's own answer to
   * "reset state when a prop changes": when the URL moves without going through
   * this input — a cleared filter, the back button — the draft follows
   * immediately, with no extra render and no effect to keep in step.
   */
  const [state, setState] = useState({ external: value, draft: value });

  if (state.external !== value) setState({ external: value, draft: value });

  const draft = state.draft;
  const setDraft = (next: string) => setState({ external: value, draft: next });

  useEffect(() => {
    if (draft === value) return;

    const timer = setTimeout(() => onChange(draft), 350);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <div className={cn('relative min-w-0', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            onChange('');
          }}
          aria-label="Clear search"
          className="focus-ring absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * A labelled filter dropdown.
 *
 * This was a native `<select>`, chosen because it is keyboard-accessible for
 * free. It still is — `SelectField` wraps Base UI's listbox, which keeps
 * type-ahead, the arrow keys, Home/End, Enter and Escape — but the option list
 * is now ZyCart's rather than the operating system's, which matters because
 * the admin console is the one place a native picker was still visible next to
 * the styled controls around it.
 */
export function AdminSelect({
  label,
  value,
  options,
  onChange,
  allLabel = 'All',
  className,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  allLabel?: string;
  className?: string;
}) {
  const labelId = `admin-filter-${label.replace(/\W+/g, '-').toLowerCase()}`;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span id={labelId} className="text-caption font-medium text-muted-foreground">
        {label}
      </span>
      <SelectField
        value={value}
        onValueChange={onChange}
        options={options}
        clearLabel={allLabel}
        placeholder={allLabel}
        aria-labelledby={labelId}
      />
    </div>
  );
}

/**
 * The filter row.
 *
 * Wraps rather than scrolls, so nothing is hidden off the edge of a phone, and
 * the clear-all appears only when there is something to clear.
 */
export function FilterBar({
  children,
  active,
  onClear,
}: {
  children: React.ReactNode;
  active: boolean;
  onClear: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface/40 p-3">
      {children}
      {active && (
        <Button size="sm" variant="ghost" onClick={onClear} className="mb-px">
          <X className="size-3.5" data-icon="inline-start" aria-hidden />
          Clear filters
        </Button>
      )}
    </div>
  );
}
