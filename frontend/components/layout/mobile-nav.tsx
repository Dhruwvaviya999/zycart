'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useCallback, useEffect } from 'react';
import { Check, ChevronRight, Heart, Menu, ShoppingBag, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Logo } from '@/components/layout/logo';
import { primaryNav } from '@/data/navigation';
import { useActiveNav } from '@/hooks/use-active-nav';
import type { Category } from '@/types/product';
import { fullName, initials, type AuthUser } from '@/types/user';
import { useUiStore } from '@/store/ui-store';
import { cn } from '@/lib/utils';

/**
 * Purpose-built mobile navigation rather than a collapsed desktop bar:
 * categories get visual weight, and the account actions sit within thumb reach.
 */
interface MobileNavProps {
  categories: Category[];
  user: AuthUser | null;
}

export function MobileNav({ categories, user }: MobileNavProps) {
  const open = useUiStore((state) => state.mobileNavOpen);
  const setOpen = useUiStore((state) => state.setMobileNavOpen);
  const pathname = usePathname();

  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => close(), [pathname, close]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open menu"
        className="focus-ring -ml-1.5 inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted lg:hidden"
      >
        <Menu className="size-[20px]" />
      </SheetTrigger>

      {/* The default close button would sit on top of the header row, so this
          sheet supplies its own inside the header instead. */}
      <SheetContent
        side="left"
        showCloseButton={false}
        className="flex w-[min(20rem,88vw)] flex-col gap-0 p-0 sm:max-w-sm"
      >
        <SheetTitle className="sr-only">ZyCart navigation</SheetTitle>

        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <Logo />
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <SheetClose
              aria-label="Close menu"
              className="focus-ring inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
            >
              <X className="size-[18px]" />
            </SheetClose>
          </div>
        </div>

        <nav aria-label="Mobile" className="flex-1 overflow-y-auto overscroll-contain">
          {/* Same source of truth as the desktop bar, drawn the way a list
              wants it: a brand rail and a tick rather than an underline. */}
          <Suspense fallback={<PrimaryLinks active={null} onNavigate={close} />}>
            <PrimaryLinksLive onNavigate={close} />
          </Suspense>

          {categories.length > 0 && (
            <>
              <Separator />

              <div className="px-5 pt-5 pb-3">
                <h2 className="text-label text-muted-foreground">Shop by category</h2>
              </div>

              <ul className="grid grid-cols-2 gap-2.5 px-5 pb-5">
                {categories.map((category) => (
                  <li key={category.id}>
                    <Link
                      href={`/shop?category=${category.slug}`}
                      onClick={close}
                      className="focus-ring group block overflow-hidden rounded-xl bg-surface ring-1 ring-border/70"
                    >
                      <span className="relative block aspect-16/10">
                        <Image
                          src={category.image}
                          alt=""
                          fill
                          sizes="160px"
                          className="object-cover transition-transform duration-500 ease-brand group-hover:scale-105"
                        />
                      </span>
                      <span className="text-small block px-2.5 py-2 font-medium">
                        {category.name}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>

        <div className="border-t border-border p-4">
          {user ? (
            <Link
              href="/account"
              onClick={close}
              className="focus-ring mb-3 flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5 transition-colors hover:bg-surface-strong"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-subtle text-[11px] font-semibold text-brand">
                {initials(user)}
              </span>
              <span className="min-w-0">
                <span className="text-small block truncate font-medium">{fullName(user)}</span>
                <span className="text-caption block truncate text-muted-foreground">
                  View account
                </span>
              </span>
            </Link>
          ) : (
            <Button
              size="cta"
              variant="brand"
              render={<Link href="/login" />}
              onClick={close}
              className="mb-3 w-full"
            >
              Sign in
            </Button>
          )}

          <div className={cn('grid gap-2', user ? 'grid-cols-3' : 'grid-cols-2')}>
            <QuickLink href="/wishlist" icon={Heart} label="Wishlist" onNavigate={close} />
            <QuickLink href="/cart" icon={ShoppingBag} label="Cart" onNavigate={close} />
            {/* Only useful once there is an account to open; signed out, the
                button above already leads there. */}
            {user && <QuickLink href="/account" icon={User} label="Account" onNavigate={close} />}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PrimaryLinksLive({ onNavigate }: { onNavigate: () => void }) {
  const active = useActiveNav(primaryNav);
  return <PrimaryLinks active={active} onNavigate={onNavigate} />;
}

function PrimaryLinks({
  active,
  onNavigate,
}: {
  active: string | null;
  onNavigate: () => void;
}) {
  return (
    <ul className="px-3 py-3">
      {primaryNav.map((item) => {
        const current = item.label === active;

        return (
          <li key={item.label}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'focus-ring text-h4 relative flex items-center justify-between rounded-xl py-3 pr-3 pl-3 transition-colors hover:bg-muted',
                current && 'bg-brand-subtle text-brand',
              )}
            >
              {current && (
                <span
                  aria-hidden
                  className="absolute top-3 bottom-3 left-0 w-0.5 rounded-full bg-brand"
                />
              )}
              {item.label}
              {current ? (
                <Check className="size-4 text-brand" aria-hidden />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="focus-ring text-caption flex flex-col items-center gap-1.5 rounded-xl border border-border py-3 font-medium transition-colors hover:bg-muted"
    >
      <Icon className="size-[18px]" aria-hidden />
      {label}
    </Link>
  );
}
