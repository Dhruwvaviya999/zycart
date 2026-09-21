import * as React from 'react';
import { cn } from 'cn';

/**
 * The multi-line field.
 *
 * Shares the `Input` treatment rather than restating it: the same border, the
 * same focus ring, the same invalid state and the same disabled state, so a
 * form made of one text field and one comment box does not look like it was
 * assembled from two different kits. It is the single-line ladder's `lg` step
 * in everything but height, which the caller sets with `rows`.
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content w-full min-w-0 resize-y rounded-xl border border-input bg-transparent px-3.5 py-2.5 text-base transition-[color,box-shadow,border-color,background-color] outline-none placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:hover:border-ring disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
