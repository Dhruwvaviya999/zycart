import type { Metadata } from 'next';
import { AdminError, AdminPageHeader } from '@/components/admin/admin-ui';
import { ProductForm } from '@/components/admin/product-form';
import { toErrorMessage } from '@/services/api';
import { getBrands, getCategories } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  const token = await getSessionToken();

  let categories;
  let brands;

  try {
    [categories, brands] = await Promise.all([
      getCategories({ limit: 100, active: true }, { token }),
      getBrands({ limit: 100, active: true }, { token }),
    ]);
  } catch (error) {
    return (
      <>
        <AdminPageHeader
          title="New product"
          back={{ href: '/admin/products', label: 'Products' }}
        />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="New product"
        description="Set its status, pricing and catalogue details, then save."
        back={{ href: '/admin/products', label: 'Products' }}
      />

      <ProductForm categories={categories.items} brands={brands.items} />
    </>
  );
}
