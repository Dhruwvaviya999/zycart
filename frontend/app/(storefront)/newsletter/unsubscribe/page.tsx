import type { Metadata } from 'next';
import { EmailLinkPage, oneParam } from '@/components/common/email-link-page';
import { UnsubscribeAction } from '@/components/common/email-link-actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
};

/**
 * Where a newsletter's unsubscribe link lands.
 *
 * The link is signed for one address, so it works without a sign-in — a
 * subscriber may have no account at all. It asks for one click before acting,
 * so a mail scanner previewing links cannot unsubscribe anybody.
 */
export default async function UnsubscribePage({
  searchParams,
}: PageProps<'/newsletter/unsubscribe'>) {
  const params = await searchParams;
  const id = oneParam(params.id);
  const signature = oneParam(params.s);

  return (
    <EmailLinkPage
      title="Unsubscribe from the newsletter"
      description="You will stop receiving the ZyCart newsletter. Order emails are not affected."
    >
      {id && signature ? (
        <UnsubscribeAction id={id} signature={signature} />
      ) : (
        <p className="text-small rounded-2xl border border-border bg-surface p-6 text-center">
          This link is incomplete. Use the unsubscribe link at the foot of any newsletter.
        </p>
      )}
    </EmailLinkPage>
  );
}
