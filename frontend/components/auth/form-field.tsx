import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  id: string;
  label: string;
  /** Shown under the field until an error replaces it. */
  hint?: string;
  error?: string;
  /** Renders the input; receives the wiring the label and message need. */
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => React.ReactNode;
  className?: string;
}

/**
 * Label, control and message as one unit.
 *
 * The message line is always rendered, so an error appearing does not push the
 * rest of the form down — the hint simply gives way to it. Errors are announced
 * and carry an icon-free but explicit wording, never colour alone.
 */
export function FormField({ id, label, hint, error, children, className }: FormFieldProps) {
  const messageId = `${id}-message`;
  const describedBy = error || hint ? messageId : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-small font-medium">
        {label}
      </Label>

      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}

      <p
        id={messageId}
        role={error ? 'alert' : undefined}
        className={cn(
          'text-caption min-h-4 leading-4',
          error ? 'font-medium text-destructive' : 'text-muted-foreground',
        )}
      >
        {error ?? hint ?? ''}
      </p>
    </div>
  );
}
