'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type TabValue = 'description' | 'specifications' | 'reviews';

/** Only ever `#reviews` or `#specifications`; anything else means the default. */
function tabFromHash(hash: string): TabValue | null {
  if (hash === '#reviews') return 'reviews';
  if (hash === '#specifications') return 'specifications';
  return null;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/**
 * The description / specifications / reviews tabs.
 *
 * The panels arrive as props rather than being built here, so the description
 * and the specification table stay server-rendered — a client component that
 * owned that markup would take it out of the initial HTML, which is the last
 * thing a product page wants.
 *
 * The selected tab lives in the URL hash rather than in component state. That
 * is what makes `…/products/slug#reviews` open on the reviews, so the rating in
 * the purchase panel can link straight to them and a customer can share the
 * link they are actually looking at. Reading it through
 * `useSyncExternalStore` keeps the server's render (no hash) and the client's
 * first render in agreement, which a lazy `useState` initialiser would not.
 */
export function ProductTabs({
  reviewCount,
  description,
  specifications,
  reviews,
}: {
  reviewCount: number;
  description: React.ReactNode;
  specifications: React.ReactNode | null;
  reviews: React.ReactNode;
}) {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    // The server has no hash, so it renders the default tab.
    () => '',
  );

  const requested = tabFromHash(hash);
  const value: TabValue =
    requested === 'specifications' && !specifications
      ? 'description'
      : (requested ?? 'description');

  const select = useCallback((next: string) => {
    // `replaceState` rather than pushing: flipping between tabs should not fill
    // the back button with steps that look like navigation.
    const url = next === 'description' ? window.location.pathname : `#${next}`;
    window.history.replaceState(null, '', url);

    // `replaceState` does not fire `hashchange`, so the store is told directly.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, []);

  return (
    <Tabs value={value} onValueChange={(next) => select(String(next))}>
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="description">Description</TabsTrigger>
        {specifications && <TabsTrigger value="specifications">Specifications</TabsTrigger>}
        <TabsTrigger value="reviews">
          Reviews{reviewCount > 0 ? ` (${reviewCount})` : ''}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="description" className="pt-8">
        {description}
      </TabsContent>

      {specifications && (
        <TabsContent value="specifications" className="pt-8">
          {specifications}
        </TabsContent>
      )}

      <TabsContent value="reviews" className="pt-8">
        {reviews}
      </TabsContent>
    </Tabs>
  );
}
