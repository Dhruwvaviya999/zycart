'use client';

import { useRouter } from 'next/navigation';
import { LinkAction } from '@/components/common/link-action';
import { verifyEmail } from '@/services/auth.service';
import { confirmNewsletter, unsubscribeFromNewsletter } from '@/services/newsletter.service';
import { optOutOfCartReminders } from '@/services/user.service';

/**
 * The four links ZyCart puts in email, each bound to its one action.
 *
 * Client wrappers because the action is a function, and a server page cannot
 * hand a function to a client component. The pages pass the link's values in;
 * nothing here reads the URL itself.
 */

/** Verification is the click itself, so it runs as the page opens. */
export function VerifyEmailAction({ token }: { token: string }) {
  const router = useRouter();

  return (
    <LinkAction
      automatic
      action={() => verifyEmail(token)}
      workingLabel="Confirming your email address…"
      // A signed-in customer's account banner reads the session, so the page
      // behind this one is refreshed once the address is verified.
      onDone={() => router.refresh()}
      next={[
        { href: '/account', label: 'Go to your account' },
        { href: '/shop', label: 'Start shopping' },
      ]}
    />
  );
}

/** Confirming a subscription is double opt-in's second half: the click is the consent. */
export function ConfirmNewsletterAction({ token }: { token: string }) {
  return (
    <LinkAction
      automatic
      action={() => confirmNewsletter(token)}
      workingLabel="Confirming your subscription…"
      next={[{ href: '/shop', label: 'Browse the shop' }]}
    />
  );
}

/**
 * Leaving the list waits for a click: a mail scanner that previews every link
 * in a newsletter must not be able to unsubscribe its reader.
 */
export function UnsubscribeAction({ id, signature }: { id: string; signature: string }) {
  return (
    <LinkAction
      automatic={false}
      confirmLabel="Unsubscribe"
      action={() => unsubscribeFromNewsletter(id, signature)}
      workingLabel="Unsubscribing…"
      next={[{ href: '/', label: 'Back to ZyCart' }]}
    />
  );
}

/** Switching off cart reminders waits for a click, for the same reason. */
export function CartReminderOptOutAction({
  userId,
  signature,
}: {
  userId: string;
  signature: string;
}) {
  return (
    <LinkAction
      automatic={false}
      confirmLabel="Stop cart reminders"
      action={() => optOutOfCartReminders(userId, signature)}
      workingLabel="Updating your preferences…"
      next={[{ href: '/account/settings', label: 'Email settings' }]}
    />
  );
}
