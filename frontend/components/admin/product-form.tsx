'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Boxes, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthError } from '@/components/auth/auth-error';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { fieldErrors, toErrorMessage } from '@/services/api';
import { createProduct, deleteProduct, updateProduct } from '@/services/admin.service';
import type { AdminProduct, AdminTaxonomyRow, ProductInput } from '@/types/admin';
import { cn } from '@/lib/utils';

/**
 * Creating and editing a product.
 *
 * One form for both, because they are the same task from a different starting
 * point. What differs is the heading, the submit label and whether the
 * destructive zone appears at all.
 *
 * Validation is the server's. This form checks only what it needs to give
 * immediate feedback — a missing name, a price that is not a number — and then
 * renders whatever the API says, field by field, through `fieldErrors`. That
 * keeps one set of rules rather than two that drift.
 */
export function ProductForm({
  product,
  categories,
  brands,
}: {
  /** Absent when creating. */
  product?: AdminProduct;
  categories: AdminTaxonomyRow[];
  brands: AdminTaxonomyRow[];
}) {
  const router = useRouter();
  const editing = Boolean(product);

  const [form, setForm] = useState<ProductInput>(() => initial(product, categories, brands));
  const [baseline] = useState(() => JSON.stringify(initial(product, categories, brands)));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);

  const dirty = JSON.stringify(form) !== baseline;

  /**
   * Warns before losing edits to a closed tab or a typed URL.
   *
   * It cannot cover an in-app navigation — Next's router gives no cancellable
   * hook — so the cancel button asks separately rather than pretending this
   * covers everything.
   */
  useEffect(() => {
    if (!dirty || saving) return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);

  const update = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFields((current) => ({ ...current, [String(key)]: '' }));
  };

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (form.name.trim().length < 2) next.name = 'Give the product a name.';
    if (form.description.trim().length < 10) {
      next.description = 'The description should be at least 10 characters.';
    }
    if (form.images.length === 0) next.images = 'Add at least one image URL.';
    if (!form.category) next.category = 'Choose a category.';
    if (!form.brand) next.brand = 'Choose a brand.';
    if (!editing && !/^[A-Za-z0-9-]{2,40}$/.test(form.sku.trim())) {
      next.sku = 'Letters, digits and hyphens only.';
    }
    if (!Number.isInteger(form.price) || form.price < 0) {
      next.price = 'Price must be a whole number of rupees.';
    }
    if (form.compareAtPrice !== null && form.compareAtPrice <= form.price) {
      next.compareAtPrice = 'A compare-at price should be higher than the price.';
    }
    // Only on creation: an existing product's stock is not editable here.
    if (!editing && (!Number.isInteger(form.stock) || form.stock < 0)) {
      next.stock = 'Stock must be a whole number.';
    }

    setFields(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    // The guard that makes a double-click harmless.
    if (saving) return;
    if (!validate()) return;

    setSaving(true);
    setError(undefined);

    try {
      if (product) {
        /**
         * The SKU is immutable server-side and stock is no longer settable
         * there, so neither is sent on an edit.
         *
         * Stock in particular: sending a total would discard anything that
         * happened between this form loading and saving — a sale, another
         * operator's correction — and would carry no reason for the change.
         * It moves through the inventory adjustment instead, which takes a
         * signed amount and records why.
         */
        const { sku, stock, ...rest } = form;
        void sku;
        void stock;
        await updateProduct(product.id, rest);
        router.refresh();
      } else {
        const created = await createProduct(form);
        router.replace(`/admin/products/${created.id}`);
        return;
      }

      router.push('/admin/products');
    } catch (cause) {
      setError(toErrorMessage(cause));
      setFields(fieldErrors(cause));
      setSaving(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card title="Details">
            <Field label="Name" error={fields.name} htmlFor="name">
              <Input
                id="name"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                maxLength={160}
                aria-invalid={Boolean(fields.name) || undefined}
              />
            </Field>

            <Field
              label="Short description"
              hint="One line, shown on cards"
              error={fields.shortDescription}
              htmlFor="shortDescription"
            >
              <Input
                id="shortDescription"
                value={form.shortDescription}
                onChange={(event) => update('shortDescription', event.target.value)}
                maxLength={300}
              />
            </Field>

            <Field label="Description" error={fields.description} htmlFor="description">
              <textarea
                id="description"
                value={form.description}
                onChange={(event) => update('description', event.target.value)}
                rows={6}
                maxLength={4000}
                aria-invalid={Boolean(fields.description) || undefined}
                className={cn(
                  'text-small focus-visible:ring-ring/50 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px]',
                  fields.description && 'border-destructive',
                )}
              />
            </Field>
          </Card>

          <Card
            title="Images"
            description="Paste image URLs, as the catalogue already stores them."
          >
            <ListEditor
              values={form.images}
              onChange={(images) => update('images', images)}
              placeholder="https://…"
              addLabel="Add image"
              error={fields.images}
              type="url"
            />

            {form.images.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {form.images.map((src) => (
                  <li key={src} className="relative">
                    <span className="relative block size-16 overflow-hidden rounded-lg border border-border bg-surface">
                      <Image
                        src={src}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                        unoptimized
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Variants" description="Optional. Colours and sizes a customer can choose.">
            <PairEditor
              label="Colours"
              values={form.colors.map((color) => [color.name, color.hex] as [string, string])}
              onChange={(pairs) =>
                update(
                  'colors',
                  pairs.map(([name, hex]) => ({ name, hex })),
                )
              }
              firstPlaceholder="Midnight"
              secondPlaceholder="#101820"
              addLabel="Add colour"
            />

            <div className="mt-4">
              <ListEditor
                label="Sizes"
                values={form.sizes.map((size) => size.label)}
                onChange={(labels) =>
                  update(
                    'sizes',
                    labels.map((size) => ({ label: size, inStock: true })),
                  )
                }
                placeholder="UK 9"
                addLabel="Add size"
              />
            </div>
          </Card>

          <Card title="Storefront copy" description="Optional. Shown on the product page.">
            <ListEditor
              label="Highlights"
              values={form.highlights}
              onChange={(highlights) => update('highlights', highlights)}
              placeholder="Machine washable"
              addLabel="Add highlight"
            />

            <div className="mt-4">
              <PairEditor
                label="Specifications"
                values={form.specifications.map(
                  (spec) => [spec.label, spec.value] as [string, string],
                )}
                onChange={(pairs) =>
                  update(
                    'specifications',
                    pairs.map(([label, value]) => ({ label, value })),
                  )
                }
                firstPlaceholder="Material"
                secondPlaceholder="Full-grain leather"
                addLabel="Add specification"
              />
            </div>

            <div className="mt-4">
              <ListEditor
                label="Tags"
                values={form.tags}
                onChange={(tags) => update('tags', tags)}
                placeholder="running"
                addLabel="Add tag"
              />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Status">
            <Toggle
              label="Active"
              hint="Visible in the shop"
              checked={form.isActive}
              onChange={(value) => update('isActive', value)}
            />
            <Toggle
              label="Featured"
              checked={form.isFeatured}
              onChange={(value) => update('isFeatured', value)}
            />
            <Toggle
              label="Best seller"
              checked={form.isBestSeller}
              onChange={(value) => update('isBestSeller', value)}
            />
            <Toggle
              label="New arrival"
              checked={form.isNewArrival}
              onChange={(value) => update('isNewArrival', value)}
            />
          </Card>

          <Card title="Pricing and stock">
            <Field label="Price (₹)" error={fields.price} htmlFor="price">
              <Input
                id="price"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={String(form.price)}
                onChange={(event) => update('price', Math.trunc(Number(event.target.value) || 0))}
                aria-invalid={Boolean(fields.price) || undefined}
              />
            </Field>

            <Field
              label="Compare-at price (₹)"
              hint="Optional. Shows as a strikethrough."
              error={fields.compareAtPrice}
              htmlFor="compareAtPrice"
            >
              <Input
                id="compareAtPrice"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={form.compareAtPrice === null ? '' : String(form.compareAtPrice)}
                onChange={(event) =>
                  update(
                    'compareAtPrice',
                    event.target.value === '' ? null : Math.trunc(Number(event.target.value) || 0),
                  )
                }
              />
            </Field>

            {editing ? (
              /**
               * Stock, deliberately read-only once a product exists.
               *
               * Typing a new total here would silently overwrite whatever had
               * happened since the form loaded, and would leave no record of
               * why the number changed. The adjustment screen takes a signed
               * amount and a reason, and writes both to the product's stock
               * history — so this points there rather than pretending.
               */
              <div>
                <p className="text-caption font-medium">Stock</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-h4 tabular-nums">{form.stock}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    render={<Link href={`/admin/inventory/${product?.id ?? ''}`} />}
                  >
                    <Boxes className="size-3.5" data-icon="inline-start" aria-hidden />
                    Adjust stock
                  </Button>
                </div>
                <p className="text-caption mt-1.5 text-pretty text-muted-foreground">
                  Stock changes through an adjustment, so every change carries a reason and appears
                  in the product&rsquo;s stock history.
                </p>
              </div>
            ) : (
              <Field
                label="Opening stock"
                hint="Recorded as the product's first stock movement."
                error={fields.stock}
                htmlFor="stock"
              >
                <Input
                  id="stock"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={String(form.stock)}
                  onChange={(event) => update('stock', Math.trunc(Number(event.target.value) || 0))}
                  aria-invalid={Boolean(fields.stock) || undefined}
                />
              </Field>
            )}
          </Card>

          <Card title="Catalogue">
            <Field label="Category" error={fields.category} htmlFor="category">
              <Select
                id="category"
                value={form.category}
                onChange={(value) => update('category', value)}
                options={categories.map((row) => ({ value: row.id, label: row.name }))}
              />
            </Field>

            <Field label="Brand" error={fields.brand} htmlFor="brand">
              <Select
                id="brand"
                value={form.brand}
                onChange={(value) => update('brand', value)}
                options={brands.map((row) => ({ value: row.id, label: row.name }))}
              />
            </Field>

            <Field
              label="SKU"
              hint={editing ? 'Fixed once the product exists' : 'Letters, digits and hyphens'}
              error={fields.sku}
              htmlFor="sku"
            >
              <Input
                id="sku"
                value={form.sku}
                onChange={(event) => update('sku', event.target.value.toUpperCase())}
                disabled={editing}
                maxLength={40}
                aria-invalid={Boolean(fields.sku) || undefined}
              />
            </Field>
          </Card>

          <div className="sticky bottom-4 space-y-2 rounded-xl border border-border bg-background/95 p-3 backdrop-blur">
            <AuthError message={error} />

            <Button type="submit" size="cta" variant="brand" disabled={saving} className="w-full">
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
                  Saving…
                </>
              ) : editing ? (
                'Save changes'
              ) : (
                'Create product'
              )}
            </Button>

            <Button
              type="button"
              size="cta"
              variant="ghost"
              render={<Link href="/admin/products" />}
              className="w-full"
            >
              {dirty ? 'Discard and go back' : 'Back to products'}
            </Button>
          </div>

          {/* Destructive actions, visually separated from ordinary editing. */}
          {product && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-small font-semibold text-destructive">Danger zone</p>
              <p className="text-caption mt-1 mb-3 text-pretty text-muted-foreground">
                Deactivating hides this product and keeps everything. Deleting removes it from the
                catalogue for good.
              </p>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setDeleting(true)}
              >
                Delete product
              </Button>
            </div>
          )}
        </div>
      </form>

      {product && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title="Delete this product?"
          destructive
          description={
            <>
              <strong>{product.name}</strong> will be removed permanently. Past orders keep their
              own copy, so order history stays intact — but the product page and its reviews will be
              gone.
            </>
          }
          confirmLabel="Delete permanently"
          busyLabel="Deleting…"
          onConfirm={async () => {
            await deleteProduct(product.id);
            router.replace('/admin/products');
          }}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */

function initial(
  product: AdminProduct | undefined,
  categories: AdminTaxonomyRow[],
  brands: AdminTaxonomyRow[],
): ProductInput {
  return {
    name: product?.name ?? '',
    description: product?.description ?? '',
    shortDescription: product?.shortDescription ?? '',
    images: product?.images ?? [],
    price: product?.price ?? 0,
    compareAtPrice: product?.compareAtPrice ?? null,
    category: product?.category.id ?? categories[0]?.id ?? '',
    brand: product?.brand.id ?? brands[0]?.id ?? '',
    sku: product?.sku ?? '',
    stock: product?.stock ?? 0,
    colors: product?.colors ?? [],
    sizes: product?.sizes ?? [],
    tags: product?.tags ?? [],
    highlights: product?.highlights ?? [],
    specifications: product?.specifications ?? [],
    isFeatured: product?.isFeatured ?? false,
    isBestSeller: product?.isBestSeller ?? false,
    isNewArrival: product?.isNewArrival ?? false,
    isActive: product?.isActive ?? true,
  };
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface/40 p-5">
      <h2 className="text-small font-semibold">{title}</h2>
      {description && <p className="text-caption mt-0.5 text-muted-foreground">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-caption font-medium">
        {label}
      </label>
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
      <div className="mt-1.5">{children}</div>
      {/* Reserved height, so an error appearing does not shift the form. */}
      <p role={error ? 'alert' : undefined} className="text-caption min-h-4 pt-1 text-destructive">
        {error ?? ''}
      </p>
    </div>
  );
}

function Select({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="text-small focus-visible:ring-ring/50 h-9 w-full rounded-lg border border-border bg-background px-2.5 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px]"
    >
      <option value="">Choose…</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="focus-within:ring-ring/45 flex cursor-pointer items-start gap-2.5 rounded-lg py-1 focus-within:ring-[3px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-brand"
      />
      <span className="min-w-0">
        <span className="text-small block font-medium">{label}</span>
        {hint && <span className="text-caption block text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

/** A list of strings that grows one entry at a time. */
function ListEditor({
  label,
  values,
  onChange,
  placeholder,
  addLabel,
  error,
  type = 'text',
}: {
  label?: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  addLabel: string;
  error?: string;
  type?: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value || values.includes(value)) return;
    onChange([...values, value]);
    setDraft('');
  };

  return (
    <div>
      {label && <p className="text-caption mb-1.5 font-medium">{label}</p>}

      <div className="flex gap-2">
        <Input
          type={type}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds the entry rather than submitting the whole product.
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          aria-label={addLabel}
          className="min-w-0 flex-1"
        />
        <Button type="button" size="default" variant="outline" onClick={add}>
          <Plus className="size-3.5" aria-hidden />
          <span className="sr-only">{addLabel}</span>
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-caption pt-1 text-destructive">
          {error}
        </p>
      )}

      {values.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <li
              key={value}
              className="text-caption inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-2.5"
            >
              <span className="truncate">{value}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((entry) => entry !== value))}
                aria-label={`Remove ${value}`}
                className="focus-ring grid size-4 shrink-0 place-items-center rounded-full hover:bg-foreground/10"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Two-field entries: colour name and hex, or a specification label and value. */
function PairEditor({
  label,
  values,
  onChange,
  firstPlaceholder,
  secondPlaceholder,
  addLabel,
}: {
  label: string;
  values: [string, string][];
  onChange: (values: [string, string][]) => void;
  firstPlaceholder: string;
  secondPlaceholder: string;
  addLabel: string;
}) {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');

  const add = () => {
    if (!first.trim() || !second.trim()) return;
    onChange([...values, [first.trim(), second.trim()]]);
    setFirst('');
    setSecond('');
  };

  return (
    <div>
      <p className="text-caption mb-1.5 font-medium">{label}</p>

      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        <Input
          value={first}
          onChange={(event) => setFirst(event.target.value)}
          placeholder={firstPlaceholder}
          aria-label={`${label} name`}
          className="min-w-0 flex-1"
        />
        <Input
          value={second}
          onChange={(event) => setSecond(event.target.value)}
          placeholder={secondPlaceholder}
          aria-label={`${label} value`}
          className="min-w-0 flex-1"
        />
        <Button type="button" size="default" variant="outline" onClick={add}>
          <Plus className="size-3.5" aria-hidden />
          <span className="sr-only">{addLabel}</span>
        </Button>
      </div>

      {values.length > 0 && (
        <ul className="mt-2 space-y-1">
          {values.map(([one, two], index) => (
            <li
              key={`${one}-${index}`}
              className="text-caption flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{one}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{two}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((_, at) => at !== index))}
                aria-label={`Remove ${one}`}
                className="focus-ring grid size-4 shrink-0 place-items-center rounded-full hover:bg-foreground/10"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
