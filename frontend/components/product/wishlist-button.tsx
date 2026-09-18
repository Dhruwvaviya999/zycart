'use client';

import { Heart } from 'lucide-react';
import { useWishlistStore } from '@/store/wishlist-store';
import { cn } from '@/lib/utils';

interface WishlistButtonProps {
  productId: string;
  productName: string;
  /** `floating` sits over product imagery; `inline` sits in a form row. */
  variant?: 'floating' | 'inline';
  className?: string;
}

export function WishlistButton({
  productId,
  productName,
  variant = 'floating',
  className,
}: WishlistButtonProps) {
  const saved = useWishlistStore((state) => state.ids.includes(productId));
  const toggle = useWishlistStore((state) => state.toggle);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle(productId);
      }}
      className={cn(
        'focus-ring inline-flex items-center justify-center transition-all duration-200 ease-(--ease-brand) active:scale-90',
        variant === 'floating'
          ? 'size-9 rounded-full bg-background/80 text-foreground shadow-sm ring-1 ring-border/60 backdrop-blur-md hover:bg-background'
          : 'size-11 rounded-xl border border-border text-foreground hover:bg-muted',
        className,
      )}
    >
      <Heart
        className={cn(
          'size-[18px] transition-colors duration-200',
          saved ? 'fill-sale text-sale' : 'text-current',
        )}
      />
    </button>
  );
}
