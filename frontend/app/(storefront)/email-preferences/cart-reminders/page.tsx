import type { Metadata } from 'next';
import { EmailLinkPage, oneParam } from '@/components/common/email-link-page';
import { CartReminderOptOutAction } from '@/components/common/email-link-actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cart reminders',
  robots: { index: false, follow: false },
};

/**
 * Where "Stop cart reminders" at the foot of a reminder lands.
 *
 * Signed for one account, so it needs no sign-in; one click, so a scanner
 * cannot press it. Reminders can be turned back on from the account settings.
 */
export default async function CartRemindersPage({
  searchParams,
}: PageProps<'/email-preferences/cart-reminders'>) {
  const params = await searchParams;
  const userId = oneParam(params.u);
  const signature = oneParam(params.s);

  return (
    <EmailLinkPage
      title="Cart reminders"
      description="We send one reminder when a cart is left untouched. Your order emails are not affected."
    >
      {userId && signature ? (
        <CartReminderOptOutAction userId={userId} signature={signature} />
      ) : (
        <p className="text-small rounded-2xl border border-border bg-surface p-6 text-center">
          This link is incomplete. You can change reminders from your account settings.
        </p>
      )}
    </EmailLinkPage>
  );
}
