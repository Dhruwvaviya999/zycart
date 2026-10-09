import type { Metadata } from 'next';
import { AdminError, AdminPageHeader } from '@/components/admin/admin-ui';
import { TaxonomyManager } from '@/components/admin/taxonomy-manager';
import { toErrorMessage } from '@/services/api';
import { getCategories } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Categories' };

export default async function AdminCategoriesPage() {
  let result;

  try {
    // The taxonomy is short by nature, so it loads whole rather than paged.
    result = await getCategories({ limit: 100 }, { token: await getSessionToken() });
  } catch (error) {
    return (
      <>
        <AdminPageHeader title="Categories" />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Categories"
        description="How products are grouped in the shop. A category with products in it cannot be deleted."
      />
      <TaxonomyManager kind="category" rows={result.items} />
    </>
  );
}
