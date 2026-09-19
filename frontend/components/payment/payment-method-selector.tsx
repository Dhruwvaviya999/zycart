'use client';

import { Check, CreditCard, Lock, Wallet } from 'lucide-react';
import type { PaymentMethod } from '@/types/order';
import { cn } from '@/lib/utils';

interface Option {
  value: PaymentMethod;
  label: string;
  description: string;
  icon: typeof Wallet;
}

const OPTIONS: Option[] = [
  {
    value: 'RAZORPAY',
    label: 'Pay online',
    description: 'UPI, cards, net banking and wallets. Secured by Razorpay.',
    icon: CreditCard,
  },
  {
    value: 'COD',
    label: 'Cash on delivery',
    description: 'Pay in cash when your order arrives.',
    icon: Wallet,
  },
];

/**
 * How the order will be paid.
 *
 * Native radio inputs sharing a name, grouped by a fieldset and legend — not
 * divs with click handlers — so arrow keys move between the options, space
 * selects, and a screen reader announces the group and "1 of 2" without any
 * ARIA being added. The visible ring comes from `focus-within`, because the
 * input itself is visually hidden rather than absent.
 *
 * Selection is shown by a filled mark and a border, never by colour alone. The
 * whole card is the label, so the touch target is the card, not the dot.
 */
export function PaymentMethodSelector({
  value,
  onChange,
  onlineAvailable,
  disabled = false,
}: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  onlineAvailable: boolean;
  disabled?: boolean;
}) {
  const options = OPTIONS.filter((option) => option.value !== 'RAZORPAY' || onlineAvailable);

  return (
    <fieldset disabled={disabled} className="mt-5 disabled:opacity-60">
      <legend className="sr-only">Choose how to pay</legend>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const selected = value === option.value;
          const Icon = option.icon;

          return (
            <label
              key={option.value}
              className={cn(
                'focus-within:ring-ring/45 relative flex gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-[3px]',
                disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                selected
                  ? 'border-brand bg-brand-subtle/30'
                  : 'border-border hover:border-foreground/25',
              )}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />

              <span
                aria-hidden
                className={cn(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors',
                  selected ? 'border-brand bg-brand' : 'border-border',
                )}
              >
                {selected && <Check className="size-2.5 text-brand-foreground" />}
              </span>

              <span className="min-w-0">
                <span className="text-small flex items-center gap-2 font-semibold">
                  <Icon className="size-4" aria-hidden />
                  {option.label}
                </span>
                <span className="text-caption mt-1 block text-pretty text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {value === 'RAZORPAY' && (
        <p className="text-caption mt-3 flex items-center gap-1.5 text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          Card and UPI details are entered on Razorpay&rsquo;s secure window. ZyCart never sees
          them.
        </p>
      )}

      {!onlineAvailable && (
        <p className="text-caption mt-3 text-muted-foreground">
          Online payment is unavailable right now. Your order can still be placed for cash on
          delivery.
        </p>
      )}
    </fieldset>
  );
}
