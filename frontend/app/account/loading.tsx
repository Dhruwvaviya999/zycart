import { AccountSkeleton } from '@/components/common/loading-state';
import { Container } from '@/components/layout/container';

export default function AccountLoading() {
  return (
    <Container className="py-8 sm:py-10">
      <AccountSkeleton />
    </Container>
  );
}
