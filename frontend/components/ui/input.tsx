import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from 'cn';

/**
 * One size ladder for every text field in the product.
 *
 * Eleven call sites used to carry `className="h-11 rounded-xl"` to turn the
 * dense default into the storefront's field — the same override, copied, with
 * nothing to stop the twelfth from being 10px or 12px instead. That size is
 * `lg`, and it is the one the account, auth, checkout and returns forms ask
 * for by name. `default` stays the denser field the admin console runs at, and
 * the `Select` trigger matches this ladder step for step so a select and an
 * input placed side by side line up.
 */
const inputVariants = cva(
  'w-full min-w-0 border border-input bg-transparent text-base transition-[color,box-shadow,border-color,background-color] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:hover:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
  {
    variants: {
      size: {
        sm: 'h-8 rounded-[min(var(--radius-md),10px)] px-2.5 py-1 text-[0.8125rem] md:text-[0.8125rem]',
        default: 'h-9 rounded-lg px-3 py-1',
        lg: 'h-11 rounded-xl px-3.5 py-2',
        /* Pairs with the `cta-lg` button, for the marketing bands where the
           field and its call to action sit side by side. The `md:` repeat is
           needed to beat the base `md:text-sm`, which the size ladder is
           otherwise powerless against: a media query wins over an unprefixed
           utility whatever order the classes are written in. */
        xl: 'h-12 rounded-xl px-4 py-2 text-base md:text-base',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

function Input({
  className,
  type,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<'input'>, 'size'> & VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  );
}

export { Input, inputVariants };
