'use client';

import Link from 'next/link';
import { AlertTriangle, RotateCw } from 'lucide-react';

/**
 * What a failed turn looks like.
 *
 * Two things it never does: quote the provider, and imply the store is broken.
 * The message comes from the server's own sanitised text — no status code, no
 * SDK exception, no stack — and the second button is a way out of the
 * conversation, because the catalogue, cart and checkout are all still working.
 */
interface AiErrorProps {
  message: string;
  onRetry: () => void;
  onLeave?: () => void;
}

export function AiError({ message, onRetry, onLeave }: AiErrorProps) {
  return (
    <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-3.5">
      <p className="text-small flex items-start gap-2.5 font-medium">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        <span className="text-pretty">{message}</span>
      </p>

      <div className="mt-3 flex flex-wrap gap-2 pl-[1.625rem]">
        <button
          type="button"
          onClick={onRetry}
          className="focus-ring text-caption inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          <RotateCw className="size-3.5" aria-hidden />
          Try again
        </button>

        <Link
          href="/shop"
          onClick={onLeave}
          className="focus-ring text-caption inline-flex h-8 items-center rounded-lg border border-border px-3 font-medium transition-colors hover:bg-muted"
        >
          Continue shopping
        </Link>
      </div>
    </div>
  );
}

/**
 * Shown in place of the conversation when this deployment has no assistant.
 *
 * Honest rather than hopeful: there is no input to type into, because typing
 * into it would fail. The storefront is unaffected and says so.
 */
export function AiUnavailable() {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground">
        <AlertTriangle className="size-5" aria-hidden />
      </div>

      <p className="text-h4">ZyCart AI is unavailable</p>
      <p className="text-small mt-2 max-w-xs text-pretty text-muted-foreground">
        The shopping assistant is switched off for this store. Everything else — browsing, search,
        your cart and checkout — works as normal.
      </p>

      <Link
        href="/shop"
        className="focus-ring text-small mt-5 inline-flex h-9 items-center rounded-xl border border-border px-4 font-medium transition-colors hover:bg-muted"
      >
        Browse the shop
      </Link>
    </div>
  );
}
