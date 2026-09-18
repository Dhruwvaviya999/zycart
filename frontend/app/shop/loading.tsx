import { Container } from '@/components/layout/container';
import { ProductGridSkeleton } from '@/components/common/loading-state';
import { Skeleton } from '@/components/ui/skeleton';

export default function ShopLoading() {
  return (
    <Container className="py-10">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-5 h-10 w-64" />
      <Skeleton className="mt-3 h-4 w-32" />

      <div className="mt-8 grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
        <div className="hidden space-y-6 lg:block">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
        <ProductGridSkeleton />
      </div>
    </Container>
  );
}
