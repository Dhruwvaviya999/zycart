'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AuthError } from '@/components/auth/auth-error';
import { FormField } from '@/components/auth/form-field';
import { PasswordField } from '@/components/auth/password-field';
import { resetPassword } from '@/services/auth.service';
import { fieldErrors, toErrorMessage } from '@/services/api';
import { useAuthStore } from '@/store/auth-store';
import { adoptSessionShoppingState } from '@/lib/session-handoff';

const MIN_PASSWORD_LENGTH = 8;

type Field = 'password' | 'confirmPassword';
type Errors = Partial<Record<Field, string>>;

/**
 * Chooses a new password from a reset link, and signs in.
 *
 * The server does the rest in one transaction: the link is spent, every other
 * session ends, and the address counts as verified — following a link sent to
 * it proves as much. This browser gets a fresh session, so the customer lands
 * in their account rather than on a sign-in form asking for the password they
 * chose a moment ago.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);

  const [values, setValues] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const found: Errors = {};
    if (values.password.length < MIN_PASSWORD_LENGTH) {
      found.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (values.confirmPassword !== values.password) {
      found.confirmPassword = 'Passwords do not match';
    }

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setFormError(undefined);

    try {
      const user = await resetPassword(token, values.password);
      setUser(user);

      // The same hand-off sign-in performs: a bag built while signed out is
      // folded into the account rather than left behind.
      const { warning } = await adoptSessionShoppingState();
      if (warning) setFormError(warning);

      router.replace('/account');
      router.refresh();
    } catch (cause) {
      setErrors({ password: fieldErrors(cause).password });
      setFormError(toErrorMessage(cause));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <AuthError message={formError} />

      {formError && formError.includes('expired') && (
        <p className="text-caption mt-2">
          <Link
            href="/forgot-password"
            className="focus-ring rounded-sm font-medium text-brand hover:underline"
          >
            Request a new link
          </Link>
        </p>
      )}

      <div className={formError ? 'pt-5' : undefined}>
        <FormField
          id="password"
          label="New password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
          error={errors.password}
        >
          {(field) => (
            <PasswordField
              {...field}
              value={values.password}
              autoComplete="new-password"
              autoFocus
              onChange={(event) => set('password', event.target.value)}
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

        <Button
          type="submit"
          size="cta-lg"
          variant="brand"
          disabled={submitting}
          className="mt-4 w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              Saving...
            </>
          ) : (
            'Set new password'
          )}
        </Button>

        <p className="text-caption mt-3 text-center text-muted-foreground">
          This signs out every other device that was using your account.
        </p>
      </div>
    </form>
  );
}
