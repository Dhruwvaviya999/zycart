import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, History, Layers, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminError, AdminPageHeader, StatusBadge } from '@/components/admin/admin-ui';
import { AdjustStockButton, ThresholdControl } from '@/components/admin/inventory-controls';
import { InventoryMovementTimeline } from '@/components/admin/inventory-movement-timeline';
import { STOCK_LABEL, stockTone } from '@/components/admin/status-tones';
import { ApiError, toErrorMessage } from '@/services/api';
import { getInventoryItem, getInventorySummary } from '@/services/admin.service';
import { getSessionCookie } from '@/lib/server-auth';
import { formatDateTime, formatPrice } from '@/lib/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Stock' };

/**
 * One product's stock, and the story of how it got there.
 *
 * Laid out around the two things an operator comes here to do: see the current
 * position at a glance, and change it deliberately. Everything else — the
 * variants, the totals, the timeline — is context for that second decision.
 *
 * Size availability is shown and is **not** editable here. ZyCart holds one
 * sellable quantity per product; a size carries availability, not a count. The
 * panel says so rather than offering a field that would imply otherwise.
 */
export default async function AdminInventoryDetailPage({
  params,
}: PageProps<'/admin/inventory/[id]'>) {
  const { id } = await params;
  const cookie = await getSessionCookie();

  let item;
  try {
    item = await getInventoryItem(id, { cookie });
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) notFound();

    return (
      <>
        <AdminPageHeader title="Stock" back={{ href: '/admin/inventory', label: 'Inventory' }} />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  // Only for the store default, which the threshold control quotes. A failure
  // is not worth failing the page over.
  const summary = await getInventorySummary({ cookie }).catch(() => null);

  return (
    <>
      <AdminPageHeader
        title={item.name}
        description={`SKU ${item.sku}${item.brand ? ` · ${item.brand}` : ''}${
          item.category ? ` · ${item.category}` : ''
        }`}
        back={{ href: '/admin/inventory', label: 'Inventory' }}
        action={
          <>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/admin/products/${item.id}`} />}
            >
              <Pencil className="size-3.5" data-icon="inline-start" aria-hidden />
              Edit product
            </Button>
            <AdjustStockButton
              product={item}
              largeAdjustmentThreshold={item.largeAdjustmentThreshold}
              variant="brand"
              label="Adjust stock"
            />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Panel
            title="Stock history"
            icon={History}
            description="Every sale, cancellation and correction, newest first."
          >
            <InventoryMovementTimeline
              productId={item.id}
              movements={item.movements}
              totalCount={item.movementCount}
            />
          </Panel>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-border bg-surface/40 p-5">
            <div className="flex items-start gap-3">
              <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-background">
                {item.image && (
                  <Image src={item.image} alt="" fill sizes="56px" className="object-cover" />
                )}
              </span>

              <div className="min-w-0">
                <p className="text-h2 tabular-nums">{item.stock}</p>
                <p className="text-caption text-muted-foreground">
                  {item.stock === 1 ? 'unit in stock' : 'units in stock'}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <StatusBadge tone={stockTone(item.stockState)}>
                {STOCK_LABEL[item.stockState]}
              </StatusBadge>
              <StatusBadge tone={item.isActive ? 'neutral' : 'warning'}>
                {item.isActive ? 'Live in the shop' : 'Hidden from the shop'}
              </StatusBadge>
            </div>

            <dl className="mt-4 space-y-2 border-t border-border pt-4">
              <Row label="Price">{formatPrice(item.price)}</Row>
              <Row label="Units sold">
                <span className="tabular-nums">{item.totals.soldUnits}</span>
              </Row>
              <Row label="Manual adjustments">
                <span className="tabular-nums">{item.totals.adjustments}</span>
              </Row>
              <Row label="Product updated">{formatDateTime(item.updatedAt)}</Row>
            </dl>

            {/* Stated plainly, because "why can I not edit stock here?" is the
                question this page has to answer before an operator goes looking
                for the field on the product form. */}
            <p className="text-caption mt-4 text-pretty text-muted-foreground">
              Stock only changes through an adjustment, so every change carries a reason and shows
              up in the history above.
            </p>

            <Link
              href={`/products/${item.slug}`}
              target="_blank"
              rel="noreferrer"
              className="focus-ring text-caption mt-3 inline-flex items-center gap-1 rounded-md font-medium text-brand hover:underline"
            >
              View in the shop
              <ExternalLink className="size-3" aria-hidden />
            </Link>
          </section>

          <Panel title="Low-stock threshold">
            <ThresholdControl
              productId={item.id}
              threshold={item.lowStockThreshold}
              usesDefault={item.usesDefaultThreshold}
              storeDefault={summary?.defaultThreshold ?? item.lowStockThreshold}
            />
          </Panel>

          <Panel title="Variants" icon={Layers}>
            {item.variants.length === 0 && item.colors.length === 0 ? (
              <p className="text-caption text-pretty text-muted-foreground">
                This product has no colour or size options.
              </p>
            ) : (
              <>
                {item.variants.length > 0 && (
                  <>
                    <p className="text-caption font-medium text-muted-foreground">Sizes</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.variants.map((variant) => (
                        <li key={variant.label}>
                          <StatusBadge tone={variant.inStock ? 'success' : 'neutral'}>
                            {variant.label}
                            <span className="sr-only">
                              {variant.inStock ? ' available' : ' unavailable'}
                            </span>
                            {!variant.inStock && <span aria-hidden> · off</span>}
                          </StatusBadge>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {item.colors.length > 0 && (
                  <>
                    <p className="text-caption mt-3 font-medium text-muted-foreground">Colours</p>
                    <p className="text-small mt-1">{item.colors.join(', ')}</p>
                  </>
                )}

                <p className="text-caption mt-3 text-pretty text-muted-foreground">
                  Sizes carry availability, not their own count — the {item.stock} units above are
                  the product&rsquo;s whole sellable stock. Turn a size on or off from the product
                  editor.
                </p>
              </>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function Panel({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface/40 p-5">
      <div className="mb-4">
        <h2 className="text-small flex items-center gap-2 font-semibold">
          {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
          {title}
        </h2>
        {description && <p className="text-caption mt-0.5 text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-caption shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-small min-w-0 text-right">{children}</dd>
    </div>
  );
}
