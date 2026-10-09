import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Boxes, ExternalLink, History, Layers, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AdminError,
  AdminPageHeader,
  AdminTable,
  StatusBadge,
  Td,
  Th,
  Tr,
} from '@/components/admin/admin-ui';
import { AdjustStockButton, ThresholdControl } from '@/components/admin/inventory-controls';
import { InventoryMovementTimeline } from '@/components/admin/inventory-movement-timeline';
import { STOCK_LABEL, stockTone } from '@/components/admin/status-tones';
import { ApiError, toErrorMessage } from '@/services/api';
import { getInventoryItem, getInventorySummary } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';
import { formatDateTime, formatPrice } from '@/lib/format';
import type { InventoryDetail } from '@/types/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Stock' };

/**
 * One product's stock, and the story of how it got there.
 *
 * Laid out around the two things an operator comes here to do: see the current
 * position at a glance, and change it deliberately. Everything else — the
 * variants, the totals, the timeline — is context for that second decision.
 *
 * ## Two kinds of product (Phase 20)
 *
 * A product that holds one count is adjusted as a whole, from the header, as it
 * always was. Its sizes carry availability rather than counts, shown and not
 * editable here.
 *
 * A product that tracks stock per variant is adjusted one colour and size at a
 * time, from the table of variants — the header offers no product-level
 * adjustment, because units that belong to no variant are units nobody can
 * buy, and the server refuses them. Its total is the sum of the table, and its
 * size availability follows the counts on its own.
 */
export default async function AdminInventoryDetailPage({
  params,
}: PageProps<'/admin/inventory/[id]'>) {
  const { id } = await params;
  const token = await getSessionToken();

  let item;
  try {
    item = await getInventoryItem(id, { token });
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
  const summary = await getInventorySummary({ token }).catch(() => null);

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
            {/* Only for one count. A product with variants is adjusted per row
                of the table below, and the server would refuse this. */}
            {!item.tracksVariants && (
              <AdjustStockButton
                product={item}
                largeAdjustmentThreshold={item.largeAdjustmentThreshold}
                variant="brand"
                label="Adjust stock"
              />
            )}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {item.tracksVariants && (
            <Panel
              title="Stock per variant"
              icon={Boxes}
              description={`${item.variants.length} ${
                item.variants.length === 1 ? 'combination' : 'combinations'
              } with ${
                item.variants.length === 1 ? 'its' : 'their'
              } own count. Adjust each one on its own row — the total above is their sum.`}
            >
              <VariantStockTable item={item} />
            </Panel>
          )}

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
              {item.tracksVariants
                ? `This product counts stock per colour and size, so it is adjusted one variant at a time and the ${item.stock} above is their sum. Every change carries a reason and shows up in the stock history.`
                : 'Stock only changes through an adjustment, so every change carries a reason and shows up in the stock history.'}
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

          <Panel title="Colours and sizes" icon={Layers}>
            {item.sizeOptions.length === 0 && item.colors.length === 0 ? (
              <p className="text-caption text-pretty text-muted-foreground">
                This product has no colour or size options.
              </p>
            ) : (
              <>
                {item.sizeOptions.length > 0 && (
                  <>
                    <p className="text-caption font-medium text-muted-foreground">Sizes</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.sizeOptions.map((size) => (
                        <li key={size.label}>
                          <StatusBadge tone={size.inStock ? 'success' : 'neutral'}>
                            {size.label}
                            <span className="sr-only">
                              {size.inStock ? ' available' : ' unavailable'}
                            </span>
                            {!size.inStock && <span aria-hidden> · off</span>}
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

                {/* Two different truths, so two different sentences: on one
                    product a size is switched on by hand, on the other it is
                    on exactly when some variant in it has units. */}
                <p className="text-caption mt-3 text-pretty text-muted-foreground">
                  {item.tracksVariants ? (
                    <>
                      Size availability follows the variant counts: a size shows as available while
                      any variant in it has units. Choose which combinations are sold from the
                      product editor.
                    </>
                  ) : (
                    <>
                      Sizes carry availability, not their own count — the {item.stock} units above
                      are the product&rsquo;s whole sellable stock. Turn a size on or off, or start
                      counting stock per colour and size, from the product editor.
                    </>
                  )}
                </p>
              </>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

/**
 * Every variant with its own count, and the one way to change each.
 *
 * Scarcest first, for the reason the inventory list is: the row an operator
 * came to restock is the one about to run out. Ties keep the server's order,
 * which is the order the combinations were listed on the product.
 *
 * The badge is judged against the product's threshold — a variant has none of
 * its own — so a variant can read "Low stock" while the product, holding many
 * more across every colour and size, does not.
 */
function VariantStockTable({ item }: { item: InventoryDetail }) {
  const rows = [...item.variants].sort((a, b) => a.stock - b.stock);

  return (
    <AdminTable
      head={
        <>
          <Th>Variant</Th>
          <Th className="hidden sm:table-cell">SKU</Th>
          <Th align="right">Stock</Th>
          <Th className="hidden sm:table-cell">Status</Th>
          <Th align="right">
            <span className="sr-only">Actions</span>
          </Th>
        </>
      }
    >
      {rows.map((variant) => (
        <Tr key={variant.id}>
          <Td>
            <span className="block font-medium">{variant.label}</span>
            {/* The SKU and the state fold under the label on a phone, where
                five columns would not fit beside the button. */}
            <span className="text-caption block text-muted-foreground sm:hidden">
              {variant.sku} · {STOCK_LABEL[variant.stockState]}
            </span>
          </Td>
          <Td className="text-caption hidden font-mono text-muted-foreground sm:table-cell">
            {variant.sku}
          </Td>
          <Td align="right" className="font-semibold tabular-nums">
            {variant.stock}
          </Td>
          <Td className="hidden sm:table-cell">
            <StatusBadge tone={stockTone(variant.stockState)}>
              {STOCK_LABEL[variant.stockState]}
            </StatusBadge>
          </Td>
          <Td align="right">
            <AdjustStockButton
              product={item}
              target={{
                id: variant.id,
                label: variant.label,
                sku: variant.sku,
                stock: variant.stock,
              }}
              largeAdjustmentThreshold={item.largeAdjustmentThreshold}
            />
          </Td>
        </Tr>
      ))}
    </AdminTable>
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
