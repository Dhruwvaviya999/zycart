'use client';

import type { ProductColor, ProductSize } from '@/types/product';
import { cn } from '@/lib/utils';

interface VariantPickerProps {
  colors: ProductColor[];
  sizes: ProductSize[];
  selectedColor?: string;
  selectedSize?: string;
  onColorChange: (name: string) => void;
  onSizeChange: (label: string) => void;
  /** Set once a choice has been attempted, so nothing shouts before it should. */
  colorError?: string;
  sizeError?: string;
  size?: 'default' | 'compact';
}

/**
 * The one colour and size control, shared by the product page and quick add.
 *
 * Nothing is preselected on purpose: choosing a size for someone is how a
 * customer ends up with the wrong one. Sold-out sizes stay visible but
 * unselectable, which answers "do they have my size?" better than hiding them.
 */
export function VariantPicker({
  colors,
  sizes,
  selectedColor,
  selectedSize,
  onColorChange,
  onSizeChange,
  colorError,
  sizeError,
  size = 'default',
}: VariantPickerProps) {
  const compact = size === 'compact';

  return (
    <>
      {colors.length > 0 && (
        <fieldset className={compact ? '' : 'mt-8'}>
          <legend className="text-small font-semibold">
            Colour
            {selectedColor && (
              <span className="ml-2 font-normal text-muted-foreground">{selectedColor}</span>
            )}
          </legend>

          <div className="mt-3 flex flex-wrap gap-2.5">
            {colors.map((option) => (
              <button
                key={option.name}
                type="button"
                onClick={() => onColorChange(option.name)}
                aria-pressed={selectedColor === option.name}
                aria-label={option.name}
                className={cn(
                  'focus-ring grid place-items-center rounded-full ring-1 transition-all',
                  compact ? 'size-8' : 'size-9',
                  selectedColor === option.name
                    ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                    : 'ring-border hover:ring-foreground/30',
                )}
              >
                <span
                  className={cn('rounded-full', compact ? 'size-6' : 'size-7')}
                  style={{ backgroundColor: option.hex }}
                  aria-hidden
                />
              </button>
            ))}
          </div>

          <p
            role={colorError ? 'alert' : undefined}
            className="text-caption min-h-4 pt-1.5 font-medium text-destructive"
          >
            {colorError ?? ''}
          </p>
        </fieldset>
      )}

      {sizes.length > 0 && (
        <fieldset className={compact ? '' : 'mt-4'}>
          <legend className="text-small font-semibold">Size</legend>

          <div className="mt-3 flex flex-wrap gap-2">
            {sizes.map((option) => (
              <button
                key={option.label}
                type="button"
                disabled={!option.inStock}
                onClick={() => onSizeChange(option.label)}
                aria-pressed={selectedSize === option.label}
                className={cn(
                  'focus-ring text-small rounded-xl border px-3 font-medium transition-all',
                  compact ? 'h-9 min-w-14' : 'h-11 min-w-16',
                  selectedSize === option.label
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:border-foreground/30',
                  !option.inStock &&
                    'cursor-not-allowed border-dashed text-muted-foreground/50 line-through hover:border-border',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p
            role={sizeError ? 'alert' : undefined}
            className="text-caption min-h-4 pt-1.5 font-medium text-destructive"
          >
            {sizeError ?? ''}
          </p>
        </fieldset>
      )}
    </>
  );
}
