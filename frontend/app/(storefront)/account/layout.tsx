import { redirect } from 'next/navigation';
import { AccountHeader } from '@/components/account/account-header';
import { AccountNavigation } from '@/components/account/account-navigation';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { Container } from '@/components/layout/container';
import { getSessionUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

/**
 * The authoritative gate on the account area.
 *
 * Middleware already turns away visitors with no cookie, but only this check
 * actually verifies the session — an expired, forged or revoked token gets past
 * the cookie test and is stopped here. Resolving it once in the layout also
 * means every page below can take the user as a prop rather than fetching again.
 */
export default async function AccountLayout({ children }: LayoutProps<'/account'>) {
  const user = await getSessionUser();
  if (!user) redirect('/login?redirect=/account');

  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Account' }]} />

      <div className="mt-5">
        <AccountHeader user={user} />
      </div>

      <div className="mt-9 grid gap-9 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <AccountNavigation />
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
