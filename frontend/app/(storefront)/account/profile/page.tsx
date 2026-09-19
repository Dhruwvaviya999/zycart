import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccountPanel } from '@/components/account/account-panel';
import { ProfileForm } from '@/components/account/profile-form';
import { getSessionUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Profile',
  description: 'Your ZyCart profile details.',
};

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?redirect=/account/profile');

  return (
    <AccountPanel title="Profile" description="Your details, as they appear on orders.">
      <ProfileForm user={user} />
    </AccountPanel>
  );
}
