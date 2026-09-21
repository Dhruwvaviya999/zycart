'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { Heart, ShoppingBag } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Logo } from '@/components/layout/logo';
import { MobileNav } from '@/components/layout/mobile-nav';
import { SearchTrigger } from '@/components/search/search-trigger';
import { UserMenu } from '@/components/layout/user-menu';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { primaryNav } from '@/data/navigation';
import { useActiveNav } from '@/hooks/use-active-nav';
import type { Category } from '@/types/product';
import type { AuthUser } from '@/types/user';
import { selectCartCount, useCartStore } from '@/store/cart-store';
import { useWishlistStore } from '@/store/wishlist-store';
import { cn } from '@/lib/utils';

interface NavbarProps {
  categories: Category[];
  user: AuthUser | null;
}

export function Navbar({ categories, user }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);

  // Totals come from the resolved cart, so the badge counts units and matches
  // the cart page exactly — in both guest and signed-in modes.
  const cartCount = useCartStore(selectCartCount);
  const cartReady = useCartStore((state) => state.status === 'ready');
  const wishlistCount = useWishlistStore((state) => state.wishlist.itemCount);
  const wishlistReady = useWishlistStore((state) => state.status === 'ready');

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
        <MobileNav categories={categories} user={user} />
        <Logo className="mr-1 shrink-0" />

        {/*
          The indicator reads the route through `useActiveNav`, which needs
          `useSearchParams` — so the list sits behind a boundary of its own.
          The fallback is the same markup with nothing highlighted rather than
          a blank space, so the bar never reflows while it resolves.
        */}
        <Suspense fallback={<PrimaryNav active={null} />}>
          <PrimaryNavLive />
        </Suspense>

        {/*
          `min-w-0` is load-bearing, not tidying.

          A flex item defaults to `min-width: auto`, which means it refuses to
          shrink below its content — so at exactly 1024px, where the primary nav
          first appears alongside the logo, the search and the icon group, the
          four of them demanded 982px inside a 945px content box and the row
          spilled past the container. `min-w-0` lets the search give up the
          difference, which is right because it is the only element here with no
          natural size: the label already truncates, and a search box is
          supposed to take whatever room is left over.
        */}
        <SearchTrigger className="mx-auto hidden min-w-0 max-w-sm md:flex" />

        <div className="ml-auto flex items-center gap-0.5 md:ml-0">
          <SearchTrigger variant="icon" className="md:hidden" />

          <ThemeToggle className="hidden sm:inline-flex" />

          <IconLink
            href="/wishlist"
            label="Wishlist"
            count={wishlistReady ? wishlistCount : 0}
            icon={Heart}
            className="hidden sm:inline-flex"
          />

          <IconLink
            href="/cart"
            label="Cart"
            count={cartReady ? cartCount : 0}
            icon={ShoppingBag}
          />

          <UserMenu serverUser={user} className="hidden sm:inline-flex" />
        </div>
      </Container>
    </header>
  );
}

/** Split out so only the indicator, not the whole header, waits on the URL. */
function PrimaryNavLive() {
  const active = useActiveNav(primaryNav);
  return <PrimaryNav active={active} />;
}

function PrimaryNav({ active }: { active: string | null }) {
  return (
    <nav aria-label="Primary" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {primaryNav.map((item) => {
          const current = item.label === active;

          return (
            <li key={item.label}>
              <Link
                href={item.href}
                /* The route decides, so the route is what gets announced. */
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'focus-ring text-nav relative inline-flex h-9 items-center rounded-lg px-3 transition-colors',
                  current ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-3 -bottom-px h-0.5 origin-center rounded-full bg-brand transition-transform duration-300 ease-brand',
                    current ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
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
