'use client';

import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSignOut } from '@/hooks/use-sign-out';

/**
 * Signed in to Clerk, but ZyCart will not open the account.
 *
 * Almost always a deactivated account; occasionally the API being down. The
 * sign-in form cannot be shown — Clerk would send an already signed-in visitor
 * straight back to where they came from, and that page would send them here
 * again — so this says what happened and offers the one useful action.
 */
export function AccountUnavailable() {
  const { signOut, pending } = useSignOut();

  return (
    <div className="space-y-6">
      <p className="text-small text-pretty text-muted-foreground">
        If your account was closed, contact the store to reopen it. Otherwise, try again in a few
        minutes, or sign out and in with another account.
      </p>

      <Button
        size="cta-lg"
        variant="brand"
        className="w-full"
        disabled={pending}
        onClick={() => void signOut()}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
        ) : (
          <LogOut className="size-4" data-icon="inline-start" />
        )}
        Sign out
      </Button>
    </div>
  );
}
