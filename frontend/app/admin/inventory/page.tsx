import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Boxes, Layers, PackageX, TriangleAlert } from 'lucide-react';
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
import { InventoryFilters } from '@/components/admin/inventory-filters';
import { AdjustStockButton } from '@/components/admin/inventory-controls';
import { signed, STOCK_LABEL, stockTone } from '@/components/admin/status-tones';
import { toErrorMessage } from '@/services/api';
import {
  getBrands,
  getCategories,
  getInventory,
  getInventorySummary,
} from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';
import { formatDayLabel } from '@/lib/format';
import type { InventoryQuery, InventoryRow, InventorySummary, StockState } from '@/types/admin';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Inventory' };

/**
 * The stock screen.
 *
 * Ordered scarcest-first by default, because the question this page exists to
 * answer is "what is about to run out?" rather than "what do we sell?" — the
 * products screen already answers the second one.
 *
 * Every number here is read from the same `Product.stock` the storefront sells
 * against. There is no separate inventory record to fall out of step with it,
 * and nothing on this page computes a quantity in the browser.
 *
 * The summary strip loads independently of the table: it is a second query, and
 * a failure in it leaves the table — the part an operator came for — working.
 */
type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const STOCK_STATES: StockState[] = ['in_stock', 'low_stock', 'out_of_stock'];
const SORTS = ['stock_asc', 'stock_desc', 'name_asc', 'updated_desc'] as const;

/**
 * Turns URL parameters into an API query.
 *
 * Anything unrecognised is dropped rather than forwarded: the admin endpoints
 * are `.strict()` and would answer a stray parameter with a 400, which is right
 * for the API and wrong for somebody who edited a URL by hand.
 */
function toQuery(params: Params): InventoryQuery {
  const page = Number(one(params.page));
  const status = one(params.status);
  const sort = one(params.sort);
  const active = one(params.active);

  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: 20,
    search: one(params.search)?.trim() || undefined,
    status: STOCK_STATES.includes(status as StockState) ? (status as StockState) : undefined,
    category: one(params.category) || undefined,
    brand: one(params.brand) || undefined,
    active: active === 'true' ? true : active === 'false' ? false : undefined,
    recentlyChanged: one(params.recentlyChanged) === 'true' ? true : undefined,
    sort: SORTS.includes(sort as InventoryQuery['sort'] & string)
      ? (sort as InventoryQuery['sort'])
      : undefined,
  };
}

export default async function AdminInventoryPage({ searchParams }: PageProps<'/admin/inventory'>) {
  const params = await searchParams;
  const query = toQuery(params);
  const token = await getSessionToken();

  const [result, summary, categories, brands] = await Promise.all([
    getInventory(query, { token }).catch((error: unknown) => ({ error })),
    // Secondary. A failure here must not take the table down with it.
    getInventorySummary({ token }).catch(() => null),
    getCategories({ limit: 100 }, { token }).catch(() => ({ items: [] })),
    getBrands({ limit: 100 }, { token }).catch(() => ({ items: [] })),
  ]);

  const header = (
    <AdminPageHeader
      title="Inventory"
      description="Stock levels across the catalogue, scarcest first. Every change is recorded with a reason."
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

  /**
   * Where the adjustment dialog asks a second time.
   *
   * Sent by the server rather than written here, so the number an operator is
   * warned at cannot drift from the one the API documents. If the summary
   * request failed, zero means *every* adjustment asks for confirmation —
   * erring toward the harmless direction, since an extra question never loses
   * data and a silently missing one might.
   */
  const largeAdjustment = summary?.largeAdjustmentThreshold ?? 0;

  return (
    <>
      {header}

      {summary && <SummaryStrip summary={summary} />}

      <InventoryFilters categories={categories.items} brands={brands.items} />

      {items.length === 0 ? (
        <AdminEmpty
          icon={Boxes}
          title={filtered ? 'No products match these filters' : 'Nothing in the catalogue yet'}
          body={
            filtered
              ? 'Try a broader search, or clear the filters to see every product.'
              : 'Stock appears here once the catalogue has products in it.'
          }
        />
      ) : (
        <>
          {/* Desktop: a real table. Operators compare stock down a column. */}
          <AdminTable
            className="hidden md:block"
            head={
              <>
                <Th>Product</Th>
                <Th className="hidden lg:table-cell">Category</Th>
                <Th align="right">Stock</Th>
                <Th align="right" className="hidden xl:table-cell">
                  Warns at
                </Th>
                <Th>Status</Th>
                <Th className="hidden lg:table-cell">Last movement</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </>
            }
          >
            {items.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <ProductCell row={row} />
                </Td>
                <Td className="hidden text-muted-foreground lg:table-cell">
                  {row.category || '—'}
                </Td>
                <Td align="right" className="text-small font-semibold tabular-nums">
                  {row.stock}
                </Td>
                <Td
                  align="right"
                  className="hidden tabular-nums text-muted-foreground xl:table-cell"
                >
                  {row.lowStockThreshold}
                  {row.usesDefaultThreshold && (
                    <span className="text-caption ml-1 font-normal">(default)</span>
                  )}
                </Td>
                <Td>
                  <StatusBadge tone={stockTone(row.stockState)}>
                    {STOCK_LABEL[row.stockState]}
                  </StatusBadge>
                </Td>
                <Td className="hidden lg:table-cell">
                  <LastMovement movement={row.lastMovement} />
                </Td>
                <Td align="right">
                  <RowAdjust row={row} largeAdjustment={largeAdjustment} />
                </Td>
              </Tr>
            ))}
          </AdminTable>

          {/* Mobile: stacked cards. A seven-column table at 360px is not a table. */}
          <ul className="space-y-2 md:hidden">
            {items.map((row) => (
              <li key={row.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start gap-3">
                  <Thumb row={row} />

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/inventory/${row.id}`}
                      className="focus-ring text-small block truncate rounded-sm font-medium"
                    >
                      {row.name}
                    </Link>
                    <p className="text-caption mt-0.5 truncate text-muted-foreground">
                      {row.sku}
                      {row.category ? ` · ${row.category}` : ''}
                    </p>
                    <VariantHint row={row} />
                  </div>

                  <span className="text-small shrink-0 font-semibold tabular-nums">
                    {row.stock}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <StatusBadge tone={stockTone(row.stockState)}>
                    {STOCK_LABEL[row.stockState]}
                  </StatusBadge>
                  {!row.isActive && <StatusBadge>Hidden</StatusBadge>}
                  <span className="text-caption text-muted-foreground">
                    Warns at {row.lowStockThreshold}
                  </span>

                  <RowAdjust row={row} largeAdjustment={largeAdjustment} className="ml-auto" />
                </div>
              </li>
            ))}
          </ul>

          <AdminPagination pagination={pagination} shown={items.length} noun="products" />
        </>
      )}
    </>
  );
}

/**
 * Four counts, each one a link to the rows behind it.
 *
 * Deliberately not charts. "How many are out of stock" is a number with an
 * action attached, and a donut of it would take four times the space to say the
 * same thing less precisely.
 */
function SummaryStrip({ summary }: { summary: InventorySummary }) {
  const cards = [
    {
      label: 'Out of stock',
      value: summary.outOfStock,
      href: '/admin/inventory?status=out_of_stock',
      tone: summary.outOfStock > 0 ? 'danger' : 'neutral',
      icon: PackageX,
    },
    {
      label: 'Low stock',
      value: summary.lowStock,
      href: '/admin/inventory?status=low_stock',
      tone: summary.lowStock > 0 ? 'warning' : 'neutral',
      icon: TriangleAlert,
    },
    {
      label: 'Healthy',
      value: summary.healthy,
      href: '/admin/inventory?status=in_stock',
      tone: 'neutral',
      icon: Boxes,
    },
  ] as const;

  return (
    <section
      aria-label="Inventory health"
      className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <Link
            key={card.label}
            href={card.href}
            className={cn(
              'focus-ring rounded-xl border p-4 transition-colors',
              card.tone === 'danger'
                ? 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10'
                : card.tone === 'warning'
                  ? 'border-amber-400/30 bg-amber-400/5 hover:bg-amber-400/10'
                  : 'border-border bg-surface/40 hover:bg-muted/40',
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-caption font-medium text-muted-foreground">{card.label}</span>
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </span>
            <span className="text-h3 mt-2 block tabular-nums">
              {card.value.toLocaleString('en-IN')}
            </span>
            <span className="text-caption mt-1 block text-muted-foreground">
              of {summary.activeProducts.toLocaleString('en-IN')} live products
            </span>
          </Link>
        );
      })}

      <div className="rounded-xl border border-border bg-surface/40 p-4">
        <p className="text-caption font-medium text-muted-foreground">Sellable units</p>
        <p className="text-h3 mt-2 tabular-nums">{summary.sellableUnits.toLocaleString('en-IN')}</p>
        <p className="text-caption mt-1 text-pretty text-muted-foreground">
          {summary.recentAdjustments === 0
            ? 'No manual adjustments this week'
            : `${summary.recentAdjustments} manual adjustment${
                summary.recentAdjustments === 1 ? '' : 's'
              } this week`}
        </p>
      </div>
    </section>
  );
}

function LastMovement({ movement }: { movement: InventoryRow['lastMovement'] }) {
  if (!movement) {
    return <span className="text-caption text-muted-foreground">No movements yet</span>;
  }

  return (
    <span className="block min-w-0">
      <span className="text-small block truncate">
        <span className="font-medium tabular-nums">{signed(movement.quantityChange)}</span>{' '}
        {movement.summary}
      </span>
      <span className="text-caption block text-muted-foreground">
        {formatDayLabel(movement.createdAt)}
      </span>
    </span>
  );
}

function Thumb({ row }: { row: InventoryRow }) {
  return (
    <span
      className={cn(
        'relative size-10 shrink-0 overflow-hidden rounded-lg bg-surface',
        !row.isActive && 'opacity-60',
      )}
    >
      {row.image && <Image src={row.image} alt="" fill sizes="40px" className="object-cover" />}
    </span>
  );
}

function ProductCell({ row }: { row: InventoryRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Thumb row={row} />

      <div className="min-w-0">
        <Link
          href={`/admin/inventory/${row.id}`}
          className="focus-ring block truncate rounded-sm font-medium"
        >
          {row.name}
        </Link>
        <p className="text-caption truncate text-muted-foreground">
          {row.sku}
          {!row.isActive && ' · Hidden from the shop'}
        </p>
        <VariantHint row={row} />
      </div>
    </div>
  );
}

/**
 * `6 variants · 4 in stock`, under a product that counts stock per colour and
 * size (Phase 20).
 *
 * The stock column is still the product's total, which is right for sorting
 * and for the status badge. But a total of 40 can hide a best-selling size at
 * zero, and this is the one line that says to look closer.
 */
function VariantHint({ row }: { row: InventoryRow }) {
  if (!row.variants) return null;

  const { total, available } = row.variants;

  return (
    <p
      className={cn(
        'text-caption truncate',
        available < total ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
      )}
    >
      {total} {total === 1 ? 'variant' : 'variants'} · {available} in stock
    </p>
  );
}

/**
 * The row's adjustment: the dialog for one count, the product's page for many.
 *
 * A product that tracks stock per variant cannot be adjusted as a whole — the
 * server refuses it, because the units would belong to no colour or size — and
 * a table row has no room to choose which variant. So the row links to the
 * page that lists them, under a name that says why it is not the usual button.
 */
function RowAdjust({
  row,
  largeAdjustment,
  className,
}: {
  row: InventoryRow;
  largeAdjustment: number;
  className?: string;
}) {
  if (!row.variants) {
    return (
      <AdjustStockButton
        product={row}
        largeAdjustmentThreshold={largeAdjustment}
        className={className}
      />
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className={className}
      render={<Link href={`/admin/inventory/${row.id}`} />}
      aria-label={`Adjust stock per variant for ${row.name}`}
    >
      <Layers className="size-3.5" data-icon="inline-start" aria-hidden />
      Per variant
    </Button>
  );
}
