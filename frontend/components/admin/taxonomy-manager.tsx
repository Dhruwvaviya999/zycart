'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AuthError } from '@/components/auth/auth-error';
import { SelectField } from '@/components/common/select-field';
import { AdminEmpty, AdminTable, StatusBadge, Td, Th, Tr } from '@/components/admin/admin-ui';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { fieldErrors, toErrorMessage } from '@/services/api';
import {
  createBrand,
  createCategory,
  deleteBrand,
  deleteCategory,
  updateBrand,
  updateCategory,
} from '@/services/admin.service';
import { formatRate } from '@/lib/format';
import {
  DEFAULT_GST_RATE,
  GST_RATES,
  type AdminTaxonomyRow,
  type TaxonomyInput,
} from '@/types/admin';

export type TaxonomyKind = 'category' | 'brand';

const API = {
  category: { create: createCategory, update: updateCategory, remove: deleteCategory },
  brand: { create: createBrand, update: updateBrand, remove: deleteBrand },
} as const;

/**
 * Categories and brands, managed with one component.
 *
 * They differ in a few details — a category has a description, an `image` and
 * (from Phase 18) the GST rate and HSN code its products are sold under; a
 * brand has a `logo` — and are otherwise the same screen: a short list, an
 * inline editor, and a delete that the server refuses while products still
 * point at it. Two near-identical screens would have drifted apart.
 *
 * The list is short by nature, so it is rendered whole rather than paged, and
 * editing happens in a dialog rather than on its own route: an operator
 * renaming a category should not lose their place.
 */
export function TaxonomyManager({ kind, rows }: { kind: TaxonomyKind; rows: AdminTaxonomyRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminTaxonomyRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<AdminTaxonomyRow | null>(null);

  const noun = kind === 'category' ? 'category' : 'brand';
  const plural = kind === 'category' ? 'categories' : 'brands';

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" variant="brand" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" data-icon="inline-start" aria-hidden />
          New {noun}
        </Button>
      </div>

      {rows.length === 0 ? (
        <AdminEmpty
          title={`No ${plural} yet`}
          body={`Create a ${noun} before adding products to it.`}
          action={
            <Button size="sm" variant="brand" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" data-icon="inline-start" aria-hidden />
              New {noun}
            </Button>
          }
        />
      ) : (
        <>
          <AdminTable
            className="hidden sm:block"
            head={
              <>
                <Th>{kind === 'category' ? 'Category' : 'Brand'}</Th>
                <Th className="hidden md:table-cell">Slug</Th>
                {kind === 'category' && <Th>GST</Th>}
                <Th align="right">Products</Th>
                <Th>Status</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </>
            }
          >
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <div className="flex min-w-0 items-center gap-3">
                    <Thumb row={row} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.name}</span>
                      {row.description && (
                        <span className="text-caption block truncate text-muted-foreground">
                          {row.description}
                        </span>
                      )}
                    </span>
                  </div>
                </Td>
                <Td className="hidden text-muted-foreground md:table-cell">
                  <code className="text-caption">{row.slug}</code>
                </Td>
                {kind === 'category' && (
                  <Td>
                    <GstCell row={row} />
                  </Td>
                )}
                <Td align="right">
                  {row.productCount > 0 ? (
                    <Link
                      href={`/admin/products?${kind}=${row.id}`}
                      className="focus-ring rounded-sm font-medium tabular-nums hover:underline"
                    >
                      {row.productCount}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </Td>
                <Td>
                  <StatusBadge tone={row.isActive ? 'success' : 'neutral'}>
                    {row.isActive ? 'Active' : 'Inactive'}
                  </StatusBadge>
                </Td>
                <Td align="right">
                  <RowActions
                    row={row}
                    onEdit={() => setEditing(row)}
                    onDelete={() => setRemoving(row)}
                  />
                </Td>
              </Tr>
            ))}
          </AdminTable>

          <ul className="space-y-2 sm:hidden">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-xl border border-border p-3"
              >
                <Thumb row={row} />
                <div className="min-w-0 flex-1">
                  <p className="text-small truncate font-medium">{row.name}</p>
                  <p className="text-caption text-muted-foreground">
                    {row.productCount} {row.productCount === 1 ? 'product' : 'products'}
                    {!row.isActive && ' · Inactive'}
                  </p>
                </div>
                <RowActions
                  row={row}
                  onEdit={() => setEditing(row)}
                  onDelete={() => setRemoving(row)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <TaxonomyDialog
        kind={kind}
        open={creating || editing !== null}
        row={editing}
        onOpenChange={(open) => {
          if (open) return;
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => router.refresh()}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Delete this ${noun}?`}
        destructive
        description={
          removing && removing.productCount > 0 ? (
            <>
              <strong>{removing.name}</strong> still has {removing.productCount}{' '}
              {removing.productCount === 1 ? 'product' : 'products'} in it. Deleting it will be
              refused — move or delete those products first, or deactivate this {noun} instead to
              hide it from the shop.
            </>
          ) : (
            <>
              <strong>{removing?.name}</strong> will be removed permanently. Past orders keep their
              own copy of what was bought, so order history is unaffected.
            </>
          )
        }
        confirmLabel="Delete"
        busyLabel="Deleting…"
        onConfirm={async () => {
          if (!removing) return;
          await API[kind].remove(removing.id);
          router.refresh();
        }}
      />
    </>
  );
}

/**
 * The rate a category's products are sold at, and whether anybody chose it.
 *
 * A category nobody has configured follows the store default; saying
 * "default" beside the number keeps that visible, so an operator can tell a
 * deliberate 18% from an inherited one.
 */
function GstCell({ row }: { row: AdminTaxonomyRow }) {
  const rate = row.gstRate ?? null;

  return (
    <span className="tabular-nums">
      {formatRate(rate ?? DEFAULT_GST_RATE)}
      {rate === null && <span className="text-caption ml-1 text-muted-foreground">default</span>}
      {row.hsnCode && (
        <span className="text-caption block text-muted-foreground">HSN {row.hsnCode}</span>
      )}
      {row.tryOnEnabled && (
        <span className="text-caption block text-muted-foreground">Try-on on</span>
      )}
    </span>
  );
}

function Thumb({ row }: { row: AdminTaxonomyRow }) {
  return (
    <span className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-surface">
      {row.image && <Image src={row.image} alt="" fill sizes="36px" className="object-cover" />}
    </span>
  );
}

function RowActions({
  row,
  onEdit,
  onDelete,
}: {
  row: AdminTaxonomyRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${row.name}`}
        className="focus-ring grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${row.name}`}
        className="focus-ring grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function TaxonomyDialog({
  kind,
  open,
  row,
  onOpenChange,
  onSaved,
}: {
  kind: TaxonomyKind;
  open: boolean;
  row: AdminTaxonomyRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const noun = kind === 'category' ? 'category' : 'brand';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogTitle className="text-h4">{row ? `Edit ${noun}` : `New ${noun}`}</DialogTitle>
        <DialogDescription className="text-caption text-muted-foreground">
          {kind === 'category'
            ? 'Categories group products in the shop and in filters.'
            : 'Brands label products and drive the brand filter.'}
        </DialogDescription>

        {/* Keyed and mounted only while open, so the fields come from props at
            mount and reset on close without an effect syncing them. */}
        {open && (
          <TaxonomyFields
            key={row?.id ?? 'new'}
            kind={kind}
            row={row}
            onDone={() => {
              onSaved();
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TaxonomyFields({
  kind,
  row,
  onDone,
  onCancel,
}: {
  kind: TaxonomyKind;
  row: AdminTaxonomyRow | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(row?.name ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [image, setImage] = useState(row?.image ?? '');
  const [isActive, setIsActive] = useState(row?.isActive ?? true);
  // `''` is "follow the store default", which the server stores as null.
  const [gstRate, setGstRate] = useState(
    row?.gstRate === null || row?.gstRate === undefined ? '' : String(row.gstRate),
  );
  const [hsnCode, setHsnCode] = useState(row?.hsnCode ?? '');
  const [tryOnEnabled, setTryOnEnabled] = useState(row?.tryOnEnabled ?? false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    if (name.trim().length < 2) {
      setFields({ name: 'Give it a name of at least 2 characters.' });
      return;
    }

    if (kind === 'category' && hsnCode.trim() && !/^(\d{4}|\d{6}|\d{8})$/.test(hsnCode.trim())) {
      setFields({ hsnCode: 'An HSN code is 4, 6 or 8 digits.' });
      return;
    }

    setSaving(true);
    setError(undefined);
    setFields({});

    // A category stores `image`, a brand stores `logo`; the only shape
    // difference between them.
    const input: TaxonomyInput = {
      name: name.trim(),
      isActive,
      ...(kind === 'category'
        ? {
            description: description.trim() || undefined,
            image: image.trim() || undefined,
            gstRate: gstRate === '' ? null : Number(gstRate),
            hsnCode: hsnCode.trim(),
            tryOnEnabled,
          }
        : { logo: image.trim() || undefined }),
    };

    try {
      if (row) await API[kind].update(row.id, input);
      else await API[kind].create(input);

      onDone();
    } catch (cause) {
      setError(toErrorMessage(cause));
      setFields(fieldErrors(cause));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <AuthError message={error} />

      <div>
        <label htmlFor="taxonomy-name" className="text-caption font-medium">
          Name
        </label>
        <Input
          id="taxonomy-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          disabled={saving}
          aria-invalid={Boolean(fields.name) || undefined}
          className="mt-1.5"
        />
        <p
          role={fields.name ? 'alert' : undefined}
          className="text-caption min-h-4 pt-1 text-destructive"
        >
          {fields.name ?? ''}
        </p>
      </div>

      {kind === 'category' && (
        <div>
          <label htmlFor="taxonomy-description" className="text-caption font-medium">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="taxonomy-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            disabled={saving}
            className="mt-1.5"
          />
        </div>
      )}

      <div>
        <label htmlFor="taxonomy-image" className="text-caption font-medium">
          {kind === 'category' ? 'Image URL' : 'Logo URL'}{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="taxonomy-image"
          type="url"
          value={image}
          onChange={(event) => setImage(event.target.value)}
          placeholder="https://…"
          disabled={saving}
          className="mt-1.5"
        />
      </div>

      {kind === 'category' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="taxonomy-gst" className="text-caption font-medium">
              GST rate
            </label>
            <SelectField
              id="taxonomy-gst"
              value={gstRate}
              onValueChange={setGstRate}
              clearLabel={`Store default (${formatRate(DEFAULT_GST_RATE)})`}
              placeholder={`Store default (${formatRate(DEFAULT_GST_RATE)})`}
              options={GST_RATES.map((rate) => ({ value: String(rate), label: formatRate(rate) }))}
              disabled={saving}
              fullWidth
              className="mt-1.5"
            />
            <p className="text-caption min-h-4 pt-1 text-muted-foreground">
              Applies to orders placed from now on.
            </p>
          </div>

          <div>
            <label htmlFor="taxonomy-hsn" className="text-caption font-medium">
              HSN code <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="taxonomy-hsn"
              inputMode="numeric"
              value={hsnCode}
              onChange={(event) => setHsnCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="e.g. 6404"
              disabled={saving}
              aria-invalid={Boolean(fields.hsnCode) || undefined}
              className="mt-1.5"
            />
            <p
              role={fields.hsnCode ? 'alert' : undefined}
              className="text-caption min-h-4 pt-1 text-destructive"
            >
              {fields.hsnCode ?? ''}
            </p>
          </div>
        </div>
      )}

      {/* Phase 19. Each try is a paid image generation, so only goods that
          can actually be worn should offer it. */}
      {kind === 'category' && (
        <label className="focus-within:ring-ring/45 flex cursor-pointer items-start gap-2.5 rounded-lg py-1 focus-within:ring-[3px]">
          <input
            type="checkbox"
            checked={tryOnEnabled}
            onChange={(event) => setTryOnEnabled(event.target.checked)}
            disabled={saving}
            className="mt-0.5 size-4 accent-brand"
          />
          <span>
            <span className="text-small block font-medium">Virtual try-on</span>
            <span className="text-caption block text-muted-foreground">
              Customers can see products in this category on a photo of themselves. For clothing,
              footwear and accessories.
            </span>
          </span>
        </label>
      )}

      <label className="focus-within:ring-ring/45 flex cursor-pointer items-center gap-2.5 rounded-lg py-1 focus-within:ring-[3px]">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          disabled={saving}
          className="size-4 accent-brand"
        />
        <span className="text-small font-medium">Active</span>
      </label>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" size="cta" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="cta" variant="brand" disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
              Saving…
            </>
          ) : row ? (
            'Save changes'
          ) : (
            'Create'
          )}
        </Button>
      </div>
    </form>
  );
}
