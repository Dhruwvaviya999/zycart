import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Package, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AdminEmpty,
  AdminError,
  AdminPageHeader,
  AdminTable,
  StatusBadge,
  Td,
  Th,
  Tr,
} from '@/components/admin/admin-ui';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { ProductFilters } from '@/components/admin/product-filters';
import { ProductRowActions } from '@/components/admin/product-row-actions';
import { STOCK_LABEL, stockTone } from '@/components/admin/status-tones';
import { toErrorMessage } from '@/services/api';
import { getBrands, getCategories, getProducts } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';
import { formatDate, formatPrice } from '@/lib/format';
import type { AdminProductQuery, AdminProductRow, StockState } from '@/types/admin';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Products' };

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * Turns URL parameters into an API query.
 *
 * Anything unrecognised is dropped rather than forwarded: the admin endpoints
 * are `.strict()` and would reject a stray parameter with a 400, which is the
 * right behaviour for the API and the wrong experience for somebody who edited
 * a URL by hand.
 */
function toQuery(params: Params): AdminProductQuery {
  const page = Number(one(params.page));
  const boolean = (value: string | undefined) =>
    value === 'true' ? true : value === 'false' ? false : undefined;

  const stock = one(params.stock);
  const sort = one(params.sort);

  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: 20,
    search: one(params.search)?.trim() || undefined,
    category: one(params.category) || undefined,
    brand: one(params.brand) || undefined,
    stock: (['in_stock', 'low_stock', 'out_of_stock'] as const).includes(stock as StockState)
      ? (stock as StockState)
      : undefined,
    active: boolean(one(params.active)),
    featured: boolean(one(params.featured)),
    bestSeller: boolean(one(params.bestSeller)),
    newArrival: boolean(one(params.newArrival)),
    sort: (sort as AdminProductQuery['sort']) || undefined,
  };
}

export default async function AdminProductsPage({ searchParams }: PageProps<'/admin/products'>) {
  const params = await searchParams;
  const query = toQuery(params);
  const token = await getSessionToken();

  const [result, categories, brands] = await Promise.all([
    getProducts(query, { token }).catch((error: unknown) => ({ error })),
    // Filter options, not page data — a generous limit so every category and
    // brand is selectable without paging through them.
    getCategories({ limit: 100 }, { token }).catch(() => ({ items: [] })),
    getBrands({ limit: 100 }, { token }).catch(() => ({ items: [] })),
  ]);

  const header = (
    <AdminPageHeader
      title="Products"
      description="Everything in the catalogue, live or not."
      action={
        <Button size="sm" variant="brand" render={<Link href="/admin/products/new" />}>
          <Plus className="size-3.5" data-icon="inline-start" aria-hidden />
          New product
        </Button>
      }
    />
  );

  if ('error' in result) {
    return (
      <>
        {header}
        <AdminError message={toErrorMessage(result.error)} />
      </>
    );
  }

  const { items, pagination } = result;
  const filtered = Object.keys(params).some((key) => key !== 'page');

  return (
    <>
      {header}

      <ProductFilters categories={categories.items} brands={brands.items} />

      {items.length === 0 ? (
        <AdminEmpty
          icon={Package}
          title={filtered ? 'No products match these filters' : 'No products yet'}
          body={
            filtered
              ? 'Try a broader search, or clear the filters to see the whole catalogue.'
              : 'Add your first product to start selling.'
          }
          action={
            !filtered && (
              <Button size="sm" variant="brand" render={<Link href="/admin/products/new" />}>
                <Plus className="size-3.5" data-icon="inline-start" aria-hidden />
                New product
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Desktop: a real table, because operators compare down columns. */}
          <AdminTable
            className="hidden md:block"
            head={
              <>
                <Th>Product</Th>
                <Th className="hidden xl:table-cell">Category</Th>
                <Th className="hidden xl:table-cell">Brand</Th>
                <Th align="right">Price</Th>
                <Th align="right">Stock</Th>
                <Th>Status</Th>
                <Th className="hidden xl:table-cell">Added</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </>
            }
          >
            {items.map((product) => (
              <Tr key={product.id}>
                <Td>
                  <ProductCell product={product} />
                </Td>
                <Td className="hidden text-muted-foreground xl:table-cell">
                  {product.category?.name ?? '—'}
                </Td>
                <Td className="hidden text-muted-foreground xl:table-cell">
                  {product.brand?.name ?? '—'}
                </Td>
                <Td align="right" className="tabular-nums">
                  {formatPrice(product.price)}
                </Td>
                <Td align="right">
                  <StatusBadge tone={stockTone(product.stockState)}>
                    {product.stock} left
                  </StatusBadge>
                </Td>
                <Td>
                  <StatusBadge tone={product.isActive ? 'success' : 'neutral'}>
                    {product.isActive ? 'Active' : 'Inactive'}
                  </StatusBadge>
                </Td>
                <Td className="hidden text-muted-foreground xl:table-cell">
                  {formatDate(product.createdAt)}
                </Td>
                <Td align="right">
                  <ProductRowActions product={product} />
                </Td>
              </Tr>
            ))}
          </AdminTable>

          {/* Mobile: stacked cards. A table squeezed to 360px is not a table. */}
          <ul className="space-y-2 md:hidden">
            {items.map((product) => (
              <li
                key={product.id}
                className="flex items-start gap-3 rounded-xl border border-border p-3"
              >
                <ProductThumb product={product} />

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="focus-ring text-small block truncate rounded-sm font-medium"
                  >
                    {product.name}
                  </Link>
                  <p className="text-caption mt-0.5 truncate text-muted-foreground">
                    {product.sku} · {product.category?.name ?? 'Uncategorised'}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-small font-medium tabular-nums">
                      {formatPrice(product.price)}
                    </span>
                    <StatusBadge tone={stockTone(product.stockState)}>
                      {STOCK_LABEL[product.stockState]} · {product.stock}
                    </StatusBadge>
                    {!product.isActive && <StatusBadge>Inactive</StatusBadge>}
                  </div>
                </div>

                <ProductRowActions product={product} />
              </li>
            ))}
          </ul>

          <AdminPagination pagination={pagination} shown={items.length} noun="products" />
        </>
      )}
    </>
  );
}

function ProductThumb({ product }: { product: AdminProductRow }) {
  return (
    <span
      className={cn(
        'relative size-10 shrink-0 overflow-hidden rounded-lg bg-surface',
        !product.isActive && 'opacity-60',
      )}
    >
      {product.image && (
        <Image src={product.image} alt="" fill sizes="40px" className="object-cover" />
      )}
    </span>
  );
}

function ProductCell({ product }: { product: AdminProductRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ProductThumb product={product} />

      <div className="min-w-0">
        <Link
          href={`/admin/products/${product.id}`}
          className="focus-ring block truncate rounded-sm font-medium"
        >
          {product.name}
        </Link>
        <p className="text-caption truncate text-muted-foreground">{product.sku}</p>
      </div>
    </div>
  );
}
