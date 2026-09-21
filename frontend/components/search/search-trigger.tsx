'use client';

import { Search } from 'lucide-react';
import { useUiStore } from '@/store/ui-store';
import { cn } from '@/lib/utils';

interface SearchTriggerProps {
  /** `field` looks like an input; `icon` is the compact button used on small screens. */
  variant?: 'field' | 'icon';
  className?: string;
}

/**
 * The entry point to search. It is deliberately not an input: a single overlay
 * owns the query so the experience is identical from every surface.
 */
export function SearchTrigger({ variant = 'field', className }: SearchTriggerProps) {
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search"
        className={cn(
          'focus-ring inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted',
          className,
        )}
      >
        <Search className="size-[18px]" aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      className={cn(
        'focus-ring text-small flex h-10 w-full items-center gap-2.5 rounded-full border border-border bg-surface px-4 text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-surface-strong',
        className,
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      {/*
        No shortcut badge. Ctrl/Cmd-K still opens search — the overlay owns that
        handler — but a keyboard hint in the field is a developer-tool
        convention, and a shopper reads it as one more thing to decode before
        they can type. The label keeps the full width of the control instead.
      */}
      <span className="truncate">Search products, brands and categories...</span>
    </button>
  );
}
