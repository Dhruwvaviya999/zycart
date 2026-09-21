import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminShell } from '@/components/admin/admin-shell';
import { getSessionUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · ZyCart Admin' },
  description: 'ZyCart store management.',
  // An internal console has no business in a search index.
  robots: { index: false, follow: false },
};

/**
 * The gate.
 *
 * The role is resolved on the **server**, before any admin markup is produced —
 * so an unauthorised visitor never receives a console to flash on screen, and
 * there is no client-side redirect racing a render. This is the interface's
 * guard; the API's own `requireRole('ADMIN')` is what actually protects the
 * data, and it holds whether or not anybody goes through this page.
 *
 * The two failures get different answers. No session is a redirect to sign in,
 * carrying the destination, because signing in may well fix it. A signed-in
 * customer is told plainly that this area is not theirs — a redirect there
 * would look like the page did not exist and invite them to try again.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  if (!user) redirect('/login?redirect=/admin');

  if (user.role !== 'ADMIN') {
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6">
        <div className="max-w-md text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
            <ShieldAlert className="size-6" aria-hidden />
          </span>

          <h1 className="text-h2 mt-6">This area is for store staff</h1>
          <p className="text-body mt-3 text-pretty text-muted-foreground">
            Your ZyCart account does not have administrator access. If you think it should, ask
            whoever runs the store to grant it.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="cta" variant="brand" render={<Link href="/" />}>
              Back to the store
            </Button>
            <Button size="cta" variant="outline" render={<Link href="/account" />}>
              My account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}
