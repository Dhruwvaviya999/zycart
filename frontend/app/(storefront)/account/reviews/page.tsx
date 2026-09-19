import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccountPanel } from '@/components/account/account-panel';
import { ErrorState } from '@/components/common/error-state';
import { MyReviewsClient } from '@/components/reviews/my-reviews-client';
import { toErrorMessage } from '@/services/api';
import { getMyReviews } from '@/services/review.service';
import { getSessionCookie, getSessionUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My reviews',
  description: 'Reviews you have written.',
};

const PAGE_SIZE = 20;

/**
 * Everything this customer has written, in one place.
 *
 * Reviews are otherwise only reachable from the product they are about, which
 * makes "what did I say about that thing?" a hunt. This is also the only
 * surface that shows a review's moderation status, because its author is the
 * one person entitled to know it.
 */
export default async function MyReviewsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?redirect=/account/reviews');

  let result;
  try {
    result = await getMyReviews({ limit: PAGE_SIZE }, { cookie: await getSessionCookie() });
  } catch (error) {
    return (
      <AccountPanel title="My reviews" description="Reviews you have written.">
        <ErrorState
          title="We could not load your reviews."
          body={toErrorMessage(error)}
          secondaryAction={{ label: 'Back to account', href: '/account' }}
        />
      </AccountPanel>
    );
  }

  const { items, pagination } = result;

  return (
    <AccountPanel
      title="My reviews"
      description={
        pagination.total === 0
          ? 'Reviews you write will appear here.'
          : `${pagination.total} ${pagination.total === 1 ? 'review' : 'reviews'} written.`
      }
    >
      <MyReviewsClient initialReviews={items} pagination={pagination} />
    </AccountPanel>
  );
}
