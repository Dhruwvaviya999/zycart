'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Heart,
  LayoutGrid,
  MapPin,
  Package,
  RotateCcw,
  Settings,
  Star,
  User,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ITEMS: NavItem[] = [
  { href: '/account', label: 'Overview', icon: LayoutGrid },
  { href: '/account/profile', label: 'Profile', icon: User },
  { href: '/account/orders', label: 'Orders', icon: Package },
  // Beside orders rather than under them: a customer chasing a refund is not
  // looking for the order it came from, they are looking for the return.
  { href: '/account/returns', label: 'Returns', icon: RotateCcw },
  { href: '/account/reviews', label: 'Reviews', icon: Star },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
  { href: '/account/settings', label: 'Settings', icon: Settings },
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
];

/**
 * A sidebar on desktop and a horizontal rail on mobile — the same links either
 * way, laid out for the space rather than stacked from the desktop design.
 */
export function AccountNavigation({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    /**
     * `min-w-0` is load-bearing, not tidiness.
     *
     * This is a grid item in the account layout, and a grid item's default
     * `min-width: auto` refuses to shrink below its content's intrinsic width.
     * The rail below is a flex row wider than a phone, so without this the
     * track stretched to fit it and pushed the whole page sideways — the
     * `overflow-x-auto` on the list never got the chance to scroll, because the
     * list was never the thing being constrained.
     *
     * The sibling that holds the page content already carries the same class
     * for the same reason. This one was missing it.
     */
    <nav aria-label="Account" className={cn('min-w-0', className)}>
      <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-1 lg:px-0">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;

          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-ring text-small flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 font-medium transition-colors',
                  active
                    ? 'bg-brand-subtle text-brand'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
