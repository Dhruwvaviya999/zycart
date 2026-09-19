'use client';

import Link from 'next/link';
import { CircleAlert, Inbox, Loader2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The pieces every admin listing is built from.
 *
 * One implementation each, because four listing screens that each grew their
 * own table, empty state and pagination would drift apart within a week — and
 * an operator who has learned one screen would have to learn the next.
 */

/* ---------------------------------------------------------------- */
/* Page chrome                                                       */
/* ---------------------------------------------------------------- */

export function AdminPageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="focus-ring text-caption mb-2 inline-flex items-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:text-foreground"
        >
          ← {back.label}
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h3">{title}</h1>
          {description && (
            <p className="text-caption mt-1 text-pretty text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* States                                                            */
/* ---------------------------------------------------------------- */

export function AdminEmpty({
  icon: Icon = Inbox,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface/40 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-small mt-4 font-semibold">{title}</p>
      {body && <p className="text-caption mt-1.5 max-w-sm text-pretty text-muted-foreground">{body}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex gap-2.5 rounded-xl border border-sale/30 bg-sale/5 p-5">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-sale" aria-hidden />
      <div className="min-w-0">
        <p className="text-small font-semibold text-sale">Something went wrong</p>
        <p className="text-caption mt-1 text-pretty text-muted-foreground">{message}</p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="mt-4">
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

/** Shaped like the rows it replaces, so the table does not jump when data lands. */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div aria-hidden className="overflow-hidden rounded-xl border border-border">
      <div className="border-b border-border bg-surface/60 px-4 py-3">
        <Skeleton className="h-3.5 w-28" />
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0"
        >
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          {Array.from({ length: columns - 1 }, (_, column) => (
            <Skeleton key={column} className={cn('h-3.5', column === 0 ? 'flex-1' : 'w-16')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Table                                                             */
/* ---------------------------------------------------------------- */

/**
 * A real `<table>` on desktop.
 *
 * Operators compare down columns, and a grid of cards makes that impossible —
 * so the desktop view is a semantic table with `<th scope="col">` headers, and
 * each listing page supplies its own stacked card layout for phones rather than
 * letting the table overflow sideways.
 *
 * Two details on the wrapper are load-bearing. `overflow-x-auto` rather than
 * `overflow-hidden`: a table cannot shrink below the minimum width of its
 * content, so at an awkward width the last column — the one with the row
 * actions in it — was being clipped away with no way to reach it. Scrolling
 * inside the panel keeps it reachable. And `relative`, because an absolutely
 * positioned descendant (the visually-hidden "Actions" header) otherwise
 * escapes the wrapper entirely and stretches the whole document sideways.
 */
export function AdminTable({
  head,
  children,
  className,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative overflow-x-auto rounded-xl border border-border', className)}>
      <table className="w-full border-collapse text-left">
        <thead className="bg-surface/60">
          <tr className="border-b border-border">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  children,
  className,
  align = 'left',
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      scope="col"
      className={cn(
        'text-caption px-4 py-2.5 font-semibold tracking-wide text-muted-foreground uppercase',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  align = 'left',
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      className={cn(
        'text-small px-4 py-3 align-middle',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={cn('border-b border-border transition-colors last:border-0 hover:bg-muted/40', className)}>
      {children}
    </tr>
  );
}

/* ---------------------------------------------------------------- */
/* Pagination                                                        */
/* ---------------------------------------------------------------- */

export function AdminPagination({
  page,
  totalPages,
  total,
  shown,
  onChange,
  busy = false,
}: {
  page: number;
  totalPages: number;
  total: number;
  shown: number;
  onChange: (page: number) => void;
  busy?: boolean;
}) {
  if (total === 0) return null;

  const first = (page - 1) * 20 + 1;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-caption text-muted-foreground" aria-live="polite">
        {busy ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Loading…
          </span>
        ) : (
          <>
            Showing {shown === 0 ? 0 : first}–{first + shown - 1} of{' '}
            {total.toLocaleString('en-IN')}
          </>
        )}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange(page - 1)}
            disabled={page <= 1 || busy}
          >
            Previous
          </Button>
          <span className="text-caption tabular-nums text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange(page + 1)}
            disabled={page >= totalPages || busy}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Badges                                                            */
/* ---------------------------------------------------------------- */

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success/12 text-success',
  warning: 'bg-amber-400/15 text-amber-700 dark:text-amber-300',
  danger: 'bg-destructive/10 text-destructive',
  brand: 'bg-brand-subtle text-brand',
};

/** Words carry the meaning; the tone only reinforces it. */
export function StatusBadge({
  children,
  tone = 'neutral',
  icon: Icon,
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-caption inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-medium',
        TONES[tone],
        className,
      )}
    >
      {Icon && <Icon className="size-3" aria-hidden />}
      {children}
    </span>
  );
}
