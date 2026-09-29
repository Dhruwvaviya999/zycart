'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/common/select-field';
import { AuthError } from '@/components/auth/auth-error';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { fieldErrors, toErrorMessage } from '@/services/api';
import { createCoupon, deleteCoupon, updateCoupon } from '@/services/admin.service';
import type { AdminCouponDetail, CouponInput, CouponType } from '@/types/admin';

const TYPE_OPTIONS: { value: CouponType; label: string }[] = [
  { value: 'PERCENT', label: 'Percentage off' },
  { value: 'FLAT', label: 'Fixed amount off' },
];

/** Must match `COUPON_CODE_PATTERN` on the server. Checked here only to answer sooner. */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

/**
 * The store's distance from UTC.
 *
 * `STORE_TIME_ZONE` in `lib/format.ts` is Asia/Kolkata, which keeps no daylight
 * saving — so the offset is a constant, and turning an instant into the store's
 * wall-clock time is arithmetic rather than a timezone lookup that could answer
 * one way on the server and another in the browser.
 */
const STORE_OFFSET_MINUTES = 330;
const STORE_OFFSET = '+05:30';

/** What an edit sends: any subset of the fields, and never the code. */
type CouponUpdate = Omit<Partial<CouponInput>, 'code'>;

/**
 * The form as typed.
 *
 * Numbers are held as the strings their inputs produce, because four of them
 * are optional and blank is a real answer — no cap, no limit — that a number
 * cannot hold. They become numbers, or `null`, only on the way out, in
 * `toInput`. Dates are held as `datetime-local` values in store time.
 */
interface Draft {
  code: string;
  description: string;
  type: CouponType;
  value: string;
  maxDiscount: string;
  minOrderValue: string;
  startsAt: string;
  expiresAt: string;
  usageLimit: string;
  perUserLimit: string;
  isActive: boolean;
}

/**
 * Creating and editing a coupon.
 *
 * One form for both, as with products: the same task from a different starting
 * point. What differs is whether the code can be typed, what is sent on save,
 * and whether deleting is on offer.
 *
 * ## Validation is the server's
 *
 * This checks only what it can answer faster than a round trip — a code that
 * could never be valid, a percentage over 100, an end before its start — and
 * renders whatever else the API says beside the field it belongs to. The rules
 * themselves live in one place, the backend's coupon validator.
 *
 * ## Only what changed is sent
 *
 * An edit sends the fields that differ from what the page loaded, not the whole
 * form. A colleague's change to a field this operator never touched is not
 * quietly reverted by their save, and a stored date is not rewritten merely
 * because a minute-precision input rounded it on the way through — which would
 * otherwise put a change nobody made into the activity log.
 *
 * ## Dates are the store's
 *
 * A `datetime-local` input has no timezone of its own; it shows whatever
 * wall-clock time it is handed. So a stored instant is shifted into IST by
 * arithmetic before it is shown, and a typed time goes back with `+05:30`
 * attached. Using the browser's zone instead would render one value on the
 * server and another after hydration, and would silently move a start time for
 * any operator whose laptop is not set to India.
 */
export function CouponForm({
  coupon,
}: {
  /** Absent when creating. */
  coupon?: AdminCouponDetail;
}) {
  const router = useRouter();
  const editing = Boolean(coupon);

  const [form, setForm] = useState<Draft>(() => draftFrom(coupon));

  /**
   * What the server holds, as far as this form knows.
   *
   * Moved forward on every successful save, so the next save sends only what
   * changed since that one, and "unsaved changes" means exactly that.
   */
  const [baseline, setBaseline] = useState<Draft>(() => draftFrom(coupon));

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const percent = form.type === 'PERCENT';

  /**
   * Warns before losing edits to a closed tab or a typed URL.
   *
   * As on the product form, it cannot cover an in-app navigation, so the back
   * button says "discard" out loud whenever there is something to discard.
   */
  useEffect(() => {
    if (!dirty || saving) return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFields((current) => ({ ...current, ...cleared(key) }));
    setSaved(false);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    // The guard that makes a double-click harmless.
    if (saving) return;

    const problems = validate(form, !coupon);
    setFields(problems);
    if (Object.keys(problems).length > 0) return;

    setSaving(true);
    setError(undefined);
    setSaved(false);

    try {
      if (coupon) {
        /**
         * The form as it was when Save was pressed. Anything typed while the
         * request is in flight stays in the form, unsaved and marked as such,
         * rather than being overwritten when the answer comes back.
         */
        const submitted = form;
        const patch = changedFields(toInput(baseline), toInput(submitted));

        // An edit that changed nothing the API would store — "10" retyped as
        // "010" — is not worth a request, or an entry in the activity log.
        if (Object.keys(patch).length > 0) await updateCoupon(coupon.id, patch);

        setBaseline(submitted);
        setSaved(true);
        // The header, the counts and the state are the server's; re-read them.
        router.refresh();
      } else {
        const created = await createCoupon({ ...toInput(form), code: form.code.trim() });
        router.replace(`/admin/coupons/${created.id}`);
        return;
      }
    } catch (cause) {
      setError(toErrorMessage(cause));
      setFields(fieldErrors(cause));
    }

    setSaving(false);
  }

  return (
    <>
      <form onSubmit={submit} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card title="Details">
            <Field
              label="Code"
              hint={
                editing
                  ? 'Fixed once the coupon exists — orders record the code they used.'
                  : 'What customers type at checkout. Letters, digits, - and _.'
              }
              error={fields.code}
              htmlFor="code"
            >
              <Input
                id="code"
                value={form.code}
                onChange={(event) => update('code', event.target.value.toUpperCase())}
                disabled={editing}
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                placeholder="FESTIVE15"
                aria-invalid={Boolean(fields.code) || undefined}
              />
            </Field>

            <Field
              label="Description"
              hint="Optional. Shown to the customer when the code applies; left blank, they see the deal itself."
              error={fields.description}
              htmlFor="description"
            >
              <Input
                id="description"
                value={form.description}
                onChange={(event) => update('description', event.target.value)}
                maxLength={160}
                placeholder="15% off for the festive season"
                aria-invalid={Boolean(fields.description) || undefined}
              />
            </Field>
          </Card>

          <Card
            title="Discount"
            description="Worked out on the goods subtotal, and never more than it."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Every field in these two-column grids carries a one-line hint,
                  so the inputs beside each other line up. */}
              <Field
                label="Type"
                hint="Decides what the amount means"
                error={fields.type}
                htmlFor="type"
              >
                <SelectField
                  id="type"
                  value={form.type}
                  onValueChange={(value) => {
                    if (value === 'PERCENT' || value === 'FLAT') update('type', value);
                  }}
                  options={TYPE_OPTIONS}
                  aria-invalid={Boolean(fields.type) || undefined}
                />
              </Field>

              <Field
                label={percent ? 'Percent off' : 'Rupees off'}
                hint={percent ? 'A whole number from 1 to 100' : 'Whole rupees'}
                error={fields.value}
                htmlFor="value"
              >
                <Input
                  id="value"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={form.value}
                  onChange={(event) => update('value', event.target.value)}
                  aria-invalid={Boolean(fields.value) || undefined}
                />
              </Field>

              {/* Percentage coupons only. A flat coupon is its own cap, and the
                  server refuses one alongside it — so the field goes rather
                  than sitting there to be filled in and rejected. */}
              {percent && (
                <Field
                  label="Maximum discount (₹)"
                  hint="Optional. Blank means no cap."
                  error={fields.maxDiscount}
                  htmlFor="maxDiscount"
                >
                  <Input
                    id="maxDiscount"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={form.maxDiscount}
                    onChange={(event) => update('maxDiscount', event.target.value)}
                    aria-invalid={Boolean(fields.maxDiscount) || undefined}
                  />
                </Field>
              )}

              <Field
                label="Minimum order (₹)"
                hint="Subtotal needed first. 0 for none."
                error={fields.minOrderValue}
                htmlFor="minOrderValue"
              >
                <Input
                  id="minOrderValue"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={form.minOrderValue}
                  onChange={(event) => update('minOrderValue', event.target.value)}
                  placeholder="0"
                  aria-invalid={Boolean(fields.minOrderValue) || undefined}
                />
              </Field>
            </div>
          </Card>

          <Card
            title="Dates"
            description="In store time. Leave both blank for a code that works until it is switched off."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Starts (IST)"
                hint="Optional. Blank means no start date."
                error={fields.startsAt}
                htmlFor="startsAt"
              >
                <Input
                  id="startsAt"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => update('startsAt', event.target.value)}
                  aria-invalid={Boolean(fields.startsAt) || undefined}
                />
              </Field>

              <Field
                label="Expires (IST)"
                hint="Optional. Blank means no end date."
                error={fields.expiresAt}
                htmlFor="expiresAt"
              >
                <Input
                  id="expiresAt"
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(event) => update('expiresAt', event.target.value)}
                  aria-invalid={Boolean(fields.expiresAt) || undefined}
                />
              </Field>
            </div>
          </Card>

          <Card
            title="Limits"
            description="Counted in orders. A cancelled order gives its use back."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Total uses"
                hint="Optional. Blank means unlimited."
                error={fields.usageLimit}
                htmlFor="usageLimit"
              >
                <Input
                  id="usageLimit"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={form.usageLimit}
                  onChange={(event) => update('usageLimit', event.target.value)}
                  aria-invalid={Boolean(fields.usageLimit) || undefined}
                />
              </Field>

              <Field
                label="Uses per customer"
                hint="Optional. Blank means unlimited."
                error={fields.perUserLimit}
                htmlFor="perUserLimit"
              >
                <Input
                  id="perUserLimit"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={form.perUserLimit}
                  onChange={(event) => update('perUserLimit', event.target.value)}
                  aria-invalid={Boolean(fields.perUserLimit) || undefined}
                />
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Status">
            <div>
              <label className="focus-within:ring-ring/45 flex cursor-pointer items-center gap-2.5 rounded-lg py-1 focus-within:ring-[3px]">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => update('isActive', event.target.checked)}
                  className="size-4 accent-brand"
                />
                <span className="text-small font-medium">Active</span>
              </label>
              <p className="text-caption mt-1 text-pretty text-muted-foreground">
                Switched off, the code stops working at checkout at once, whatever its dates say.
                Orders that already used it keep their discount.
              </p>
            </div>

            {/* The other half of the delete rule, said where the alternative
                lives. `canDelete` is the server's answer: a coupon whose uses
                were all given back has still been used. */}
            {coupon && !coupon.canDelete && (
              <p className="text-caption text-pretty text-muted-foreground">
                This code has been used, so it cannot be deleted — switch it off instead.
              </p>
            )}
          </Card>

          <div className="sticky bottom-4 space-y-2 rounded-xl border border-border bg-background/95 p-3 backdrop-blur">
            <AuthError message={error} />

            {saved && !dirty && (
              <p role="status" className="text-caption flex items-center gap-1.5 text-success">
                <CheckCircle2 className="size-3.5" aria-hidden />
                Saved.
              </p>
            )}

            <Button
              type="submit"
              size="cta"
              variant="brand"
              // Nothing to save is not a request worth making.
              disabled={saving || (editing && !dirty)}
              className="w-full"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
                  Saving…
                </>
              ) : editing ? (
                'Save changes'
              ) : (
                'Create coupon'
              )}
            </Button>

            <Button
              type="button"
              size="cta"
              variant="ghost"
              render={<Link href="/admin/coupons" />}
              className="w-full"
            >
              {dirty ? 'Discard and go back' : 'Back to coupons'}
            </Button>
          </div>

          {/* Destructive actions, visually separated from ordinary editing —
              and offered only while the server says deleting would work. */}
          {coupon?.canDelete && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-small font-semibold text-destructive">Danger zone</p>
              <p className="text-caption mt-1 mb-3 text-pretty text-muted-foreground">
                No order has used this code, so it can still be deleted outright. Switching it off
                instead stops it working and keeps it to switch back on later.
              </p>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setDeleting(true)}
              >
                Delete coupon
              </Button>
            </div>
          )}
        </div>
      </form>

      {coupon?.canDelete && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title="Delete this coupon?"
          destructive
          description={
            <>
              <strong>{coupon.code}</strong> will be removed permanently. No order has used it, so
              no order history refers to it — but anybody who has been given the code will be told
              it is not valid.
            </>
          }
          confirmLabel="Delete permanently"
          busyLabel="Deleting…"
          onConfirm={async () => {
            await deleteCoupon(coupon.id);
            router.push('/admin/coupons');
          }}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- */

function draftFrom(coupon: AdminCouponDetail | undefined): Draft {
  return {
    code: coupon?.code ?? '',
    description: coupon?.description ?? '',
    type: coupon?.type ?? 'PERCENT',
    value: coupon ? String(coupon.value) : '',
    maxDiscount: numberText(coupon?.maxDiscount),
    minOrderValue: String(coupon?.minOrderValue ?? 0),
    startsAt: toLocalInput(coupon?.startsAt ?? null),
    expiresAt: toLocalInput(coupon?.expiresAt ?? null),
    usageLimit: numberText(coupon?.usageLimit),
    /**
     * Once per customer for a new coupon, unless somebody decides otherwise.
     *
     * The same default the create endpoint applies: a promotion one customer
     * can use on every order they ever place is rarely what anybody meant.
     */
    perUserLimit: coupon ? numberText(coupon.perUserLimit) : '1',
    isActive: coupon?.isActive ?? true,
  };
}

/**
 * The draft as the API takes it.
 *
 * Blank optional fields become `null` rather than being left out. On an edit a
 * missing field means "leave it as it is" and `null` means "take it away", and
 * an operator who empties the usage limit means the second.
 */
function toInput(draft: Draft): CouponInput {
  return {
    description: draft.description.trim(),
    type: draft.type,
    value: Number(draft.value),
    // A flat coupon is its own cap, and the server refuses one alongside it.
    maxDiscount: draft.type === 'PERCENT' ? optionalNumber(draft.maxDiscount) : null,
    minOrderValue: isBlank(draft.minOrderValue) ? 0 : Number(draft.minOrderValue),
    startsAt: fromLocalInput(draft.startsAt),
    expiresAt: fromLocalInput(draft.expiresAt),
    usageLimit: optionalNumber(draft.usageLimit),
    perUserLimit: optionalNumber(draft.perUserLimit),
    isActive: draft.isActive,
  };
}

/** The fields whose values differ between two versions of the input. */
function changedFields(before: CouponInput, after: CouponInput): CouponUpdate {
  return Object.fromEntries(
    Object.entries(after).filter(
      ([key, value]) => key !== 'code' && value !== before[key as keyof CouponInput],
    ),
  ) as CouponUpdate;
}

/**
 * The checks worth making before a round trip.
 *
 * Each is one the server would refuse anyway. This exists to answer sooner,
 * not to hold a second copy of the rules — which is why there is no ceiling on
 * a limit here: the server has one, and says so beside the field.
 */
function validate(draft: Draft, creating: boolean): Record<string, string> {
  const problems: Record<string, string> = {};
  const percent = draft.type === 'PERCENT';

  if (creating && !CODE_PATTERN.test(draft.code.trim())) {
    problems.code =
      'Use 3 to 32 letters, digits, hyphens or underscores, starting with a letter or digit.';
  }

  if (!isWhole(draft.value, 1)) {
    problems.value = percent
      ? 'Enter a whole percentage from 1 to 100.'
      : 'Enter a whole number of rupees.';
  } else if (percent && Number(draft.value) > 100) {
    problems.value = 'A percentage cannot be more than 100.';
  }

  if (percent && !isBlank(draft.maxDiscount) && !isWhole(draft.maxDiscount, 1)) {
    problems.maxDiscount = 'Enter a whole number of rupees, or leave it blank for no cap.';
  }

  if (!isBlank(draft.minOrderValue) && !isWhole(draft.minOrderValue, 0)) {
    problems.minOrderValue = 'Enter a whole number of rupees, or 0 for no minimum.';
  }

  const starts = instant(draft.startsAt);
  const expires = instant(draft.expiresAt);
  if (starts !== null && expires !== null && expires <= starts) {
    problems.expiresAt = 'The end has to come after the start.';
  }

  if (!isBlank(draft.usageLimit) && !isWhole(draft.usageLimit, 1)) {
    problems.usageLimit = 'Enter a whole number, or leave it blank for no limit.';
  }

  if (!isBlank(draft.perUserLimit) && !isWhole(draft.perUserLimit, 1)) {
    problems.perUserLimit = 'Enter a whole number, or leave it blank for no limit.';
  }

  return problems;
}

/**
 * The errors a change to one field makes stale.
 *
 * Usually only its own. But changing the type changes what the amount means,
 * and moving the start can mend an end that was before it — so those clear
 * the messages they may have answered.
 */
function cleared(key: keyof Draft): Record<string, string> {
  const related: Partial<Record<keyof Draft, (keyof Draft)[]>> = {
    type: ['value', 'maxDiscount'],
    startsAt: ['expiresAt'],
  };

  return Object.fromEntries([key, ...(related[key] ?? [])].map((name) => [name, '']));
}

const isBlank = (text: string): boolean => text.trim() === '';

function isWhole(text: string, min: number): boolean {
  const value = Number(text);
  return !isBlank(text) && Number.isInteger(value) && value >= min;
}

const optionalNumber = (text: string): number | null => (isBlank(text) ? null : Number(text));

/** A nullable number as an input's text: blank for null. */
const numberText = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

/**
 * A stored instant as the store's wall-clock time, as `datetime-local` wants it.
 *
 * Shifted by the offset and then read back as UTC, which produces the same
 * string on the server and in every browser, whatever zone each is set to.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';

  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';

  return new Date(time + STORE_OFFSET_MINUTES * 60_000).toISOString().slice(0, 16);
}

/**
 * A typed wall-clock time as an instant the API can store, or `null` for blank.
 *
 * Cut to the minute first: an input can report seconds of its own, and the
 * form works in whole minutes, so the seconds sent are always `:00`.
 */
function fromLocalInput(value: string): string | null {
  return value ? `${value.slice(0, 16)}:00${STORE_OFFSET}` : null;
}

/** Milliseconds since the epoch for a typed time, or null when it is blank. */
function instant(value: string): number | null {
  const iso = fromLocalInput(value);
  return iso === null ? null : Date.parse(iso);
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
