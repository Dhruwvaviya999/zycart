'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Price } from '@/components/product/price';
import { VariantPicker } from '@/components/product/variant-picker';
import { toErrorMessage } from '@/services/api';
import { useCartStore } from '@/store/cart-store';
import { imageAlt } from '@/lib/product';
import type { ProductSummary } from '@/types/product';

interface QuickAddDialogProps {
  product: ProductSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}

/**
 * Lets a shopper choose a size or colour without leaving the grid.
 *
 * It exists because quick add must never guess: picking a size on someone's
 * behalf is how the wrong one ends up in the bag. Products with no options
 * never reach this dialog — they add in one click.
 */
export function QuickAddDialog({ product, open, onOpenChange, onAdded }: QuickAddDialogProps) {
  const add = useCartStore((state) => state.add);

  const [color, setColor] = useState<string>();
  const [size, setSize] = useState<string>();
  const [errors, setErrors] = useState<{ color?: string; size?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd() {
    const next: typeof errors = {};
    if (product.colors.length > 0 && !color) next.color = 'Please choose a colour';
    if (product.sizes.length > 0 && !size) next.size = 'Please choose a size';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    setFormError(undefined);

    try {
      await add({ productId: product.id, quantity: 1, selectedColor: color, selectedSize: size });
      onOpenChange(false);
      onAdded();
      setColor(undefined);
      setSize(undefined);
    } catch (error) {
      setFormError(toErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Bottom sheet on a phone, centred card from `sm` up. */}
      <DialogContent
        showCloseButton={false}
        variant="sheet"
          size="md"
      >
        <div className="flex items-start gap-4 border-b border-border p-5">
          <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface">
            {product.images[0] && (
              <Image
                src={product.images[0]}
                alt={imageAlt(product, 0)}
                fill
                sizes="64px"
                className="object-cover"
              />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <DialogTitle className="text-small font-semibold">{product.name}</DialogTitle>
            <DialogDescription className="text-caption text-muted-foreground">
              {product.brand.name}
            </DialogDescription>
            <Price
              price={product.price}
              compareAtPrice={product.compareAtPrice}
              className="mt-1.5"
            />
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="focus-ring -mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <VariantPicker
            colors={product.colors}
            sizes={product.sizes}
            selectedColor={color}
            selectedSize={size}
            onColorChange={setColor}
            onSizeChange={setSize}
            colorError={errors.color}
            sizeError={errors.size}
            size="compact"
          />

          {formError && (
            <p role="alert" className="text-caption mt-1 font-medium text-destructive">
              {formError}
            </p>
          )}

          <Link
            href={`/products/${product.slug}`}
            className="focus-ring text-caption mt-2 inline-block rounded-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            See full product details
          </Link>
        </div>

        <div className="border-t border-border p-4">
          <Button
            size="cta-lg"
            variant="brand"
            onClick={handleAdd}
            disabled={submitting}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                Adding...
              </>
            ) : (
              'Add to cart'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
