import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccountPanel } from '@/components/account/account-panel';
import { AlertList } from '@/components/account/alert-list';
import { ErrorState } from '@/components/common/error-state';
import { toErrorMessage } from '@/services/api';
import { getAlerts } from '@/services/alert.service';
import { getSessionCookie, getSessionUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Alerts',
  description: 'Products you have asked us to tell you about.',
};

/**
 * Back-in-stock and price-drop alerts, in one place (Phase 20).
 *
 * Read on the server with the customer's own cookie, like every other account
 * page, so the list is there on first paint; removing one happens in the
 * browser. Unpaginated on purpose: the API caps waiting alerts at fifty and
 * returns at most a hundred in all, which is one comfortable page.
 */
export default async function AlertsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?redirect=/account/alerts');

  let alerts;
  try {
    alerts = await getAlerts({}, { cookie: await getSessionCookie() });
  } catch (error) {
    return (
      <AccountPanel title="Alerts" description="Products you have asked us to watch.">
        <ErrorState
          title="We could not load your alerts."
          body={toErrorMessage(error)}
          secondaryAction={{ label: 'Back to account', href: '/account' }}
        />
      </AccountPanel>
    );
  }

  const waiting = alerts.filter((alert) => alert.status === 'ACTIVE').length;

  return (
    <AccountPanel
      title="Alerts"
      description={
        alerts.length === 0
          ? 'Restocks and price drops you ask about will be tracked here.'
          : waiting === 0
            ? 'Nothing waiting — everything you asked about has been answered.'
            : `${waiting} ${waiting === 1 ? 'alert' : 'alerts'} waiting. Each is emailed once, when it is answered.`
      }
    >
      <AlertList initialAlerts={alerts} />
    </AccountPanel>
  );
}
