'use client';

import { Heart, Loader2 } from 'lucide-react';
import { useIsWishlisted, useWishlistStore } from '@/store/wishlist-store';
import { cn } from '@/lib/utils';

interface WishlistButtonProps {
  productId: string;
  productName: string;
  /** `floating` sits over product imagery; `inline` sits in a form row. */
  variant?: 'floating' | 'inline';
  className?: string;
}

/**
 * The single control for saving a product, wherever it appears.
 *
 * The saved state is read from the resolved wishlist rather than kept locally,
 * so the heart on a card, the heart on the product page and the wishlist page
 * cannot drift apart. The button locks while a request is in flight, which is
 * what stops a double click becoming save-then-unsave.
 */
export function WishlistButton({
  productId,
  productName,
  variant = 'floating',
  className,
}: WishlistButtonProps) {
  const saved = useIsWishlisted(productId);
  const toggle = useWishlistStore((state) => state.toggle);
  const pending = useWishlistStore((state) => state.pendingProductIds.includes(productId));

  return (
    <button
      type="button"
      aria-pressed={saved}
      disabled={pending}
      aria-label={saved ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggle(productId);
      }}
      className={cn(
        'focus-ring inline-flex items-center justify-center transition-all duration-200 ease-(--ease-brand) active:scale-90 disabled:cursor-progress',
        variant === 'floating'
          ? 'size-9 rounded-full bg-background/80 text-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-md hover:bg-background'
          : 'size-11 rounded-xl border border-border text-foreground hover:bg-muted',
        className,
      )}
    >
      {pending ? (
        <Loader2 className="size-[18px] animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <Heart
          className={cn(
            'size-[18px] transition-colors duration-200',
            saved ? 'fill-sale text-sale' : 'text-current',
          )}
          aria-hidden
        />
      )}
    </button>
  );
}
