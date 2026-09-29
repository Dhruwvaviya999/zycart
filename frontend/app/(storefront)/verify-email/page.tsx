import type { Metadata } from 'next';
import Link from 'next/link';
import { EmailLinkPage, oneParam } from '@/components/common/email-link-page';
import { VerifyEmailAction } from '@/components/common/email-link-actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Verify your email',
  // A single-use token is in this page's URL; nothing should index it.
  robots: { index: false, follow: false },
};

/**
 * Where the verification email lands.
 *
 * Works signed in or not — the link is often opened on a phone while the
 * account is open on a laptop — because the token in it is the proof.
 */
export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const token = oneParam((await searchParams).token);

  return (
    <EmailLinkPage
      title="Verify your email"
      description="Confirming the address your order updates and receipts go to."
    >
      {token ? (
        <VerifyEmailAction token={token} />
      ) : (
        <p className="text-small rounded-2xl border border-border bg-surface p-6 text-center text-pretty">
          This link is incomplete. Open the most recent verification email again, or ask for a new
          link from{' '}
          <Link
            href="/account"
            className="focus-ring rounded-sm font-medium text-brand hover:underline"
          >
            your account
          </Link>
          .
        </p>
      )}
    </EmailLinkPage>
  );
}
