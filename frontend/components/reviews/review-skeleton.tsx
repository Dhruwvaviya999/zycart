import { Skeleton } from '@/components/ui/skeleton';

/**
 * The review list while it loads.
 *
 * Shaped like the cards it replaces — avatar, two lines of meta, a title and a
 * paragraph — so the section does not resize when the real reviews arrive.
 */
export function ReviewSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden className="divide-y divide-border">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="py-6 first:pt-0">
          <div className="flex items-start gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-3.5 w-20 shrink-0" />
          </div>

          <div className="mt-4 space-y-2 sm:pl-12">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
