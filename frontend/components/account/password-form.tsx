'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthError } from '@/components/auth/auth-error';
import { FormField } from '@/components/auth/form-field';
import { PasswordField } from '@/components/auth/password-field';
import { fieldErrors, toErrorMessage } from '@/services/api';
import { changePassword } from '@/services/user.service';

type Field = 'currentPassword' | 'newPassword' | 'confirmPassword';
type Errors = Partial<Record<Field, string>>;

const MIN_PASSWORD_LENGTH = 8;

export function PasswordForm() {
  const [values, setValues] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setStatus('idle');
  }

  function validate(): Errors {
    const next: Errors = {};

    if (!values.currentPassword) next.currentPassword = 'Enter your current password';

    if (values.newPassword.length < MIN_PASSWORD_LENGTH) {
      next.newPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    } else if (values.newPassword === values.currentPassword) {
      next.newPassword = 'Choose a password different from your current one';
    }

    if (values.confirmPassword !== values.newPassword) {
      next.confirmPassword = 'Passwords do not match';
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
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });

      setValues({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setStatus('saved');
    } catch (error) {
      setErrors(fieldErrors(error));
      setFormError(toErrorMessage(error));
      setStatus('idle');
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-md">
      <AuthError message={formError} />

      <div className={formError ? 'pt-5' : undefined}>
        <FormField id="currentPassword" label="Current password" error={errors.currentPassword}>
          {(field) => (
            <PasswordField
              {...field}
              value={values.currentPassword}
              autoComplete="current-password"
              onChange={(event) => set('currentPassword', event.target.value)}
            />
          )}
        </FormField>

        <FormField
          id="newPassword"
          label="New password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
          error={errors.newPassword}
        >
          {(field) => (
            <PasswordField
              {...field}
              value={values.newPassword}
              autoComplete="new-password"
              onChange={(event) => set('newPassword', event.target.value)}
            />
          )}
        </FormField>

        <FormField id="confirmPassword" label="Confirm new password" error={errors.confirmPassword}>
          {(field) => (
            <PasswordField
              {...field}
              value={values.confirmPassword}
              autoComplete="new-password"
              onChange={(event) => set('confirmPassword', event.target.value)}
            />
          )}
        </FormField>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" size="cta" variant="brand" disabled={status === 'saving'}>
            {status === 'saving' ? (
              <>
                <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                Updating...
              </>
            ) : (
              'Update password'
            )}
          </Button>

          {status === 'saved' && (
            <p
              role="status"
              className="text-small inline-flex items-center gap-1.5 font-medium text-success"
            >
              <Check className="size-4" aria-hidden />
              Password updated
            </p>
          )}
        </div>

        <p className="text-caption mt-4 text-muted-foreground">
          Changing your password signs out every other device. You stay signed in here.
        </p>
      </div>
    </form>
  );
}
