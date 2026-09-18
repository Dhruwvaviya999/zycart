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
import { login } from '@/services/auth.service';
import { fieldErrors, toErrorMessage } from '@/services/api';
import { useAuthStore } from '@/store/auth-store';

interface LoginFormProps {
  /** Where to land after signing in, carried from the protected route. */
  redirectTo: string;
}

interface Errors {
  email?: string;
  password?: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function validate(): Errors {
    const next: Errors = {};
    if (!email.trim()) next.email = 'Enter your email address';
    if (!password) next.password = 'Enter your password';
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
      const user = await login({ email: email.trim(), password });
      setUser(user);

      // `replace` keeps the sign-in page out of history; `refresh` re-runs the
      // server components so the navbar and any protected page see the session.
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
        <FormField id="email" label="Email" error={errors.email}>
          {(field) => (
            <Input
              {...field}
              type="email"
              value={email}
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 rounded-xl"
            />
          )}
        </FormField>

        <FormField id="password" label="Password" error={errors.password}>
          {(field) => (
            <PasswordField
              {...field}
              value={password}
              autoComplete="current-password"
              placeholder="Your password"
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </FormField>

        <div className="-mt-1 flex justify-end">
          {/* Not built yet, so it is shown as unavailable rather than as a link
              that goes nowhere. */}
          <span
            className="text-caption cursor-not-allowed text-muted-foreground"
            title="Password recovery is coming soon"
          >
            Forgot password?
          </span>
        </div>

        <Button
          type="submit"
          size="cta-lg"
          variant="brand"
          disabled={submitting}
          className="mt-6 w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </Button>
      </div>
    </form>
  );
}

export function LoginFooter({ redirectTo }: LoginFormProps) {
  const query = redirectTo === '/account' ? '' : `?redirect=${encodeURIComponent(redirectTo)}`;

  return (
    <>
      New to ZyCart?{' '}
      <Link
        href={`/register${query}`}
        className="focus-ring rounded-sm font-medium text-brand hover:underline"
      >
        Create an account
      </Link>
    </>
  );
}
