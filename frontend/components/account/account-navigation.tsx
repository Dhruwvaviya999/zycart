'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
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
import { activePathItem } from '@/lib/nav-active';
import type { NavMatch } from '@/data/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: NavMatch;
}

/**
 * `match` rather than a bare href, for the same reason the primary nav has
 * one: this rail used to test `pathname === href`, so opening an order —
 * `/account/orders/ZY-1024` — or a return unlit every item in the sidebar, and
 * a customer reading their own order was shown an account section with nothing
 * selected. The sections that have detail pages claim them by prefix; Overview
 * matches `/account` exactly, or it would own every page beneath it.
 */
const ITEMS: NavItem[] = [
  { href: '/account', label: 'Overview', icon: LayoutGrid, match: { paths: ['/account'] } },
  {
    href: '/account/profile',
    label: 'Profile',
    icon: User,
    match: { paths: ['/account/profile'] },
  },
  {
    href: '/account/orders',
    label: 'Orders',
    icon: Package,
    match: { paths: ['/account/orders'], prefixes: ['/account/orders'] },
  },
  // Beside orders rather than under them: a customer chasing a refund is not
  // looking for the order it came from, they are looking for the return.
  {
    href: '/account/returns',
    label: 'Returns',
    icon: RotateCcw,
    match: { paths: ['/account/returns'], prefixes: ['/account/returns'] },
  },
  {
    href: '/account/reviews',
    label: 'Reviews',
    icon: Star,
    match: { paths: ['/account/reviews'], prefixes: ['/account/reviews'] },
  },
  // Inside the account rather than beside the wishlist: an alert is answered
  // by email to this account, and its page is where one is taken back.
  {
    href: '/account/alerts',
    label: 'Alerts',
    icon: Bell,
    match: { paths: ['/account/alerts'] },
  },
  {
    href: '/account/addresses',
    label: 'Addresses',
    icon: MapPin,
    match: { paths: ['/account/addresses'] },
  },
  {
    href: '/account/settings',
    label: 'Settings',
    icon: Settings,
    match: { paths: ['/account/settings'] },
  },
  { href: '/wishlist', label: 'Wishlist', icon: Heart, match: { paths: ['/wishlist'] } },
];

/**
 * A sidebar on desktop and a horizontal rail on mobile — the same links either
 * way, laid out for the space rather than stacked from the desktop design.
 */
export function AccountNavigation({ className }: { className?: string }) {
  const pathname = usePathname();
  const current = activePathItem(ITEMS, pathname);

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
          const active = current?.href === href;

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
