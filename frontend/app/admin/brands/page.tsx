import type { Metadata } from 'next';
import { AdminError, AdminPageHeader } from '@/components/admin/admin-ui';
import { TaxonomyManager } from '@/components/admin/taxonomy-manager';
import { toErrorMessage } from '@/services/api';
import { getBrands } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Brands' };

export default async function AdminBrandsPage() {
  let result;

  try {
    result = await getBrands({ limit: 100 }, { token: await getSessionToken() });
  } catch (error) {
    return (
      <>
        <AdminPageHeader title="Brands" />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Brands"
        description="Labels products carry and customers filter by."
      />
      <TaxonomyManager kind="brand" rows={result.items} />
    </>
  );
}
