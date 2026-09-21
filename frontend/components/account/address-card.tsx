'use client';

import { Check, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Address } from '@/types/user';
import { cn } from '@/lib/utils';

interface AddressCardProps {
  address: Address;
  busy?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}

export function AddressCard({
  address,
  busy = false,
  onEdit,
  onDelete,
  onSetDefault,
}: AddressCardProps) {
  const lines = [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    `${address.city}, ${address.state} ${address.postalCode}`,
    address.country,
  ].filter(Boolean);

  return (
    <article
      className={cn(
        'flex h-full flex-col rounded-2xl border p-5 transition-colors',
        address.isDefault ? 'border-brand/35 bg-brand-subtle/30' : 'border-border',
        busy && 'opacity-60',
      )}
      aria-busy={busy}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-small font-semibold">{address.label || 'Address'}</h3>

        {address.isDefault && (
          <span className="text-caption inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-2.5 py-1 font-semibold text-brand-foreground">
            <Check className="size-3" aria-hidden />
            Default
          </span>
        )}
      </div>

      <address className="text-small mt-3 space-y-0.5 text-muted-foreground not-italic">
        <p className="font-medium text-foreground">{address.fullName}</p>
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="pt-1">{address.phone}</p>
      </address>

      <div className="mt-5 flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onEdit} disabled={busy}>
          <Pencil className="size-3.5" data-icon="inline-start" />
          Edit
        </Button>

        {!address.isDefault && (
          <Button size="sm" variant="ghost" onClick={onSetDefault} disabled={busy}>
            Set as default
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete ${address.label || 'address'}`}
          className="ml-auto text-muted-foreground hover:text-destructive"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
          ) : (
            <Trash2 className="size-3.5" data-icon="inline-start" />
          )}
          Delete
        </Button>
      </div>
    </article>
  );
}
