import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminError, AdminPageHeader, StatusBadge } from '@/components/admin/admin-ui';
import { ProductForm } from '@/components/admin/product-form';
import { stockTone, STOCK_LABEL } from '@/components/admin/status-tones';
import { ApiError, toErrorMessage } from '@/services/api';
import { getBrands, getCategories, getProduct } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';
import type { StockState } from '@/types/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Edit product' };

/** The same threshold the API uses, so the badge agrees with the filter. */
function stockState(stock: number): StockState {
  if (stock <= 0) return 'out_of_stock';
  return stock <= 5 ? 'low_stock' : 'in_stock';
}

export default async function EditProductPage({ params }: PageProps<'/admin/products/[id]'>) {
  const { id } = await params;
  const token = await getSessionToken();

  let product;
  let categories;
  let brands;

  try {
    [product, categories, brands] = await Promise.all([
      getProduct(id, { token }),
      getCategories({ limit: 100 }, { token }),
      getBrands({ limit: 100 }, { token }),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();

    return (
      <>
        <AdminPageHeader title="Product" back={{ href: '/admin/products', label: 'Products' }} />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title={product.name}
        description={`${product.sku} · ${product.category.name} · ${product.brand.name}`}
        back={{ href: '/admin/products', label: 'Products' }}
        action={
          <>
            <StatusBadge tone={product.isActive ? 'success' : 'neutral'} className="self-center">
              {product.isActive ? 'Active' : 'Inactive'}
            </StatusBadge>
            <StatusBadge tone={stockTone(stockState(product.stock))} className="self-center">
              {STOCK_LABEL[stockState(product.stock)]} · {product.stock}
            </StatusBadge>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/products/${product.slug}`} target="_blank" rel="noreferrer" />}
            >
              <ExternalLink className="size-3.5" data-icon="inline-start" aria-hidden />
              View
            </Button>
          </>
        }
      />

      <ProductForm product={product} categories={categories.items} brands={brands.items} />
    </>
  );
}
