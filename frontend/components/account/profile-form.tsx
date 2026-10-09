'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthError } from '@/components/auth/auth-error';
import { FormField } from '@/components/auth/form-field';
import { fieldErrors, toErrorMessage } from '@/services/api';
import { updateProfile } from '@/services/user.service';
import { useAuthStore } from '@/store/auth-store';
import type { AuthUser } from '@/types/user';

type Field = 'firstName' | 'lastName' | 'phone' | 'avatar';
type Errors = Partial<Record<Field, string>>;

export function ProfileForm({ user }: { user: AuthUser }) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);

  const [values, setValues] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    avatar: user.avatar,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const dirty =
    values.firstName !== user.firstName ||
    values.lastName !== user.lastName ||
    values.phone !== user.phone ||
    values.avatar !== user.avatar;

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setStatus('idle');
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!values.firstName.trim()) next.firstName = 'Enter your first name';
    if (!values.lastName.trim()) next.lastName = 'Enter your last name';

    if (values.avatar.trim() && !/^https?:\/\//i.test(values.avatar.trim())) {
      next.avatar = 'Enter a full image URL, starting with https://';
    }

    return next;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (status === 'saving') return;

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setStatus('saving');
    setFormError(undefined);

    try {
      const updated = await updateProfile({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone.trim(),
        avatar: values.avatar.trim(),
      });

      setUser(updated);
      setStatus('saved');
      // Re-renders the account header and navbar with the new name.
      router.refresh();
    } catch (error) {
      setErrors(fieldErrors(error));
      setFormError(toErrorMessage(error));
      setStatus('idle');
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-xl">
      <AuthError message={formError} />

      <div className={formError ? 'pt-5' : undefined}>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField id="firstName" label="First name" error={errors.firstName}>
            {(field) => (
              <Input
                {...field}
                value={values.firstName}
                autoComplete="given-name"
                onChange={(event) => set('firstName', event.target.value)}
                size="lg"
              />
            )}
          </FormField>

          <FormField id="lastName" label="Last name" error={errors.lastName}>
            {(field) => (
              <Input
                {...field}
                value={values.lastName}
                autoComplete="family-name"
                onChange={(event) => set('lastName', event.target.value)}
                size="lg"
              />
            )}
          </FormField>
        </div>

        <FormField
          id="email"
          label="Email"
          hint="Change it under Settings → Sign-in & security."
        >
          {(field) => (
            <Input
              {...field}
              type="email"
              value={user.email}
              readOnly
              disabled
              size="lg"
              className="cursor-not-allowed"
            />
          )}
        </FormField>

        <FormField id="phone" label="Phone" hint="Used for delivery updates." error={errors.phone}>
          {(field) => (
            <Input
              {...field}
              type="tel"
              value={values.phone}
              autoComplete="tel"
              placeholder="+91 98250 00000"
              onChange={(event) => set('phone', event.target.value)}
              size="lg"
            />
          )}
        </FormField>

        <FormField
          id="avatar"
          label="Avatar URL"
          hint="Optional. Paste a link to a square image."
          error={errors.avatar}
        >
          {(field) => (
            <Input
              {...field}
              type="url"
              value={values.avatar}
              placeholder="https://..."
              onChange={(event) => set('avatar', event.target.value)}
              size="lg"
            />
          )}
        </FormField>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" size="cta" variant="brand" disabled={status === 'saving' || !dirty}>
            {status === 'saving' ? (
              <>
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                Saving...
              </>
            ) : (
              'Save changes'
            )}
          </Button>

          {status === 'saved' && !dirty && (
            <p
              role="status"
              className="text-small inline-flex items-center gap-1.5 font-medium text-success"
            >
              <Check className="size-4" aria-hidden />
              Profile updated
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
