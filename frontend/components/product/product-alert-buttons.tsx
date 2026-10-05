'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellRing, Loader2, TrendingDown, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, toErrorMessage } from '@/services/api';
import { createAlert, deleteAlert, getAlerts } from '@/services/alert.service';
import { useAuthStore } from '@/store/auth-store';
import { formatPrice } from '@/lib/format';
import { sameOption, variantLabel, type VariantChoice } from '@/lib/variants';
import type { AlertView, CreateAlertInput } from '@/types/alert';
import { cn } from '@/lib/utils';

/**
 * Back-in-stock and price-drop alerts on the product page (Phase 20).
 *
 * Two controls with one source of truth: the customer's alerts for this
 * product, read once and then kept in step with every create and remove. The
 * page renders the two in different places — the restock offer where the cart
 * buttons would be, the price watch quietly below — so the list lives in a hook
 * the page calls once and hands to both, rather than each fetching its own.
 */

/** Who is looking: not yet known, a visitor, or a customer whose alerts can be read. */
type Session = 'unknown' | 'guest' | 'customer';

export interface ProductAlerts {
  session: Session;
  /** This customer's alerts for the product; null until they have been read. */
  alerts: AlertView[] | null;
  create: (input: CreateAlertInput) => Promise<AlertView>;
  remove: (alertId: string) => Promise<void>;
}

/**
 * Reads, and then owns, the signed-in customer's alerts for one product.
 *
 * The fetched list is tagged with the customer and product it describes, the
 * same way the review section tags its eligibility check, so a sign-out or a
 * client-side move to another product can never show one answer against the
 * other. Nothing is requested for a visitor, whose answer needs no request.
 */
export function useProductAlerts(productId: string): ProductAlerts {
  const authStatus = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);

  const session: Session = authStatus !== 'ready' ? 'unknown' : user ? 'customer' : 'guest';
  const key = user ? `${user.id}|${productId}` : null;

  const [fetched, setFetched] = useState<{ key: string; alerts: AlertView[] } | null>(null);

  useEffect(() => {
    if (!key) return;

    let cancelled = false;

    getAlerts({ productId })
      .then((alerts) => {
        if (!cancelled) setFetched({ key, alerts });
      })
      .catch(() => {
        // Not worth a banner: the controls simply offer to create an alert,
        // and asking for one that already exists answers with the existing
        // one rather than a duplicate, so the worst case corrects itself.
        if (!cancelled) setFetched({ key, alerts: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [key, productId]);

  const alerts = session === 'customer' && fetched?.key === key ? fetched.alerts : null;

  const create = useCallback(
    async (input: CreateAlertInput) => {
      const alert = await createAlert(input);
      setFetched((current) =>
        current && current.key === key
          ? {
              ...current,
              alerts: [alert, ...current.alerts.filter((entry) => entry.id !== alert.id)],
            }
          : current,
      );
      return alert;
    },
    [key],
  );

  const remove = useCallback(
    async (alertId: string) => {
      await deleteAlert(alertId);
      setFetched((current) =>
        current && current.key === key
          ? { ...current, alerts: current.alerts.filter((entry) => entry.id !== alertId) }
          : current,
      );
    },
    [key],
  );

  return { session, alerts, create, remove };
}

/** Back to this product after signing in, never anywhere the query could invent. */
const signInHref = (slug: string) => `/login?redirect=${encodeURIComponent(`/products/${slug}`)}`;

/** A failure, remembered against the target it was about so a new choice clears it. */
interface Failure {
  key: string;
  message: string;
}

/**
 * The 409 that means "you do not need an alert, you need the cart".
 *
 * The API refuses a restock alert for something buyable right now, which
 * happens when the page was rendered before a delivery arrived. Recognised by
 * the API's wording — the only other 409 here is the cap on waiting alerts,
 * and should the wording ever change, the message is still shown, just as an
 * ordinary error rather than good news.
 */
const isInStockNow = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 409 && /in stock now/i.test(error.message);

interface BackInStockButtonProps {
  alerts: ProductAlerts;
  productId: string;
  slug: string;
  /** What to wait for: a combination, or nothing for "anything in this product". */
  choice: VariantChoice;
  /**
   * Called with the API's message when the target turns out to be in stock
   * already. The page uses it to re-read the product and say so — this button
   * is about to disappear, so it is the wrong place to put the good news.
   */
  onInStockNow?: (message: string) => void;
  className?: string;
}

/**
 * "Notify me when it’s back", in place of the cart buttons when the choice is
 * sold out.
 *
 * A visitor is sent to sign in and straight back, because the answer arrives
 * by email and the address is the account's. A customer already waiting for
 * this exact combination sees that instead of a second offer, with a way to
 * take it back — the alert is one-shot, so after it is sent this offers again.
 */
export function BackInStockButton({
  alerts,
  productId,
  slug,
  choice,
  onInStockNow,
  className,
}: BackInStockButtonProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  const label = variantLabel(choice);
  const target = `${choice.color ?? ''}|${choice.size ?? ''}`;
  const error = failure?.key === target ? failure.message : null;

  const existing = alerts.alerts?.find(
    (alert) =>
      alert.type === 'BACK_IN_STOCK' &&
      alert.status === 'ACTIVE' &&
      sameOption(alert.selectedColor, choice.color) &&
      sameOption(alert.selectedSize, choice.size),
  );

  async function run(action: () => Promise<unknown>) {
    if (busy) return;

    setBusy(true);
    setFailure(null);

    try {
      await action();
    } catch (cause) {
      if (isInStockNow(cause) && onInStockNow) {
        onInStockNow(cause.message);
      } else {
        setFailure({ key: target, message: toErrorMessage(cause) });
      }
    } finally {
      setBusy(false);
    }
  }

  let control: React.ReactNode;

  if (alerts.session === 'guest') {
    control = (
      <Button
        size="cta-lg"
        variant="brand"
        className="w-full"
        render={<Link href={signInHref(slug)} />}
      >
        <Bell className="size-4" data-icon="inline-start" aria-hidden />
        Notify me when it’s back
      </Button>
    );
  } else if (existing) {
    control = (
      <div
        role="status"
        className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-4 py-2.5"
      >
        <BellRing className="size-4 shrink-0 text-brand" aria-hidden />
        <p className="text-small min-w-0 flex-1 font-medium text-pretty">
          We’ll email you when it’s back
          {existing.variant && (
            <span className="font-normal text-muted-foreground"> · {existing.variant}</span>
          )}
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void run(() => alerts.remove(existing.id))}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" aria-hidden />
          ) : (
            <Undo2 className="size-3.5" data-icon="inline-start" aria-hidden />
          )}
          Undo
        </Button>
      </div>
    );
  } else {
    // Still finding out who is looking, or what they already watch: the
    // button is shown but held, so it neither flickers nor duplicates.
    const waiting = alerts.session === 'unknown' || alerts.alerts === null;

    control = (
      <Button
        size="cta-lg"
        variant="brand"
        className="w-full"
        disabled={busy || waiting}
        onClick={() =>
          void run(() =>
            alerts.create({
              productId,
              type: 'BACK_IN_STOCK',
              selectedColor: choice.color ?? null,
              selectedSize: choice.size ?? null,
            }),
          )
        }
      >
        {busy || (waiting && alerts.session === 'customer') ? (
          <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden />
        ) : (
          <Bell className="size-4" data-icon="inline-start" aria-hidden />
        )}
        Notify me when it’s back
      </Button>
    );
  }

  return (
    <div className={cn('min-w-0', className)}>
      {control}

      {/* Says what will be watched, so "it" is never ambiguous on a product
          with twenty combinations. Hidden once the status line says it. */}
      {!existing && (
        <p className="text-caption mt-2 text-pretty text-muted-foreground">
          {alerts.session === 'guest' ? 'Sign in and we’ll email you once' : 'We’ll email you once'}
          {label ? ` ${label} is back in stock.` : ' this is back in stock.'}
        </p>
      )}

      {error && (
        <p role="alert" className="text-caption mt-2 font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

interface PriceDropButtonProps {
  alerts: ProductAlerts;
  productId: string;
  slug: string;
  className?: string;
}

/**
 * "Alert me if the price drops" — deliberately quiet.
 *
 * It sits below everything that buys, because it is the opposite of buying
 * now. The price it watches is the one the server reads when the alert is
 * made, never one the page sends, so the status line quotes the alert's own
 * figure rather than whatever this page rendered with.
 */
export function PriceDropButton({ alerts, productId, slug, className }: PriceDropButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = alerts.alerts?.find(
    (alert) => alert.type === 'PRICE_DROP' && alert.status === 'ACTIVE',
  );

  async function run(action: () => Promise<unknown>) {
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      await action();
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const quiet =
    'focus-ring text-caption inline-flex items-center gap-1.5 rounded-md font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-60';

  let control: React.ReactNode;

  if (alerts.session === 'guest') {
    control = (
      <Link href={signInHref(slug)} className={quiet}>
        <TrendingDown className="size-3.5" aria-hidden />
        Alert me if the price drops
      </Link>
    );
  } else if (existing) {
    control = (
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-caption inline-flex min-w-0 items-start gap-1.5 text-pretty text-muted-foreground">
          <TrendingDown className="mt-px size-3.5 shrink-0 text-brand" aria-hidden />
          <span>
            Watching the price — we’ll email you if it drops below{' '}
            <span className="font-medium text-foreground">
              {existing.priceAtCreation === null
                ? 'today’s price'
                : formatPrice(existing.priceAtCreation)}
            </span>
          </span>
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => alerts.remove(existing.id))}
          className={quiet}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Stop watching
        </button>
      </div>
    );
  } else {
    const waiting = alerts.session === 'unknown' || alerts.alerts === null;

    control = (
      <button
        type="button"
        disabled={busy || waiting}
        onClick={() => void run(() => alerts.create({ productId, type: 'PRICE_DROP' }))}
        className={quiet}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <TrendingDown className="size-3.5" aria-hidden />
        )}
        Alert me if the price drops
      </button>
    );
  }

  return (
    <div className={cn('min-w-0', className)}>
      {control}

      {error && (
        <p role="alert" className="text-caption mt-1.5 font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
