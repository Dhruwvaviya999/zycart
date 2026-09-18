import type { Metadata } from 'next';
import { AccountClient } from '@/components/account/account-client';

/**
 * Read from MongoDB on every request: nothing is prerendered at build time,
 * so `next build` never needs a running API.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Account',
  description: 'Your ZyCart profile, orders, addresses and preferences.',
};

const TABS = ['profile', 'orders', 'wishlist', 'addresses', 'settings'] as const;
type TabKey = (typeof TABS)[number];

export default async function AccountPage({ searchParams }: PageProps<'/account'>) {
  const params = await searchParams;
  const requested = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tab = TABS.includes(requested as TabKey) ? (requested as TabKey) : 'profile';

  return <AccountClient initialTab={tab} />;
}
