'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Heart, LayoutGrid, LogOut, MapPin, Settings, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logout } from '@/services/auth.service';
import { useAuthStore, useAuthUser } from '@/store/auth-store';
import { fullName, initials, type AuthUser } from '@/types/user';
import { cn } from '@/lib/utils';

interface UserMenuProps {
  /** The session as the server resolved it, so the first paint is already correct. */
  serverUser: AuthUser | null;
  className?: string;
}

const LINKS = [
  { href: '/account', label: 'My account', icon: LayoutGrid },
  { href: '/account/profile', label: 'Profile', icon: User },
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
  { href: '/account/settings', label: 'Settings', icon: Settings },
];

export function UserMenu({ serverUser, className }: UserMenuProps) {
  const router = useRouter();
  const user = useAuthUser(serverUser);
  const setUser = useAuthStore((state) => state.setUser);
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);

    try {
      await logout();
    } finally {
      setUser(null);
      router.replace('/');
      router.refresh();
    }
  }

  // Signed out: a plain link, so the header keeps exactly the weight it had
  // before authentication existed.
  if (!user) {
    return (
      <Link
        href="/login"
        aria-label="Sign in"
        className={cn(
          'focus-ring relative inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted',
          className,
        )}
      >
        <User className="size-[18px]" aria-hidden />
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${fullName(user)}`}
        className={cn(
          'focus-ring inline-flex size-9 items-center justify-center rounded-full transition-colors hover:bg-muted',
          className,
        )}
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
          <p className="text-small truncate font-semibold">{fullName(user)}</p>
          <p className="text-caption truncate text-muted-foreground">{user.email}</p>
        </div>

        <DropdownMenuSeparator />

        {LINKS.map(({ href, label, icon: Icon }) => (
          <DropdownMenuItem key={href} render={<Link href={href} />}>
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            {label}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleLogout} disabled={signingOut}>
          <LogOut className="size-4 text-muted-foreground" aria-hidden />
          {signingOut ? 'Signing out...' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
