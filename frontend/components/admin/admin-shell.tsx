'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ExternalLink, LogOut, Menu, Shield, User, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { ADMIN_NAV, isActiveNav } from '@/components/admin/admin-nav';
import { logout } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';
import { initials, type AuthUser } from '@/types/user';
import { cn } from '@/lib/utils';

/**
 * The frame every admin page sits in.
 *
 * A fixed sidebar from `lg` up and a drawer below it — not a sidebar that
 * shrinks to a strip of icons, which is the usual compromise and leaves an
 * operator guessing at glyphs. The drawer closes on navigation, because the
 * alternative is a panel covering the page you just asked for.
 *
 * The visual language is ZyCart's — same tokens, same type scale, same dark
 * mode — but tuned for work rather than for browsing: tighter rhythm, a
 * surface-toned chrome that recedes behind dense content, and no editorial
 * flourishes competing with the data.
 */
export function AdminShell({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  /**
   * The drawer remembers which page it was opened on, so navigating closes it.
   *
   * Storing the path rather than a boolean means the close is *derived*: the
   * moment `pathname` changes, `open` is false, with no effect watching for it
   * and no frame where the drawer covers the page the operator just asked for.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;

  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* The console has its own skip link, because it has its own chrome: the
          storefront's lives with the storefront's navbar and never reaches
          here. Keyboard users land on the sidebar first and would otherwise
          tab through every section on every page. */}
      <a
        href="#main"
        className="focus-ring text-small sr-only rounded-lg bg-background px-4 py-2 font-medium shadow-lg focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[60]"
      >
        Skip to content
      </a>

      {/* Desktop sidebar. Hidden rather than unmounted below `lg` so the drawer
          owns exactly one copy of the navigation markup. */}
      <aside className="hidden border-r border-border bg-surface/60 lg:flex lg:h-dvh lg:flex-col lg:sticky lg:top-0">
        <BrandMark />
        <SidebarNav pathname={pathname} />
        <SidebarFooter user={user} />
      </aside>

      {/* Mobile drawer. */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
          />
          <aside className="relative flex h-dvh w-[17rem] max-w-[85vw] flex-col border-r border-border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b border-border pr-2">
              <BrandMark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="focus-ring grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <SidebarNav pathname={pathname} />
            <SidebarFooter user={user} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              className="focus-ring -ml-1.5 grid size-9 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-muted lg:hidden"
            >
              <Menu className="size-[18px]" aria-hidden />
            </button>

            <span className="text-small font-semibold lg:hidden">ZyCart Admin</span>

            {/* A breadcrumb-ish current section, so the header is not empty on
                desktop where the sidebar already carries the brand. */}
            <p className="text-small hidden font-semibold lg:block">{currentLabel(pathname)}</p>

            <div className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                render={<Link href="/" target="_blank" rel="noreferrer" />}
                className="hidden sm:inline-flex"
              >
                <ExternalLink className="size-3.5" data-icon="inline-start" aria-hidden />
                View store
              </Button>

              <ThemeToggle />
              <AdminUserMenu user={user} />
            </div>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <Link
      href="/admin"
      className="focus-ring flex h-14 items-center gap-2.5 px-5 lg:border-b lg:border-border"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground">
        <Shield className="size-4" aria-hidden />
      </span>
      <span className="text-small font-semibold tracking-tight">
        ZyCart <span className="text-muted-foreground">Admin</span>
      </span>
    </Link>
  );
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Admin sections" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      {ADMIN_NAV.map((group, index) => (
        <div key={group.label ?? 'root'} className={cn(index > 0 && 'mt-6')}>
          {group.label && (
            <p className="text-caption px-3 pb-2 font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </p>
          )}

          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActiveNav(item, pathname);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'focus-ring text-small flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium transition-colors',
                      active
                        ? 'bg-brand-subtle text-brand'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({ user }: { user: AuthUser }) {
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        <Avatar className="size-8 shrink-0">
          {user.avatar && <AvatarImage src={user.avatar} alt="" />}
          <AvatarFallback className="text-caption">{initials(user)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-caption truncate font-medium">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-caption truncate text-muted-foreground">{user.email}</p>
        </div>
      </div>
    </div>
  );
}

function AdminUserMenu({ user }: { user: AuthUser }) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);

    try {
      await logout();
    } finally {
      setUser(null);
      // `refresh` matters as much as the navigation: every admin page is a
      // server component, so this discards the rendered output along with the
      // session rather than leaving it cached behind the storefront.
      router.replace('/');
      router.refresh();
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Admin menu for ${user.firstName} ${user.lastName}`}
        className="focus-ring inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
      >
        <Avatar className="size-7">
          {user.avatar && <AvatarImage src={user.avatar} alt="" />}
          <AvatarFallback className="bg-brand-subtle text-[11px] font-semibold text-brand">
            {initials(user)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-small font-medium">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-caption truncate text-muted-foreground">{user.email}</p>
          <p className="text-caption mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-subtle px-2 py-0.5 font-medium text-brand">
            <Shield className="size-3" aria-hidden />
            Administrator
          </p>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link href="/" />}>
          <ExternalLink className="size-4" aria-hidden />
          View store
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account" />}>
          <User className="size-4" aria-hidden />
          Account
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={signOut} disabled={busy}>
          <LogOut className="size-4" aria-hidden />
          {busy ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The current section's name, for the header on desktop. */
function currentLabel(pathname: string): string {
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      if (isActiveNav(item, pathname)) return item.label;
    }
  }
  return 'Admin';
}
