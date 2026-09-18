'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logout } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';
import { clearSessionShoppingState } from '@/lib/session-handoff';

/**
 * Signing out clears local state and re-runs the server components, so the
 * navbar and every protected page see the cleared cookie immediately.
 *
 * The API call is allowed to fail quietly: the session is being discarded
 * either way, and leaving someone stuck on a signed-in screen would be worse.
 */
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) return;
    setPending(true);

    try {
      await logout();
    } finally {
      setUser(null);
      // The account's cart and wishlist must not be visible to whoever uses
      // this browser next. They stay safe in MongoDB.
      clearSessionShoppingState();
      router.replace('/');
      router.refresh();
    }
  }

  return (
    <Button
      variant="outline"
      size="cta"
      onClick={handleLogout}
      disabled={pending}
      className={className}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
      ) : (
        <LogOut className="size-4" data-icon="inline-start" />
      )}
      Sign out
    </Button>
  );
}
