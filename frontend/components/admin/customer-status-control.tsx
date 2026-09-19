'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UserCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { setCustomerActive } from '@/services/admin.service';

/**
 * Activating and deactivating a customer.
 *
 * Deactivating is immediate and total: Phase 4's auth middleware re-reads the
 * account on every authenticated request, so an existing signed-in session
 * stops working on its very next call rather than lingering until the token
 * expires. The confirmation says so, because "are they locked out now or in
 * seven days?" is the question an operator actually has.
 *
 * There is no role control here, and none anywhere in the console. Granting
 * administrator access is a deliberate act performed from the command line.
 */
export function CustomerStatusControl({
  customerId,
  name,
  isActive,
}: {
  customerId: string;
  name: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        size="cta"
        variant={isActive ? 'outline' : 'brand'}
        onClick={() => setConfirming(true)}
        className="w-full"
      >
        {isActive ? (
          <>
            <UserX className="size-4" data-icon="inline-start" aria-hidden />
            Deactivate account
          </>
        ) : (
          <>
            <UserCheck className="size-4" data-icon="inline-start" aria-hidden />
            Reactivate account
          </>
        )}
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={isActive ? 'Deactivate this account?' : 'Reactivate this account?'}
        destructive={isActive}
        description={
          isActive ? (
            <>
              <strong>{name}</strong> will be signed out immediately and will not be able to sign
              in again, place orders or write reviews. Their orders, reviews and history are all
              kept, and you can reactivate the account at any time.
            </>
          ) : (
            <>
              <strong>{name}</strong> will be able to sign in and shop again. Everything on the
              account is exactly as they left it.
            </>
          )
        }
        confirmLabel={isActive ? 'Deactivate' : 'Reactivate'}
        busyLabel="Saving…"
        onConfirm={async () => {
          await setCustomerActive(customerId, !isActive);
          router.refresh();
        }}
      />
    </>
  );
}
