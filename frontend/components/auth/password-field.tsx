'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PasswordFieldProps extends React.ComponentProps<typeof Input> {
  className?: string;
}

/**
 * A password input with a reveal toggle.
 *
 * The toggle is a real button inside the field: it stays in the tab order, says
 * what it will do rather than what state it is in, and reports that state with
 * `aria-pressed` so it is not communicated by the icon alone.
 */
export function PasswordField({ className, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        size="lg"
        className={cn('pr-11', className)}
      />

      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="focus-ring absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Icon className="size-4" aria-hidden />
      </button>
    </div>
  );
}
