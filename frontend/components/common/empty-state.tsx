import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
  className?: string;
}

/** Designed empty state — used anywhere a list can legitimately be empty. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface/60 px-6 py-16 text-center sm:py-20',
        className,
      )}
    >
      <div className="relative mb-6 grid size-16 place-items-center rounded-2xl bg-brand-subtle text-brand">
        <Icon className="size-7" aria-hidden />
        <span className="absolute -inset-3 -z-10 rounded-3xl bg-brand/5 blur-xl" aria-hidden />
      </div>

      <h2 className="text-h3 max-w-sm">{title}</h2>
      <p className="text-body mt-3 max-w-md text-pretty text-muted-foreground">{body}</p>

      {(action || secondaryAction) && (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {action && (
            <Button size="cta" variant="brand" render={<Link href={action.href} />}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button size="cta" variant="outline" render={<Link href={secondaryAction.href} />}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
