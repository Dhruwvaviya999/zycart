import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/admin/admin-ui';

/**
 * Every admin page is `force-dynamic` and fetches on the server, so navigation
 * would otherwise sit on the previous screen with no sign it had registered
 * the click. This is shaped like the listings it stands in for — heading,
 * filters, table — so the page settles into place rather than jumping.
 */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-3.5 w-72" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>

      <TableSkeleton />
    </div>
  );
}
