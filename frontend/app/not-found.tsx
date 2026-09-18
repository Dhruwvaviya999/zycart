import { Compass } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { EmptyState } from '@/components/common/empty-state';

export default function NotFound() {
  return (
    <Container className="py-16">
      <EmptyState
        icon={Compass}
        title="This page does not exist."
        body="The link may be out of date, or the product may have been removed from the catalogue."
        action={{ label: 'Back to home', href: '/' }}
        secondaryAction={{ label: 'Browse the shop', href: '/shop' }}
      />
    </Container>
  );
}
