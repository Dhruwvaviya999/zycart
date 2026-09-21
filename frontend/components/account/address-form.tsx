'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { AuthError } from '@/components/auth/auth-error';
import { FormField } from '@/components/auth/form-field';
import type { Address, AddressInput } from '@/types/user';

type Field = keyof AddressInput;
type Errors = Partial<Record<Field, string>>;

interface AddressFormProps {
  /** Absent when adding; present when editing. */
  address?: Address;
  /** True when this is the only address, which must stay the default. */
  lockDefault?: boolean;
  submitting: boolean;
  error?: string;
  fieldErrors?: Errors;
  onSubmit: (values: AddressInput) => void;
  onCancel: () => void;
}

const EMPTY: AddressInput = {
  label: 'Home',
  fullName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'India',
  isDefault: false,
};

export function AddressForm({
  address,
  lockDefault = false,
  submitting,
  error,
  fieldErrors,
  onSubmit,
  onCancel,
}: AddressFormProps) {
  const [values, setValues] = useState<AddressInput>(() =>
    address ? { ...EMPTY, ...address } : EMPTY,
  );
  const [errors, setErrors] = useState<Errors>({});

  const shown: Errors = { ...fieldErrors, ...errors };

  function set<K extends Field>(field: K, value: AddressInput[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  function validate(): Errors {
    const next: Errors = {};
    const required: [Field, string][] = [
      ['fullName', 'Enter the recipient name'],
      ['phone', 'Enter a contact number'],
      ['addressLine1', 'Enter the street address'],
      ['city', 'Enter the city'],
      ['state', 'Enter the state'],
      ['postalCode', 'Enter the PIN code'],
      ['country', 'Enter the country'],
    ];

    for (const [field, message] of required) {
      if (!String(values[field] ?? '').trim()) next[field] = message;
    }

    if (values.phone.trim() && values.phone.trim().length < 6) {
      next.phone = 'Enter a valid contact number';
    }

    return next;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    onSubmit(values);
  }

  const text = (field: Field, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField id={`address-${field}`} label={label} error={shown[field]}>
      {(bound) => (
        <Input
          {...bound}
          {...props}
          value={String(values[field] ?? '')}
          onChange={(event) => set(field, event.target.value as AddressInput[Field])}
          size="lg"
        />
      )}
    </FormField>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-1 sm:px-6">
        <AuthError message={error} />

        <div className={error ? 'pt-5' : undefined}>
          {text('label', 'Label', { placeholder: 'Home, Office...', maxLength: 40 })}
          {text('fullName', 'Full name', { autoComplete: 'name' })}
          {text('phone', 'Phone', {
            type: 'tel',
            autoComplete: 'tel',
            placeholder: '+91 98250 00000',
          })}
          {text('addressLine1', 'Address line 1', { autoComplete: 'address-line1' })}
          {text('addressLine2', 'Address line 2 (optional)', { autoComplete: 'address-line2' })}
          {text('landmark', 'Landmark (optional)')}

          <div className="grid gap-x-4 sm:grid-cols-2">
            {text('city', 'City', { autoComplete: 'address-level2' })}
            {text('state', 'State', { autoComplete: 'address-level1' })}
            {text('postalCode', 'PIN code', { autoComplete: 'postal-code', inputMode: 'numeric' })}
            {text('country', 'Country', { autoComplete: 'country-name' })}
          </div>

          <label
            htmlFor="address-default"
            className="text-small flex cursor-pointer items-center gap-2.5 py-1 select-none"
          >
            <Checkbox
              id="address-default"
              checked={lockDefault ? true : values.isDefault}
              disabled={lockDefault}
              onCheckedChange={(checked) => set('isDefault', checked === true)}
            />
            <span className={lockDefault ? 'text-muted-foreground' : undefined}>
              {lockDefault
                ? 'This is your only address, so it stays the default'
                : 'Use as my default delivery address'}
            </span>
          </label>
        </div>
      </div>

      <div className="flex gap-3 border-t border-border p-4 sm:px-6">
        <Button
          type="button"
          size="cta"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1"
        >
          Cancel
        </Button>

        <Button type="submit" size="cta" variant="brand" disabled={submitting} className="flex-1">
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              Saving...
            </>
          ) : address ? (
            'Save address'
          ) : (
            'Add address'
          )}
        </Button>
      </div>
    </form>
  );
}
