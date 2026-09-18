'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination } from '@/types/product';
import { cn } from '@/lib/utils';

interface ShopPaginationProps {
  pagination: Pagination;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Shows at most five numbered pages around the current one, so the control keeps
 * its width whether the catalogue has three pages or three hundred.
 */
function pageWindow(page: number, totalPages: number): number[] {
  const span = Math.min(5, totalPages);
  const start = Math.min(Math.max(1, page - 2), totalPages - span + 1);
  return Array.from({ length: span }, (_, index) => start + index);
}

export function ShopPagination({ pagination, onPageChange, className }: ShopPaginationProps) {
  const { page, totalPages, total, limit } = pagination;
  if (totalPages <= 1) return null;

  const firstOnPage = (page - 1) * limit + 1;
  const lastOnPage = Math.min(page * limit, total);

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-col items-center gap-4 sm:flex-row sm:justify-between', className)}
    >
      <p className="text-small text-muted-foreground tabular-nums">
        Showing {firstOnPage}–{lastOnPage} of {total}
      </p>

      <ul className="flex items-center gap-1">
        <li>
          <PageButton
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            label="Previous page"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </PageButton>
        </li>

        {pageWindow(page, totalPages).map((entry) => (
          <li key={entry}>
            <PageButton
              onClick={() => onPageChange(entry)}
              current={entry === page}
              label={`Page ${entry}`}
            >
              {entry}
            </PageButton>
          </li>
        ))}

        <li>
          <PageButton
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            label="Next page"
          >
            <ChevronRight className="size-4" aria-hidden />
          </PageButton>
        </li>
      </ul>
    </nav>
  );
}

function PageButton({
  children,
  onClick,
  disabled = false,
  current = false,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  current?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'focus-ring text-small inline-flex size-10 items-center justify-center rounded-xl border font-medium tabular-nums transition-colors',
        current
          ? 'border-foreground bg-foreground text-background'
          : 'border-border hover:bg-muted disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      {children}
    </button>
  );
}
