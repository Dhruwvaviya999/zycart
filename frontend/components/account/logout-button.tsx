'use client';

import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSignOut } from '@/hooks/use-sign-out';

/** Signs out of this device; see `useSignOut` for what is cleared and when. */
export function LogoutButton({ className }: { className?: string }) {
  const { signOut, pending } = useSignOut();

  return (
    <Button
      variant="outline"
      size="cta"
      onClick={() => void signOut()}
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
