'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Heart, Search, ShoppingBag, User } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Logo } from '@/components/layout/logo';
import { MobileNav } from '@/components/layout/mobile-nav';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { primaryNav } from '@/data/navigation';
import { useCartStore } from '@/store/cart-store';
import { useUiStore } from '@/store/ui-store';
import { useWishlistStore } from '@/store/wishlist-store';
import { cn } from '@/lib/utils';

export function Navbar() {
  const pathname = usePathname();
  const setSearchOpen = useUiStore((state) => state.setSearchOpen);
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
        <MobileNav />
        <Logo className="mr-1 shrink-0" />

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {primaryNav.map((item) => {
              const active = pathname === item.href.split('?')[0] && item.href === '/shop';

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

        {/* Desktop search affordance: looks like a field, opens the overlay. */}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="focus-ring text-small mx-auto hidden h-10 w-full max-w-sm items-center gap-2.5 rounded-full border border-border bg-surface px-4 text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-surface-strong md:flex"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Search products, brands and categories...</span>
          <kbd className="text-caption ml-auto hidden shrink-0 rounded border border-border bg-background px-1.5 py-0.5 font-sans font-medium lg:inline-block">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-0.5 md:ml-0">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="focus-ring inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted md:hidden"
          >
            <Search className="size-[18px]" />
          </button>

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

          <IconLink
            href="/account"
            label="Account"
            icon={User}
            className="hidden sm:inline-flex"
          />
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
