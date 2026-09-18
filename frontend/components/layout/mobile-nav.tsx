'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { ChevronRight, Heart, Menu, ShoppingBag, User, X } from 'lucide-react';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Logo } from '@/components/layout/logo';
import { categories } from '@/data/categories';
import { primaryNav } from '@/data/navigation';
import { useUiStore } from '@/store/ui-store';

/**
 * Purpose-built mobile navigation rather than a collapsed desktop bar:
 * categories get visual weight, and the account actions sit within thumb reach.
 */
export function MobileNav() {
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
          <ul className="px-3 py-3">
            {primaryNav.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  onClick={close}
                  className="focus-ring text-h4 flex items-center justify-between rounded-xl px-3 py-3 transition-colors hover:bg-muted"
                >
                  {item.label}
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          <Separator />

          <div className="px-5 pt-5 pb-3">
            <h2 className="text-label text-muted-foreground">Shop by category</h2>
          </div>

          <ul className="grid grid-cols-2 gap-2.5 px-5 pb-5">
            {categories.map((category) => (
              <li key={category.slug}>
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
                  <span className="text-small block px-2.5 py-2 font-medium">{category.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid grid-cols-3 gap-2 border-t border-border p-4">
          <QuickLink href="/wishlist" icon={Heart} label="Wishlist" onNavigate={close} />
          <QuickLink href="/cart" icon={ShoppingBag} label="Cart" onNavigate={close} />
          <QuickLink href="/account" icon={User} label="Account" onNavigate={close} />
        </div>
      </SheetContent>
    </Sheet>
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
