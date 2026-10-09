import type { Metadata } from 'next';
import { AdminError, AdminPageHeader } from '@/components/admin/admin-ui';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { ReviewFilters } from '@/components/admin/review-filters';
import { ReviewModeration } from '@/components/admin/review-moderation';
import { toErrorMessage } from '@/services/api';
import { getReviews } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';
import type { AdminReviewQuery } from '@/types/admin';
import type { ReviewStatus } from '@/types/review';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Reviews' };

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function toQuery(params: Params): AdminReviewQuery {
  const page = Number(one(params.page));
  const status = one(params.status);
  const rating = Number(one(params.rating));
  const verified = one(params.verified);
  const sort = one(params.sort);

  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: 20,
    search: one(params.search)?.trim() || undefined,
    status: ['PENDING', 'APPROVED', 'REJECTED'].includes(status ?? '')
      ? (status as ReviewStatus)
      : undefined,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : undefined,
    verified: verified === 'true' ? true : verified === 'false' ? false : undefined,
    sort: ['newest', 'oldest', 'rating_asc', 'rating_desc'].includes(sort ?? '')
      ? (sort as AdminReviewQuery['sort'])
      : undefined,
  };
}

/**
 * Review moderation.
 *
 * Approving and rejecting go through Phase 8's `moderateReview`, which moves
 * the product's rating aggregates in the same transaction — so a rejected
 * review stops counting towards the star rating the moment it is rejected, and
 * no admin code path touches `rating` or `reviewCount` directly.
 */
export default async function AdminReviewsPage({ searchParams }: PageProps<'/admin/reviews'>) {
  const params = await searchParams;

  let result;
  try {
    result = await getReviews(toQuery(params), { token: await getSessionToken() });
  } catch (error) {
    return (
      <>
        <AdminPageHeader title="Reviews" />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  const { items, pagination } = result;

  return (
    <>
      <AdminPageHeader
        title="Reviews"
        description="Only approved reviews appear in the shop and count towards a product's rating."
      />

      <ReviewFilters />

      <ReviewModeration reviews={items} />

      <AdminPagination pagination={pagination} shown={items.length} noun="reviews" />
    </>
  );
}
