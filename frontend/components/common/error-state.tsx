'use client';

import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  body?: string;
  onRetry?: () => void;
  /** Where to go when retrying is not what the reader wants. */
  secondaryAction?: { label: string; href: string };
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong.',
  body = 'We could not load this page. It is almost certainly us, not you — try again in a moment.',
  onRetry,
  secondaryAction = { label: 'Back to home', href: '/' },
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-3xl border border-destructive/25 bg-destructive/5 px-6 py-16 text-center sm:py-20',
        className,
      )}
    >
      <div className="mb-6 grid size-16 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-7" aria-hidden />
      </div>

      <h2 className="text-h3 max-w-sm">{title}</h2>
      <p className="text-body mt-3 max-w-md text-pretty text-muted-foreground">{body}</p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {onRetry && (
          <Button size="cta" variant="brand" onClick={onRetry}>
            <RotateCcw className="size-4" data-icon="inline-start" />
            Try again
          </Button>
        )}
        <Button size="cta" variant="outline" render={<Link href={secondaryAction.href} />}>
          {secondaryAction.label}
        </Button>
      </div>
    </div>
  );
}
