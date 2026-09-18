import { CartSkeleton, PageHeaderSkeleton } from '@/components/common/loading-state';
import { Container } from '@/components/layout/container';

export default function CartLoading() {
  return (
    <Container className="py-8 sm:py-10">
      <PageHeaderSkeleton />
      <CartSkeleton />
    </Container>
  );
}
