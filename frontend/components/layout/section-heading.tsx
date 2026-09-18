import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  align?: 'start' | 'center';
  as?: 'h2' | 'h3';
  className?: string;
}

/** One heading treatment for every merchandised band on the site. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = 'start',
  as: Heading = 'h2',
  className,
}: SectionHeadingProps) {
  const centered = align === 'center';

  return (
    <div
      className={cn(
        'flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between',
        centered && 'sm:flex-col sm:items-center sm:text-center',
        className,
      )}
    >
      <div className={cn('max-w-2xl space-y-2.5', centered && 'mx-auto')}>
        {eyebrow && <p className="text-label text-brand">{eyebrow}</p>}
        <Heading className="text-h2">{title}</Heading>
        {description && <p className="text-body text-muted-foreground text-pretty">{description}</p>}
      </div>

      {action && (
        <Link
          href={action.href}
          className="focus-ring text-nav group inline-flex shrink-0 items-center gap-1.5 rounded-md text-foreground transition-colors hover:text-brand"
        >
          {action.label}
          <ArrowRight className="size-4 transition-transform duration-300 ease-(--ease-brand) group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
