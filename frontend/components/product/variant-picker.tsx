'use client';

import type { ProductColor, ProductSize, ProductVariant } from '@/types/product';
import { colorAvailability, sizeAvailability, type OptionAvailability } from '@/lib/variants';
import { cn } from '@/lib/utils';

interface VariantPickerProps {
  colors: ProductColor[];
  sizes: ProductSize[];
  /**
   * Stock per combination, when the product tracks it (Phase 20). Without it —
   * or with it empty — sizes answer from their own `inStock` flag and colours
   * are always offered, exactly as before.
   */
  variants?: ProductVariant[];
  /**
   * Whether a sold-out option can still be chosen.
   *
   * Off by default, because in most places choosing something that cannot be
   * bought is a dead end. The product page turns it on: there a customer may
   * pick the colour and size they actually want, sold out or not, and ask to
   * be told when it is back. A combination the shop does not sell at all is
   * never selectable — nothing will come back, so there is nothing to wait for.
   */
  allowSoldOut?: boolean;
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
 * What a screen reader hears after an option's name, and what a pointer sees
 * on hover — the same words, so neither audience is told less.
 */
function availabilityNote(availability: OptionAvailability, otherChoice?: string): string {
  if (availability === 'sold-out') return 'sold out';
  if (availability === 'not-sold') return otherChoice ? `not sold in ${otherChoice}` : 'not sold';
  return '';
}

/**
 * The one colour and size control, shared by the product page and quick add.
 *
 * Nothing is preselected on purpose: choosing a size for someone is how a
 * customer ends up with the wrong one. Sold-out sizes stay visible but
 * unselectable, which answers "do they have my size?" better than hiding them.
 *
 * On a product that tracks stock per variant, each option is judged against
 * the other axis's current choice: with Black chosen, size 9 is sold out only
 * if Black in 9 is, not because White in 9 ran out. Each axis is judged on
 * its own until the other is chosen, so the first pick is never blocked by a
 * guess about the second.
 */
export function VariantPicker({
  colors,
  sizes,
  variants,
  allowSoldOut = false,
  selectedColor,
  selectedSize,
  onColorChange,
  onSizeChange,
  colorError,
  sizeError,
  size = 'default',
}: VariantPickerProps) {
  const compact = size === 'compact';
  const stock = { sizes, variants };

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
            {colors.map((option) => {
              const availability = colorAvailability(stock, option.name, selectedSize);
              const unavailable = availability !== 'available';
              const disabled =
                availability === 'not-sold' || (availability === 'sold-out' && !allowSoldOut);
              const note = availabilityNote(
                availability,
                selectedSize ? `size ${selectedSize}` : undefined,
              );
              const label = note ? `${option.name}, ${note}` : option.name;

              return (
                <button
                  key={option.name}
                  type="button"
                  disabled={disabled}
                  onClick={() => onColorChange(option.name)}
                  aria-pressed={selectedColor === option.name}
                  aria-label={label}
                  title={label}
                  className={cn(
                    'focus-ring relative grid place-items-center rounded-full ring-1 transition-all',
                    compact ? 'size-8' : 'size-9',
                    selectedColor === option.name
                      ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                      : 'ring-border hover:ring-foreground/30',
                    disabled && 'cursor-not-allowed hover:ring-border',
                  )}
                >
                  <span
                    className={cn(
                      'rounded-full',
                      compact ? 'size-6' : 'size-7',
                      unavailable && 'opacity-35',
                    )}
                    style={{ backgroundColor: option.hex }}
                    aria-hidden
                  />
                  {/* A colour has no text to strike through, so the swatch is
                      struck instead. The outline keeps the line visible on a
                      swatch the same colour as it. */}
                  {unavailable && (
                    <span
                      className="absolute inset-x-0.5 top-1/2 h-0.5 -translate-y-1/2 -rotate-45 rounded-full bg-foreground/70 ring-1 ring-background"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
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
            {sizes.map((option) => {
              const availability = sizeAvailability(stock, option.label, selectedColor);
              const unavailable = availability !== 'available';
              const disabled =
                availability === 'not-sold' || (availability === 'sold-out' && !allowSoldOut);
              const selected = selectedSize === option.label;
              const note = availabilityNote(availability, selectedColor);

              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSizeChange(option.label)}
                  aria-pressed={selected}
                  aria-label={note ? `${option.label}, ${note}` : undefined}
                  title={note ? `${option.label}, ${note}` : undefined}
                  className={cn(
                    'focus-ring text-small rounded-xl border px-3 font-medium transition-all',
                    compact ? 'h-9 min-w-14' : 'h-11 min-w-16',
                    // A sold-out size the customer chose on purpose keeps its
                    // strike and dashes even while selected: the selection is
                    // a request to be told, not something they can buy.
                    selected && !unavailable && 'border-foreground bg-foreground text-background',
                    selected &&
                      unavailable &&
                      'border-dashed border-foreground bg-muted text-foreground line-through',
                    !selected && !unavailable && 'border-border hover:border-foreground/30',
                    !selected &&
                      unavailable &&
                      (disabled
                        ? 'cursor-not-allowed border-dashed text-muted-foreground/50 line-through hover:border-border'
                        : 'border-dashed text-muted-foreground line-through hover:border-foreground/30'),
                  )}
                >
                  {option.label}
                </button>
              );
            })}
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
