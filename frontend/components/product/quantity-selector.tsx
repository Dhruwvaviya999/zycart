'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuantitySelectorProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max = 10,
  size = 'md',
  label = 'Quantity',
  className,
}: QuantitySelectorProps) {
  const compact = size === 'sm';
  const buttonSize = compact ? 'size-8' : 'size-10';

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-xl border border-border bg-background',
        className,
      )}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className={cn(
          'focus-ring inline-flex items-center justify-center rounded-l-xl text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40',
          buttonSize,
        )}
      >
        <Minus className={compact ? 'size-3.5' : 'size-4'} />
      </button>

      <span
        aria-live="polite"
        className={cn(
          'min-w-9 text-center font-semibold tabular-nums',
          compact ? 'text-small' : 'text-body',
        )}
      >
        {value}
      </span>

      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Increase quantity"
        className={cn(
          'focus-ring inline-flex items-center justify-center rounded-r-xl text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40',
          buttonSize,
        )}
      >
        <Plus className={compact ? 'size-3.5' : 'size-4'} />
      </button>
    </div>
  );
}
