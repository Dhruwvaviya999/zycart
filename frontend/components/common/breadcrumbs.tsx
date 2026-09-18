import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import Link from 'next/link';
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

          return (
            <BreadcrumbItem key={`${item.label}-${index}`}>
              {last || !item.href ? (
                <BreadcrumbPage className="max-w-[16rem] truncate">{item.label}</BreadcrumbPage>
              ) : (
                <>
                  <BreadcrumbLink
                    render={<Link href={item.href} />}
                    className="transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </BreadcrumbLink>
                  <BreadcrumbSeparator />
                </>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
