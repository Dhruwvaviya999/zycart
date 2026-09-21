import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import Link from 'next/link';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: Crumb[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <Breadcrumb className={cn('text-caption', className)}>
      <BreadcrumbList>
        {items.map((item, index) => {
          const last = index === items.length - 1;

          /**
           * The separator is a sibling of the item, not a child of it.
           *
           * `BreadcrumbSeparator` renders an `<li>`, and nesting it inside
           * `BreadcrumbItem` — also an `<li>` — is invalid HTML. The browser
           * corrects it by closing the outer `<li>` early, so the server markup
           * and the client tree disagree and React throws a hydration error on
           * every page with a breadcrumb.
           */
          return (
            <Fragment key={`${item.label}-${index}`}>
              <BreadcrumbItem>
                {last || !item.href ? (
                  <BreadcrumbPage className="max-w-[16rem] truncate">{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={<Link href={item.href} />}
                    className="transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>

              {!last && item.href && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
