import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Either navigates somewhere or runs in place — never both. */
export type EmptyStateAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
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
          {action && <ActionButton action={action} variant="brand" />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  action,
  variant,
}: {
  action: EmptyStateAction;
  variant: 'brand' | 'outline';
}) {
  if (action.href) {
    return (
      <Button size="cta" variant={variant} render={<Link href={action.href} />}>
        {action.label}
      </Button>
    );
  }

  return (
    <Button size="cta" variant={variant} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}
