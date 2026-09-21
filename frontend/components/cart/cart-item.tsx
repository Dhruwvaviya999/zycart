'use client';

import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, BookmarkPlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuantitySelector } from '@/components/product/quantity-selector';
import { formatPrice } from '@/lib/format';
import type { CartItem as CartItemData } from '@/types/cart';
import { cn } from '@/lib/utils';

interface CartItemProps {
  item: CartItemData;
  busy: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  onSaveForLater?: () => void;
}

/** Availability turned into something a shopper can act on. */
function statusFor(item: CartItemData): { label: string; tone: string } | null {
  if (!item.product) {
    return { label: 'No longer available', tone: 'text-destructive' };
  }
  if (item.availability === 'out_of_stock') {
    return { label: 'Out of stock', tone: 'text-destructive' };
  }
  if (item.availability === 'low_stock') {
    return {
      label: item.product.stock <= 5 ? `Only ${item.product.stock} left` : 'Low stock',
      tone: 'text-sale',
    };
  }
  return null;
}

export function CartItem({
  item,
  busy,
  onQuantityChange,
  onRemove,
  onSaveForLater,
}: CartItemProps) {
  const status = statusFor(item);
  const variant = [item.selectedColor, item.selectedSize].filter(Boolean).join(' · ');
  const unavailable = !item.product || item.availability === 'out_of_stock';

  return (
    <li
      className={cn('flex gap-4 py-6 transition-opacity sm:gap-5', busy && 'opacity-60')}
      aria-busy={busy}
    >
      {item.product ? (
        <Link
          href={`/products/${item.product.slug}`}
          className="focus-ring relative size-24 shrink-0 overflow-hidden rounded-xl bg-surface sm:size-28"
        >
          {item.product.image && (
            <Image
              src={item.product.image}
              alt=""
              fill
              sizes="112px"
              className={cn('object-cover', unavailable && 'grayscale')}
            />
          )}
        </Link>
      ) : (
        <div className="grid size-24 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground sm:size-28">
          <AlertTriangle className="size-6" aria-hidden />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-caption text-muted-foreground">{item.product?.brand ?? ''}</p>

            <h3 className="text-small font-medium">
              {item.product ? (
                <Link href={`/products/${item.product.slug}`} className="focus-ring rounded-sm">
                  {item.product.name}
                </Link>
              ) : (
                'Product unavailable'
              )}
            </h3>

            <p className="text-caption mt-1 text-muted-foreground">
              {variant || item.product?.category || 'This product is no longer sold'}
            </p>

            {status && (
              <p className={cn('text-caption mt-1.5 font-medium', status.tone)}>{status.label}</p>
            )}
          </div>

          {item.product && !unavailable && (
            <div className="shrink-0 text-right">
              <p className="text-price">{formatPrice(item.lineTotal)}</p>
              {item.product.compareAtPrice && item.product.compareAtPrice > item.product.price && (
                <p className="text-caption text-muted-foreground line-through">
                  {formatPrice(item.product.compareAtPrice * item.quantity)}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2">
          {!unavailable && (
            <QuantitySelector
              value={item.quantity}
              onChange={onQuantityChange}
              max={Math.max(1, item.maxQuantity)}
              disabled={busy}
              size="sm"
            />
          )}

          {/* `lg` rather than `sm`: these are the two row actions a shopper
              taps on a phone, and a 28px control beside a 32px stepper is
              under every touch-target guideline. The icons stay at 14px, so
              only the target grew, not the visual weight. */}
          {onSaveForLater && item.product && !unavailable && (
            <Button
              size="lg"
              variant="ghost"
              onClick={onSaveForLater}
              disabled={busy}
              className="text-muted-foreground"
            >
              <BookmarkPlus className="size-3.5" data-icon="inline-start" />
              Save for later
            </Button>
          )}

          <Button
            size="lg"
            variant="ghost"
            onClick={onRemove}
            disabled={busy}
            className="ml-auto text-muted-foreground hover:text-destructive"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
            ) : (
              <Trash2 className="size-3.5" data-icon="inline-start" />
            )}
            Remove
          </Button>
        </div>
      </div>
    </li>
  );
}
