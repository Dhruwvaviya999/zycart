'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Heart, ShoppingBag, User } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Logo } from '@/components/layout/logo';
import { MobileNav } from '@/components/layout/mobile-nav';
import { SearchTrigger } from '@/components/search/search-trigger';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { primaryNav } from '@/data/navigation';
import type { Category } from '@/types/product';
import { useCartStore } from '@/store/cart-store';
import { useWishlistStore } from '@/store/wishlist-store';
import { cn } from '@/lib/utils';

export function Navbar({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  const cartHydrated = useCartStore((state) => state.hydrated);
  const cartCount = useCartStore((state) =>
    state.lines.reduce((sum, line) => sum + line.quantity, 0),
  );
  const wishlistHydrated = useWishlistStore((state) => state.hydrated);
  const wishlistCount = useWishlistStore((state) => state.ids.length);

  // Border and blur appear only once the page has moved, keeping the top of
  // the page clean without making the bar disappear on scroll.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300 ease-brand',
        scrolled
          ? 'border-b border-border bg-background/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-background',
      )}
    >
      <Container className="flex h-16 items-center gap-3 sm:h-[68px]">
        <MobileNav categories={categories} />
        <Logo className="mr-1 shrink-0" />

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {primaryNav.map((item) => {
              // Only links that address a page outright claim the indicator —
              // the query-scoped views (Deals, New Arrivals) are filtered
              // versions of /shop, not separate destinations.
              const plain = !/[?#]/.test(item.href);
              const active = plain && pathname === item.href;

              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={cn(
                      'focus-ring text-nav relative inline-flex h-9 items-center rounded-lg px-3 transition-colors',
                      active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {item.label}
                    {active && (
                      <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <SearchTrigger className="mx-auto hidden max-w-sm md:flex" />

        <div className="ml-auto flex items-center gap-0.5 md:ml-0">
          <SearchTrigger variant="icon" className="md:hidden" />

          <ThemeToggle className="hidden sm:inline-flex" />

          <IconLink
            href="/wishlist"
            label="Wishlist"
            count={wishlistHydrated ? wishlistCount : 0}
            icon={Heart}
            className="hidden sm:inline-flex"
          />

          <IconLink
            href="/cart"
            label="Cart"
            count={cartHydrated ? cartCount : 0}
            icon={ShoppingBag}
          />

          <IconLink href="/account" label="Account" icon={User} className="hidden sm:inline-flex" />
        </div>
      </Container>
    </header>
  );
}

interface IconLinkProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  className?: string;
}

function IconLink({ href, label, icon: Icon, count = 0, className }: IconLinkProps) {
  return (
    <Link
      href={href}
      aria-label={count > 0 ? `${label}, ${count} items` : label}
      className={cn(
        'focus-ring relative inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted',
        className,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
