import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Skeletons mirror the real layout of what is loading — same aspect ratios,
 * same column counts — so nothing jumps when the content arrives.
 */

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3.5">
      <Skeleton className="aspect-4/5 w-full rounded-2xl" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  );
}

interface ProductGridSkeletonProps {
  count?: number;
  className?: string;
}

export function ProductGridSkeleton({ count = 8, className }: ProductGridSkeletonProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4',
        className,
      )}
      aria-busy
      aria-label="Loading products"
    >
      {Array.from({ length: count }, (_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}

/** Breadcrumbs, title and the line of metadata every inner page opens with. */
export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-4', className)}>
      <Skeleton className="h-3 w-48" />
      <Skeleton className="h-10 w-72 max-w-full" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-10" aria-busy aria-label="Loading page">
      <PageHeaderSkeleton />
      <ProductGridSkeleton />
    </div>
  );
}

export function CartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14',
        className,
      )}
      aria-busy
      aria-label="Loading your cart"
    >
      <ul className="divide-y divide-border border-y border-border">
        {[0, 1, 2].map((index) => (
          <li key={index} className="flex gap-4 py-6 sm:gap-5">
            <Skeleton className="size-24 shrink-0 rounded-xl sm:size-28" />

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-20 shrink-0" />
              </div>
              <Skeleton className="mt-auto h-8 w-32 rounded-xl" />
            </div>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <Skeleton className="h-5 w-32" />
        <div className="mt-5 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="mt-6 h-7 w-40" />
        <Skeleton className="mt-6 h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div
      className="grid gap-10 lg:grid-cols-2 lg:gap-14"
      aria-busy
      aria-label="Loading this product"
    >
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:gap-4">
        <div className="flex gap-3 sm:flex-col">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="size-18 shrink-0 rounded-xl sm:size-20" />
          ))}
        </div>
        <Skeleton className="aspect-4/5 flex-1 rounded-3xl" />
      </div>

      <div className="space-y-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-48" />

        <div className="flex gap-2.5 pt-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="size-9 rounded-full" />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-11 w-16 rounded-xl" />
          ))}
        </div>

        <div className="flex flex-col gap-3 pt-3 sm:flex-row">
          <Skeleton className="h-12 flex-1 rounded-xl" />
          <Skeleton className="h-12 flex-1 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function AccountSkeleton() {
  return (
    <div aria-busy aria-label="Loading your account">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>

      <div className="mt-9 grid gap-9 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <div className="flex gap-2 lg:flex-col lg:gap-1">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-10 w-24 shrink-0 rounded-xl lg:w-full" />
          ))}
        </div>

        <div className="min-w-0 space-y-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 max-w-full" />
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
