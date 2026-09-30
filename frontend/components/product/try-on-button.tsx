'use client';

import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { TryOnDialog } from '@/components/product/try-on-dialog';
import { getTryOnStatus } from '@/services/try-on.service';
import { cn } from '@/lib/utils';
import type { Product } from '@/types/product';
import type { TryOnStatus } from '@/types/try-on';

interface TryOnButtonProps {
  product: Product;
  colour?: string;
  onAddToCart: () => Promise<boolean>;
  className?: string;
}

/**
 * "Try it on", on the product page (Phase 19).
 *
 * Two answers decide whether it appears at all: the product's category must
 * offer try-on — a speaker has nothing to wear — and the store must have it
 * configured. The second is asked of the server once the page is in the
 * browser, exactly as the assistant's button asks, so a store without a key
 * shows nothing rather than a button that fails when pressed.
 *
 * A visitor who is not signed in still sees it, and is asked to sign in when
 * they press it: every try is paid for and counted against an account.
 */
export function TryOnButton({ product, colour, onAddToCart, className }: TryOnButtonProps) {
  if (!product.category.tryOnEnabled) return null;

  return (
    <TryOnEntry product={product} colour={colour} onAddToCart={onAddToCart} className={className} />
  );
}

function TryOnEntry({ product, colour, onAddToCart, className }: TryOnButtonProps) {
  const [status, setStatus] = useState<TryOnStatus | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let current = true;

    getTryOnStatus()
      .then((next) => {
        if (current) setStatus(next);
      })
      // An API that cannot say is treated as an API without the feature.
      .catch(() => undefined);

    return () => {
      current = false;
    };
  }, []);

  if (!status?.available) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'focus-ring text-small inline-flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand-subtle/40 px-4 py-2.5 font-medium text-brand transition-colors hover:bg-brand-subtle',
          className,
        )}
      >
        <Camera className="size-4" aria-hidden />
        Try it on — see it on you
      </button>

      <TryOnDialog
        product={product}
        colour={colour}
        status={status}
        open={open}
        onOpenChange={setOpen}
        onRemainingChange={(remaining) =>
          setStatus((previous) =>
            previous ? { ...previous, remainingToday: remaining } : previous,
          )
        }
        onAddToCart={onAddToCart}
      />
    </>
  );
}
