import { Compass } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { EmptyState } from '@/components/common/empty-state';
import { StorefrontChrome } from '@/components/layout/storefront-chrome';

/**
 * Next renders the root `not-found` in the root layout, never inside a route
 * group — so this brings the shop's chrome along itself. Without it, a mistyped
 * URL would land on a bare page with no navigation and no way back.
 */
export default function NotFound() {
  return (
    <StorefrontChrome>
      <Container className="py-16">
        <EmptyState
          icon={Compass}
          title="This page does not exist."
          body="The link may be out of date, or the product may have been removed from the catalogue."
          action={{ label: 'Back to home', href: '/' }}
          secondaryAction={{ label: 'Browse the shop', href: '/shop' }}
        />
      </Container>
    </StorefrontChrome>
  );
}
