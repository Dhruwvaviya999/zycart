import { Container } from '@/components/layout/container';
import { ProductGridSkeleton } from '@/components/common/loading-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The placeholder a recommendation rail streams in behind.
 *
 * Sized like the real rail — a heading block and a row of cards — so the page
 * does not jump when the products arrive. Nothing here claims to be
 * personalised, because at this point nobody knows yet whether it will be.
 */
export function RecommendationSkeleton({
  count = 4,
  contained = true,
  className,
}: {
  count?: number;
  contained?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <div className="space-y-2.5">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-8 w-64 rounded-lg" />
      </div>
      <ProductGridSkeleton count={count} className="mt-9" />
    </>
  );

  return (
    <section className={cn('section-tight', className)} aria-hidden>
      {contained ? <Container>{body}</Container> : body}
    </section>
  );
}
