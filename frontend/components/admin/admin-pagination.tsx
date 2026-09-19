'use client';

import { Button } from '@/components/ui/button';
import { useAdminFilters } from '@/components/admin/admin-filters';
import type { Pagination } from '@/types/product';

/**
 * Pagination for a server-rendered listing.
 *
 * Writes the page into the URL and lets the server component re-render, rather
 * than holding a page number in client state — which is what makes the back
 * button work and a link to page three mean page three.
 */
export function AdminPagination({
  pagination,
  shown,
  noun = 'results',
}: {
  pagination: Pagination;
  shown: number;
  noun?: string;
}) {
  const { set } = useAdminFilters();

  const { page, limit, total, totalPages } = pagination;
  if (total === 0) return null;

  const first = (page - 1) * limit + 1;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-caption text-muted-foreground">
        Showing {first}–{first + shown - 1} of {total.toLocaleString('en-IN')} {noun}
      </p>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => set({ page: page - 1 })}
            disabled={page <= 1}
          >
            Previous
          </Button>

          <span className="text-caption tabular-nums text-muted-foreground">
            Page {page} of {totalPages}
          </span>

          <Button
            size="sm"
            variant="outline"
            onClick={() => set({ page: page + 1 })}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
