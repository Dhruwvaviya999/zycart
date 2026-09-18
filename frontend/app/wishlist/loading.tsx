import { PageHeaderSkeleton, ProductGridSkeleton } from '@/components/common/loading-state';
import { Container } from '@/components/layout/container';

export default function WishlistLoading() {
  return (
    <Container className="py-8 sm:py-10">
      <PageHeaderSkeleton />
      <ProductGridSkeleton count={4} className="mt-10" />
    </Container>
  );
}
