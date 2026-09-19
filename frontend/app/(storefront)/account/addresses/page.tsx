import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccountPanel } from '@/components/account/account-panel';
import { AddressManager } from '@/components/account/address-manager';
import { getSessionUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Addresses',
  description: 'Your saved delivery addresses.',
};

export default async function AddressesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?redirect=/account/addresses');

  // The session already carries the addresses, so the page needs no second request.
  return (
    <AccountPanel title="Saved addresses" description="Where your orders will be delivered.">
      <AddressManager initialAddresses={user.addresses} />
    </AccountPanel>
  );
}
