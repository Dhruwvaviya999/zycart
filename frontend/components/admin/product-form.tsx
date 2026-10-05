'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertTriangle, Boxes, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SelectField } from '@/components/common/select-field';
import { AuthError } from '@/components/auth/auth-error';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { ImageUploadButton } from '@/components/admin/image-upload-button';
import {
  MAX_VARIANTS,
  MAX_VARIANT_SKU_LENGTH,
  defaultVariantSku,
  pairKey,
  variantLabel,
} from '@/components/admin/variant-format';
import { fieldErrors, toErrorMessage } from '@/services/api';
import { createProduct, deleteProduct, updateProduct } from '@/services/admin.service';
import type {
  AdminProduct,
  AdminProductVariant,
  AdminTaxonomyRow,
  ProductInput,
  ProductVariantInput,
} from '@/types/admin';
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
 *
 * ## Stock per colour and size (Phase 20)
 *
 * A product may count its stock per variant. What the form lets an operator do
 * about that depends on where the product starts, because the server's rule is
 * that editing the form never moves a unit:
 *
 * - **Creating** — each combination gets an opening count, and the product's
 *   stock is their sum.
 * - **Splitting** an existing product that holds one count — its units are
 *   divided among the combinations, and the shares must add up to exactly
 *   what it holds. Nothing is created; one bucket becomes several.
 * - **Editing** a product that already tracks variants — existing counts are
 *   read-only (they move through the inventory page, with a reason), a new
 *   combination starts at zero, and one that still holds units cannot be
 *   dropped.
 * - **Merging** back to one count — the total is kept, after a confirmation.
 *
 * The form checks each of these before submitting so the operator is told in
 * place, but the server checks them all again and its message is shown as is.
 */
/** The most images a product may carry. Matches the server's validator. */
const MAX_IMAGES = 10;

/**
 * The form's own state: everything submitted, with `stock` always a number.
 *
 * `ProductInput.stock` is optional because a product created with variants
 * leaves it out; the field still needs a value to show while it is visible.
 * Variants are held apart, keyed by combination — see `VariantDraft`.
 */
type FormState = Omit<ProductInput, 'stock' | 'variants'> & { stock: number };

/**
 * What the form holds for one colour-and-size combination.
 *
 * Keyed by `pairKey` rather than stored as a list, so a draft survives the
 * grid being redrawn when a colour or size is added — and a combination that
 * disappears and comes back keeps what was typed into it.
 */
interface VariantDraft {
  /** Whether this combination is sold. Unticked, it is left out of the list. */
  offered: boolean;
  /** Blank asks the server to derive one; the placeholder shows which. */
  sku: string;
  /** An opening count or a share of the split. Ignored when editing variants. */
  stock: number;
}

/** A combination nobody has touched: sold, with a derived SKU and no units. */
const UNTOUCHED: VariantDraft = { offered: true, sku: '', stock: 0 };

/** Letters, digits and hyphens — the server's rule for a variant SKU. */
const VARIANT_SKU = new RegExp(`^[A-Za-z0-9-]{2,${MAX_VARIANT_SKU_LENGTH}}$`);

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

  const [form, setForm] = useState<FormState>(() => initial(product, categories, brands));
  const [baseline] = useState(() => JSON.stringify(initial(product, categories, brands)));

  /** The variants the product holds now. Empty when creating, or for one count. */
  const stored = product?.variants ?? [];

  const [tracking, setTracking] = useState(() => stored.length > 0);
  const [drafts, setDrafts] = useState<Record<string, VariantDraft>>(() => initialDrafts(product));
  const [variantBaseline] = useState(() =>
    JSON.stringify({ tracking: stored.length > 0, drafts: initialDrafts(product) }),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);
  const [merging, setMerging] = useState(false);

  const dirty =
    JSON.stringify(form) !== baseline || JSON.stringify({ tracking, drafts }) !== variantBaseline;

  /**
   * Which of the four situations in the header comment this is.
   *
   * `edit` means the product already tracks variants. Turning tracking off
   * there is the merge; leaving it off in `split` is simply a product that
   * keeps one count.
   */
  const mode: VariantMode = !product ? 'create' : stored.length === 0 ? 'split' : 'edit';

  const rows = variantRows(form, drafts, stored);
  const offered = rows.filter((row) => row.draft.offered);
  const hasOptions = rows.length > 0;

  /** Opening counts or shares, summed. Meaningless in `edit`, where counts are read-only. */
  const allocated = offered.reduce((sum, row) => sum + row.draft.stock, 0);

  /**
   * Stored variants whose colour or size is no longer on the product.
   *
   * Saving would drop them. One that holds nothing can go quietly — the
   * server allows it — but one that still holds units cannot, so it is shown
   * before the operator submits rather than as a 409 afterwards.
   */
  const orphans = stored.filter((variant) => !rows.some((row) => row.key === pairKey(variant)));

  const mergePending = mode === 'edit' && !tracking;

  /** The first server message about the variant list, wherever zod put it. */
  const variantFieldError =
    fields.variants ||
    Object.entries(fields).find(([key, value]) => key.startsWith('variants.') && value)?.[1];

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

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFields((current) => ({ ...current, [String(key)]: '' }));
  };

  /** Changes one combination's draft, starting from whatever it held — or nothing. */
  const updateDraft = (key: string, patch: Partial<VariantDraft>) => {
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? UNTOUCHED), ...patch } }));
    setFields((current) => ({ ...current, variants: '' }));
  };

  /**
   * Adds an uploaded image to the list.
   *
   * A functional update rather than `update('images', …)`: several uploads
   * finish one after another inside a single handler, and each must append to
   * the list as the previous one left it, not to the list as it was when the
   * handler began.
   */
  const addImage = (url: string) => {
    setForm((current) =>
      current.images.includes(url)
        ? current
        : { ...current, images: [...current.images, url].slice(0, MAX_IMAGES) },
    );
    setFields((current) => ({ ...current, images: '' }));
  };

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (form.name.trim().length < 2) next.name = 'Give the product a name.';
    if (form.description.trim().length < 10) {
      next.description = 'The description should be at least 10 characters.';
    }
    if (form.images.length === 0) next.images = 'Upload or add at least one image.';
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
    // Only on creation, and only for one count: an existing product's stock is
    // not editable here, and a product created with variants takes their sum.
    if (!editing && !tracking && (!Number.isInteger(form.stock) || form.stock < 0)) {
      next.stock = 'Stock must be a whole number.';
    }

    if (tracking) {
      const problem = variantProblem();
      if (problem) next.variants = problem;
    }

    setFields(next);
    return Object.keys(next).length === 0;
  }

  /**
   * What is wrong with the variant grid, in the operator's terms, or null.
   *
   * The same rules `planVariantEdit` and `assertVariantShape` enforce, checked
   * here so the answer arrives beside the grid instead of after a round trip.
   * In the order an operator would fix them: there must be something to
   * count, then the SKUs must be usable, then the numbers must add up.
   */
  function variantProblem(): string | null {
    if (!hasOptions) {
      return 'Add a colour or a size above, or turn off stock per variant.';
    }
    if (offered.length === 0) {
      return 'Choose at least one combination to sell, or turn off stock per variant.';
    }
    if (offered.length > MAX_VARIANTS) {
      return `A product can have at most ${MAX_VARIANTS} variants. Untick the combinations that are not sold.`;
    }

    const badSku = offered.find(
      (row) => row.draft.sku.trim() && !VARIANT_SKU.test(row.draft.sku.trim()),
    );
    if (badSku) {
      return `${badSku.label}: a SKU needs 2–${MAX_VARIANT_SKU_LENGTH} letters, digits or hyphens. Leave it blank to use the suggested one.`;
    }

    const seen = new Set<string>();
    for (const row of offered) {
      const sku = effectiveSku(row);
      if (seen.has(sku)) return `${sku} is used by two combinations. Give one of them its own SKU.`;
      seen.add(sku);
    }

    if (mode !== 'edit') {
      if (offered.some((row) => !Number.isInteger(row.draft.stock) || row.draft.stock < 0)) {
        return 'Each count must be a whole number of units.';
      }
    }

    if (mode === 'split' && allocated !== form.stock) {
      return `The shares add up to ${allocated}, but the product holds ${form.stock}. Divide exactly ${form.stock} — units are moved between variants here, never created or removed.`;
    }

    if (mode === 'edit') {
      const holding = orphans.find((variant) => variant.stock > 0);
      if (holding) {
        return `${variantLabel(holding)} still holds ${holding.stock}, but its colour or size is no longer on the product. Adjust it to zero on the inventory page first, or put the option back.`;
      }
    }

    return null;
  }

  /**
   * The `variants` to send, or undefined to leave the list as it is.
   *
   * - Creating or splitting: the ticked combinations with their counts, when
   *   tracking is on; nothing otherwise, so the product keeps one count.
   * - Editing a product with variants: `[]` to merge; the ticked combinations
   *   without counts when anything about them changed; otherwise nothing, so
   *   an edit to the name does not resend a list nobody touched.
   *
   * A blank SKU is left out rather than sent empty: the server reads absence
   * as "derive one", or "keep the current one" for a combination it has.
   */
  function variantPayload(): ProductVariantInput[] | undefined {
    const describe = (row: VariantRow, withStock: boolean): ProductVariantInput => {
      const sku = row.draft.sku.trim().toUpperCase();
      return {
        color: row.color,
        size: row.size,
        ...(sku ? { sku } : {}),
        ...(withStock ? { stock: row.draft.stock } : {}),
      };
    };

    if (mode !== 'edit') {
      return tracking ? offered.map((row) => describe(row, true)) : undefined;
    }

    if (!tracking) return [];

    const before = stored.map((variant) => `${pairKey(variant)}|${variant.sku}`).sort();
    const after = offered.map((row) => `${row.key}|${effectiveSku(row)}`).sort();

    return before.join('\n') === after.join('\n')
      ? undefined
      : offered.map((row) => describe(row, false));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    // The guard that makes a double-click harmless.
    if (saving) return;
    if (!validate()) return;

    // Merging changes what the shop can tell apart, so it asks first. The
    // dialog then runs the same save.
    if (mergePending) {
      setMerging(true);
      return;
    }

    void save();
  }

  /**
   * Sends the form. Never throws: a failure is shown on the form, field by
   * field where the server said which, so the merge confirmation can simply
   * close and leave the explanation where the operator will look for it.
   */
  async function save() {
    if (saving) return;

    setSaving(true);
    setError(undefined);

    const variants = variantPayload();

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
        await updateProduct(product.id, { ...rest, ...(variants ? { variants } : {}) });
        router.refresh();
      } else {
        // With variants the total is theirs; sending it as well would only be
        // a second number for the server to check against the first.
        const { stock, ...rest } = form;
        const created = await createProduct(variants ? { ...rest, variants } : { ...rest, stock });
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

  /** The SKU a row will have once saved: typed, kept, or derived. */
  function effectiveSku(row: VariantRow): string {
    return row.draft.sku.trim().toUpperCase() || row.stored?.sku || row.suggestedSku;
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
              <Textarea
                id="description"
                value={form.description}
                onChange={(event) => update('description', event.target.value)}
                rows={6}
                maxLength={4000}
                aria-invalid={Boolean(fields.description) || undefined}
              />
            </Field>
          </Card>

          <Card
            title="Images"
            description="Upload photos, or paste image URLs. The first image is the one shown on cards."
          >
            <div className="mb-4">
              <ImageUploadButton
                onUploaded={addImage}
                remaining={MAX_IMAGES - form.images.length}
                disabled={saving}
              />
            </div>

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

          <Card
            title="Colours and sizes"
            description="Optional. The options a customer can choose."
          >
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

          <VariantStockCard
            mode={mode}
            productId={product?.id}
            productStock={form.stock}
            tracking={tracking}
            onTrackingChange={(next) => {
              setTracking(next);
              setFields((current) => ({ ...current, variants: '', stock: '' }));
            }}
            hasOptions={hasOptions}
            rows={rows}
            offeredCount={offered.length}
            allocated={allocated}
            orphans={orphans}
            storedCount={stored.length}
            onDraftChange={updateDraft}
            error={variantFieldError}
            disabled={saving}
          />

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
                  {stored.length > 0 && ' This total is the sum of its variants.'}
                </p>
              </div>
            ) : tracking ? (
              /**
               * No field: the opening stock of a product created with variants
               * is the sum of theirs, and a second number here could only
               * disagree with it.
               */
              <div>
                <p className="text-caption font-medium">Opening stock</p>
                <p className="text-h4 mt-1.5 tabular-nums">{allocated}</p>
                <p className="text-caption mt-1.5 text-pretty text-muted-foreground">
                  The sum of the variant counts. Each is recorded as its own first stock movement.
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

      {/* Merging is not a loss of units, but it is a loss of information:
          the per-variant counts are not kept, and splitting again later means
          dividing the total afresh. Worth one question. */}
      {product && mergePending && (
        <ConfirmDialog
          open={merging}
          onOpenChange={setMerging}
          title="Stop counting stock per variant?"
          description={
            <>
              The {stored.length} variants of <strong>{product.name}</strong> merge back into one
              count of <strong className="tabular-nums">{form.stock}</strong> for the whole product.
              Nothing is added or removed, and the stock history keeps every movement — but each
              combination&rsquo;s own count is not kept, so customers can choose any colour and size
              while the product has stock.
            </>
          }
          confirmLabel="Merge and save"
          busyLabel="Saving…"
          onConfirm={save}
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
): FormState {
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

/* ---------------------------------------------------------------- */
/* Stock per colour and size                                         */
/* ---------------------------------------------------------------- */

type VariantMode = 'create' | 'split' | 'edit';

/** One cell of the colour × size grid, with whatever the form and the server know about it. */
interface VariantRow {
  key: string;
  color: string | null;
  size: string | null;
  label: string;
  draft: VariantDraft;
  /** The saved variant for this combination, when there is one. */
  stored: AdminProductVariant | null;
  /** What the server would call it if the SKU were left blank. */
  suggestedSku: string;
}

/**
 * The drafts a form opens with.
 *
 * For a product that tracks variants, every saved one is ticked with its SKU,
 * and every *other* combination of its current options is explicitly unticked
 * — those are combinations the operator chose not to sell, and must not
 * reappear as sold just because the form was opened. A combination that only
 * comes into being later, by adding a colour or a size, has no draft and so
 * starts ticked: a new option is added to be sold.
 */
function initialDrafts(product: AdminProduct | undefined): Record<string, VariantDraft> {
  const stored = product?.variants ?? [];
  if (!product || stored.length === 0) return {};

  const drafts: Record<string, VariantDraft> = {};

  for (const choice of combinations(
    product.colors.map((color) => color.name),
    product.sizes.map((size) => size.label),
  )) {
    drafts[pairKey(choice)] = { offered: false, sku: '', stock: 0 };
  }

  for (const variant of stored) {
    drafts[pairKey(variant)] = { offered: true, sku: variant.sku, stock: variant.stock };
  }

  return drafts;
}

/**
 * Every combination of the given options, in the order they are listed.
 *
 * One axis when the product has only colours or only sizes, with `null` on
 * the other — the shape the server stores. Duplicate or blank names are
 * dropped, since they could only produce two rows for the same thing.
 */
function combinations(
  colorNames: string[],
  sizeLabels: string[],
): { color: string | null; size: string | null }[] {
  const colors = [...new Set(colorNames.map((name) => name.trim()).filter(Boolean))];
  const sizes = [...new Set(sizeLabels.map((label) => label.trim()).filter(Boolean))];

  if (colors.length > 0 && sizes.length > 0) {
    return colors.flatMap((color) => sizes.map((size) => ({ color, size })));
  }

  if (colors.length > 0) return colors.map((color) => ({ color, size: null }));
  return sizes.map((size) => ({ color: null, size }));
}

/** The grid as it stands, from the form's current colours and sizes. */
function variantRows(
  form: FormState,
  drafts: Record<string, VariantDraft>,
  stored: AdminProductVariant[],
): VariantRow[] {
  const byKey = new Map(stored.map((variant) => [pairKey(variant), variant]));

  return combinations(
    form.colors.map((color) => color.name),
    form.sizes.map((size) => size.label),
  ).map((choice) => {
    const key = pairKey(choice);

    return {
      key,
      color: choice.color,
      size: choice.size,
      label: variantLabel(choice),
      draft: drafts[key] ?? UNTOUCHED,
      stored: byKey.get(key) ?? null,
      suggestedSku: defaultVariantSku(form.sku || 'SKU', choice),
    };
  });
}

/**
 * The "Stock per colour and size" section.
 *
 * Presentational: the form owns the drafts and the rules, and this draws them.
 * What each row's stock cell offers depends on the mode, and that is the whole
 * of what makes this section different from one screen to the next.
 */
function VariantStockCard({
  mode,
  productId,
  productStock,
  tracking,
  onTrackingChange,
  hasOptions,
  rows,
  offeredCount,
  allocated,
  orphans,
  storedCount,
  onDraftChange,
  error,
  disabled,
}: {
  mode: VariantMode;
  productId?: string;
  /** What the product holds now — the amount a split must divide. */
  productStock: number;
  tracking: boolean;
  onTrackingChange: (tracking: boolean) => void;
  hasOptions: boolean;
  rows: VariantRow[];
  offeredCount: number;
  allocated: number;
  orphans: AdminProductVariant[];
  storedCount: number;
  onDraftChange: (key: string, patch: Partial<VariantDraft>) => void;
  error?: string;
  disabled: boolean;
}) {
  const inventoryHref = productId ? `/admin/inventory/${productId}` : '';

  /**
   * Tracking can always be turned *off* — that is how a product with variants
   * merges back — but only turned on when there is something to count by.
   */
  const toggleDisabled = disabled || (!tracking && !hasOptions);

  return (
    <Card
      title="Stock per colour and size"
      description="Optional. Count stock for each combination instead of one number for the product."
    >
      <div>
        <Toggle
          label="Track stock per variant"
          hint={
            hasOptions
              ? 'Each colour and size combination gets its own count. The product’s stock is their sum.'
              : 'Add a colour or a size above first. Without either, there is only one thing to count.'
          }
          checked={tracking}
          onChange={onTrackingChange}
          disabled={toggleDisabled}
        />
      </div>

      {mode === 'edit' && !tracking && (
        <Notice tone="warning">
          On save, the {storedCount} variants merge back into one count of{' '}
          <strong className="tabular-nums">{productStock}</strong> for the whole product. Nothing is
          added or removed. You will be asked to confirm.
        </Notice>
      )}

      {tracking && (
        <>
          <p className="text-caption text-pretty text-muted-foreground">
            {mode === 'create' &&
              'Give each combination its opening stock. Untick a combination that is not sold — customers will not be able to choose it.'}
            {mode === 'split' && (
              <>
                This product holds <strong className="tabular-nums">{productStock}</strong> units as
                one count. Divide them among the combinations below: units move between variants
                here, they are never created or removed, so the shares must add up to exactly{' '}
                {productStock}. To change the total itself, adjust stock from the inventory page.
              </>
            )}
            {mode === 'edit' && (
              <>
                Counts change on the{' '}
                <Link
                  href={inventoryHref}
                  className="focus-ring rounded-sm font-medium text-brand hover:underline"
                >
                  inventory page
                </Link>
                , where every change carries a reason. A new combination starts at 0. A combination
                that still holds stock cannot be unticked — adjust it to zero first.
              </>
            )}
          </p>

          {rows.length === 0 ? (
            <Notice tone="warning">
              There are no colours or sizes to count by. Add one above, or turn off stock per
              variant.
            </Notice>
          ) : (
            <div>
              {/* Column headings for the wide layout only; on a phone each row
                  labels itself. */}
              <div
                aria-hidden
                className="text-caption hidden grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,13rem)_6.5rem] gap-x-3 px-2 pb-1.5 font-semibold tracking-wide text-muted-foreground uppercase sm:grid"
              >
                <span />
                <span>Variant</span>
                <span>SKU</span>
                <span className="text-right">Stock</span>
              </div>

              <ul className="divide-y divide-border rounded-lg border border-border">
                {rows.map((row) => (
                  <VariantRowItem
                    key={row.key}
                    row={row}
                    mode={mode}
                    inventoryHref={inventoryHref}
                    onChange={(patch) => onDraftChange(row.key, patch)}
                    disabled={disabled}
                  />
                ))}
              </ul>

              <VariantTotals
                mode={mode}
                offeredCount={offeredCount}
                allocated={allocated}
                productStock={productStock}
              />
            </div>
          )}

          {mode === 'edit' && orphans.length > 0 && (
            <Notice tone={orphans.some((variant) => variant.stock > 0) ? 'danger' : 'warning'}>
              <span className="block font-medium">
                {orphans.length === 1
                  ? 'A saved variant no longer matches the colours and sizes above.'
                  : `${orphans.length} saved variants no longer match the colours and sizes above.`}
              </span>
              <ul className="mt-1 space-y-0.5">
                {orphans.map((variant) => (
                  <li key={variant.id}>
                    {variantLabel(variant)} ·{' '}
                    {variant.stock > 0 ? (
                      <>
                        holds <span className="tabular-nums">{variant.stock}</span>, so it cannot be
                        removed. Adjust it to zero on the{' '}
                        <Link
                          href={inventoryHref}
                          className="focus-ring rounded-sm font-medium underline"
                        >
                          inventory page
                        </Link>{' '}
                        first, or put its colour or size back.
                      </>
                    ) : (
                      'holds nothing, and will be removed on save.'
                    )}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-caption text-pretty text-destructive">
          {error}
        </p>
      )}
    </Card>
  );
}

/**
 * One combination: whether it is sold, its SKU, and its count.
 *
 * The count cell is the part that changes with the mode — an input when the
 * number is the operator's to give (creating, splitting), the saved count when
 * it is not (editing), and a plain statement for a combination that is new or
 * not sold.
 */
function VariantRowItem({
  row,
  mode,
  inventoryHref,
  onChange,
  disabled,
}: {
  row: VariantRow;
  mode: VariantMode;
  inventoryHref: string;
  onChange: (patch: Partial<VariantDraft>) => void;
  disabled: boolean;
}) {
  const { draft, stored } = row;

  // A saved combination with units cannot stop being sold from here: its
  // units would vanish from a total that still counts them.
  const locked = mode === 'edit' && stored !== null && stored.stock > 0 && draft.offered;

  return (
    <li
      className={cn(
        'grid grid-cols-[1.25rem_minmax(0,1fr)_6.5rem] items-center gap-x-3 gap-y-1.5 px-2 py-2',
        'sm:grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,13rem)_6.5rem]',
        !draft.offered && 'bg-muted/30',
      )}
    >
      <input
        type="checkbox"
        checked={draft.offered}
        onChange={(event) => onChange({ offered: event.target.checked })}
        disabled={disabled || locked}
        aria-label={`Sell ${row.label}`}
        title={
          locked
            ? `Holds ${stored.stock}. Adjust it to zero on the inventory page first.`
            : undefined
        }
        className="size-4 accent-brand disabled:opacity-60"
      />

      <span
        className={cn('text-small min-w-0 truncate', !draft.offered && 'text-muted-foreground')}
      >
        {row.label}
      </span>

      {/* The SKU drops to its own line on a phone, under the label. */}
      <Input
        value={draft.sku}
        onChange={(event) => onChange({ sku: event.target.value.toUpperCase() })}
        placeholder={stored?.sku ?? row.suggestedSku}
        maxLength={MAX_VARIANT_SKU_LENGTH}
        disabled={disabled || !draft.offered}
        aria-label={`SKU for ${row.label}`}
        className="order-last col-span-full h-8 font-mono text-xs sm:order-none sm:col-span-1"
      />

      <div className="text-right">
        <StockCell
          row={row}
          mode={mode}
          inventoryHref={inventoryHref}
          onChange={onChange}
          disabled={disabled}
        />
      </div>
    </li>
  );
}

function StockCell({
  row,
  mode,
  inventoryHref,
  onChange,
  disabled,
}: {
  row: VariantRow;
  mode: VariantMode;
  inventoryHref: string;
  onChange: (patch: Partial<VariantDraft>) => void;
  disabled: boolean;
}) {
  const { draft, stored } = row;
  const muted = 'text-caption text-muted-foreground';

  if (mode !== 'edit') {
    if (!draft.offered) return <span className={muted}>Not sold</span>;

    return (
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={String(draft.stock)}
        onChange={(event) => onChange({ stock: Math.trunc(Number(event.target.value) || 0) })}
        disabled={disabled}
        aria-label={`${mode === 'split' ? 'Share' : 'Opening stock'} for ${row.label}`}
        aria-invalid={draft.stock < 0 || undefined}
        className="h-8 text-right tabular-nums"
      />
    );
  }

  if (stored) {
    if (!draft.offered) return <span className={muted}>Removed on save</span>;

    // Read-only, and a way to where it can change.
    return (
      <Link
        href={inventoryHref}
        title="Adjust on the inventory page"
        aria-label={`${row.label}: ${stored.stock} in stock. Adjust on the inventory page.`}
        className="focus-ring text-small rounded-sm font-semibold tabular-nums hover:text-brand hover:underline"
      >
        {stored.stock}
      </Link>
    );
  }

  return <span className={muted}>{draft.offered ? 'Starts at 0' : 'Not sold'}</span>;
}

/**
 * The line under the grid.
 *
 * For a split it is the whole point: "Allocated 38 of 40", in a colour that
 * says whether it is under, over or exactly right — the server accepts only
 * exactly.
 */
function VariantTotals({
  mode,
  offeredCount,
  allocated,
  productStock,
}: {
  mode: VariantMode;
  offeredCount: number;
  allocated: number;
  productStock: number;
}) {
  const sold = `${offeredCount} ${offeredCount === 1 ? 'combination' : 'combinations'} sold`;

  if (mode === 'split') {
    const remaining = productStock - allocated;

    return (
      <p
        aria-live="polite"
        className={cn(
          'text-caption mt-2 flex flex-wrap items-baseline justify-between gap-2 px-2',
          remaining === 0 ? 'text-success' : 'text-destructive',
        )}
      >
        <span className="text-muted-foreground">{sold}</span>
        <span className="font-medium tabular-nums">
          Allocated {allocated} of {productStock}
          {remaining > 0 && ` · ${remaining} left to divide`}
          {remaining < 0 && ` · ${-remaining} too many`}
        </span>
      </p>
    );
  }

  return (
    <p className="text-caption mt-2 flex flex-wrap items-baseline justify-between gap-2 px-2 text-muted-foreground">
      <span>{sold}</span>
      {mode === 'create' && (
        <span className="font-medium tabular-nums">Opening stock {allocated}</span>
      )}
    </p>
  );
}

/** A boxed sentence inside the stock section: a pending merge, an orphan, an empty grid. */
function Notice({ tone, children }: { tone: 'warning' | 'danger'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn(
        'text-caption flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-pretty',
        tone === 'danger'
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-amber-400/40 bg-amber-400/10',
      )}
    >
      <AlertTriangle
        className={cn(
          'mt-0.5 size-3.5 shrink-0',
          tone === 'danger' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400',
        )}
        aria-hidden
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
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
    <SelectField
      id={id}
      value={value}
      onValueChange={onChange}
      options={options}
      placeholder="Choose…"
    />
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'focus-within:ring-ring/45 flex items-start gap-2.5 rounded-lg py-1 focus-within:ring-[3px]',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
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
