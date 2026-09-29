import type { Metadata } from 'next';
import { EmailLinkPage, oneParam } from '@/components/common/email-link-page';
import { ConfirmNewsletterAction } from '@/components/common/email-link-actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Confirm your subscription',
  robots: { index: false, follow: false },
};

/** The second half of double opt-in: the link in the confirmation email lands here. */
export default async function ConfirmNewsletterPage({
  searchParams,
}: PageProps<'/newsletter/confirm'>) {
  const token = oneParam((await searchParams).token);

  return (
    <EmailLinkPage
      title="The ZyCart newsletter"
      description="New arrivals, restocks and member pricing — one email a week."
    >
      {token ? (
        <ConfirmNewsletterAction token={token} />
      ) : (
        <p className="text-small rounded-2xl border border-border bg-surface p-6 text-center">
          This link is incomplete. Open the confirmation email again, or sign up once more from the
          home page.
        </p>
      )}
    </EmailLinkPage>
  );
}
