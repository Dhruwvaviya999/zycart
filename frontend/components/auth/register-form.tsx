'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthError } from '@/components/auth/auth-error';
import { FormField } from '@/components/auth/form-field';
import { PasswordField } from '@/components/auth/password-field';
import { register } from '@/services/auth.service';
import { fieldErrors, toErrorMessage } from '@/services/api';
import { useAuthStore } from '@/store/auth-store';
import { adoptSessionShoppingState } from '@/lib/session-handoff';

interface RegisterFormProps {
  redirectTo: string;
}

type Field = 'firstName' | 'lastName' | 'email' | 'password' | 'confirmPassword';
type Errors = Partial<Record<Field, string>>;

const MIN_PASSWORD_LENGTH = 8;

export function RegisterForm({ redirectTo }: RegisterFormProps) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);

  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function set(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    // Clearing as they type keeps a corrected field from still looking wrong.
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  /** Mirrors the server's rules so the obvious mistakes never need a round trip. */
  function validate(): Errors {
    const next: Errors = {};

    if (!values.firstName.trim()) next.firstName = 'Enter your first name';
    if (!values.lastName.trim()) next.lastName = 'Enter your last name';

    if (!values.email.trim()) next.email = 'Enter your email address';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = 'Enter a valid email address';
    }

    if (values.password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    if (values.confirmPassword !== values.password) {
      next.confirmPassword = 'Passwords do not match';
    }

    return next;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setFormError(undefined);

    try {
      const user = await register({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        password: values.password,
      });

      setUser(user);

      const { warning } = await adoptSessionShoppingState();
      if (warning) setFormError(warning);

      router.replace(redirectTo);
      router.refresh();
    } catch (error) {
      setErrors(fieldErrors(error));
      setFormError(toErrorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-1">
      <AuthError message={formError} />

      <div className={formError ? 'pt-5' : undefined}>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <FormField id="firstName" label="First name" error={errors.firstName}>
            {(field) => (
              <Input
                {...field}
                value={values.firstName}
                autoComplete="given-name"
                autoFocus
                onChange={(event) => set('firstName', event.target.value)}
                className="h-11 rounded-xl"
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
                className="h-11 rounded-xl"
              />
            )}
          </FormField>
        </div>

        <FormField id="email" label="Email" error={errors.email}>
          {(field) => (
            <Input
              {...field}
              type="email"
              value={values.email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(event) => set('email', event.target.value)}
              className="h-11 rounded-xl"
            />
          )}
        </FormField>

        <FormField
          id="password"
          label="Password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
          error={errors.password}
        >
          {(field) => (
            <PasswordField
              {...field}
              value={values.password}
              autoComplete="new-password"
              onChange={(event) => set('password', event.target.value)}
            />
          )}
        </FormField>

        <FormField id="confirmPassword" label="Confirm password" error={errors.confirmPassword}>
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
          className="mt-5 w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              Creating account...
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </div>
    </form>
  );
}

export function RegisterFooter({ redirectTo }: RegisterFormProps) {
  const query = redirectTo === '/account' ? '' : `?redirect=${encodeURIComponent(redirectTo)}`;

  return (
    <>
      Already have an account?{' '}
      <Link
        href={`/login${query}`}
        className="focus-ring rounded-sm font-medium text-brand hover:underline"
      >
        Sign in
      </Link>
    </>
  );
}
