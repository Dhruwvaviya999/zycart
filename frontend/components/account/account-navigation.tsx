'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Heart, LayoutGrid, MapPin, Settings, User, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ITEMS: NavItem[] = [
  { href: '/account', label: 'Overview', icon: LayoutGrid },
  { href: '/account/profile', label: 'Profile', icon: User },
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
    <nav aria-label="Account" className={className}>
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
