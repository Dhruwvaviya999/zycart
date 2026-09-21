'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MapPin, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AddressCard } from '@/components/account/address-card';
import { AddressForm } from '@/components/account/address-form';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { fieldErrors, toErrorMessage } from '@/services/api';
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from '@/services/user.service';
import type { Address, AddressInput } from '@/types/user';

type Editing = { mode: 'create' } | { mode: 'edit'; address: Address } | null;

export function AddressManager({ initialAddresses }: { initialAddresses: Address[] }) {
  const router = useRouter();

  const [addresses, setAddresses] = useState(initialAddresses);
  const [editing, setEditing] = useState<Editing>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [formFields, setFormFields] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string>();
  const [listError, setListError] = useState<string>();

  /**
   * Every write answers with the whole list, so the server's default-address
   * rules are what the UI shows — the client never recomputes them.
   */
  function applyResult(next: Address[]) {
    setAddresses(next);
    setEditing(null);
    setListError(undefined);
    // Keeps the account overview's address count honest.
    router.refresh();
  }

  async function runCardAction(addressId: string, action: () => Promise<Address[]>) {
    setBusyId(addressId);
    setListError(undefined);

    try {
      applyResult(await action());
    } catch (error) {
      setListError(toErrorMessage(error));
    } finally {
      setBusyId(undefined);
    }
  }

  async function handleSubmit(values: AddressInput) {
    setSubmitting(true);
    setFormError(undefined);
    setFormFields({});

    try {
      const next =
        editing?.mode === 'edit'
          ? await updateAddress(editing.address.id, values)
          : await createAddress(values);

      applyResult(next);
    } catch (error) {
      setFormFields(fieldErrors(error));
      setFormError(toErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  function openCreate() {
    setFormError(undefined);
    setFormFields({});
    setEditing({ mode: 'create' });
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-start">
        <Button size="cta" variant="brand" onClick={openCreate}>
          <Plus className="size-4" data-icon="inline-start" />
          Add new address
        </Button>
      </div>

      {listError && (
        <ErrorState
          title="That did not go through."
          body={listError}
          secondaryAction={{ label: 'Back to account', href: '/account' }}
        />
      )}

      {addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No saved addresses yet."
          body="Add one now and it will be ready and waiting when checkout opens."
          action={{ label: 'Add your first address', onClick: openCreate }}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <li key={address.id}>
              <AddressCard
                address={address}
                busy={busyId === address.id}
                onEdit={() => {
                  setFormError(undefined);
                  setFormFields({});
                  setEditing({ mode: 'edit', address });
                }}
                onDelete={() => void runCardAction(address.id, () => deleteAddress(address.id))}
                onSetDefault={() =>
                  void runCardAction(address.id, () => setDefaultAddress(address.id))
                }
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {/* Full-height sheet on a phone, centred card from `sm` up — the form is
            long enough that a small centred box would be awkward on mobile. */}
        <DialogContent
          showCloseButton={false}
          className="top-auto bottom-0 left-1/2 flex max-h-[92vh] w-full max-w-full -translate-y-0 flex-col gap-0 rounded-t-3xl rounded-b-none p-0 sm:top-1/2 sm:bottom-auto sm:max-h-[86vh] sm:max-w-lg sm:-translate-y-1/2 sm:rounded-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <DialogTitle className="text-h4">
                {editing?.mode === 'edit' ? 'Edit address' : 'Add a new address'}
              </DialogTitle>
              <DialogDescription className="text-caption mt-0.5 text-muted-foreground">
                Used for delivery once checkout opens.
              </DialogDescription>
            </div>

            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Close"
              className="focus-ring -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {editing && (
            <AddressForm
              // Remounts between add and edit so the fields never carry over.
              key={editing.mode === 'edit' ? editing.address.id : 'create'}
              address={editing.mode === 'edit' ? editing.address : undefined}
              lockDefault={
                editing.mode === 'edit' && editing.address.isDefault && addresses.length === 1
              }
              submitting={submitting}
              error={formError}
              fieldErrors={formFields}
              onSubmit={handleSubmit}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
