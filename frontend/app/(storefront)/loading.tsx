import { Container } from '@/components/layout/container';
import { PageSkeleton } from '@/components/common/loading-state';

export default function Loading() {
  return (
    <Container className="py-10">
      <PageSkeleton />
    </Container>
  );
}
