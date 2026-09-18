import { ProductDetailSkeleton } from '@/components/common/loading-state';
import { Container } from '@/components/layout/container';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProductLoading() {
  return (
    <Container className="py-8 sm:py-10">
      <Skeleton className="h-3 w-56 max-w-full" />
      <div className="mt-7">
        <ProductDetailSkeleton />
      </div>
    </Container>
  );
}
