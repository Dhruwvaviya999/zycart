'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthError } from '@/components/auth/auth-error';
import { FormField } from '@/components/auth/form-field';
import { requestPasswordReset } from '@/services/auth.service';
import { fieldErrors, toErrorMessage } from '@/services/api';

/**
 * Asks for a reset link.
 *
 * The confirmation shown afterwards is the server's sentence, and it is the
 * same whether or not the address has an account — so this form cannot be used
 * to find out who shops here. The page therefore never says "we have sent you
 * an email"; it says one is on its way *if* the account exists.
 */
export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    if (!email.trim()) {
      setError('Enter the email address you signed up with');
      return;
    }

    setSubmitting(true);
    setError(undefined);
    setFormError(undefined);

    try {
      setSent(await requestPasswordReset(email.trim()));
    } catch (cause) {
      setError(fieldErrors(cause).email);
      setFormError(toErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="rounded-2xl border border-border bg-surface p-5">
        <MailCheck className="size-5 text-success" aria-hidden />
        <p className="text-small mt-3 font-medium text-pretty">{sent}</p>
        <p className="text-caption mt-2 text-pretty text-muted-foreground">
          The link works once, for an hour. Nothing changes until you use it — if you remember your
          password in the meantime, just sign in as usual.
        </p>
        <button
          type="button"
          onClick={() => setSent(null)}
          className="focus-ring text-caption mt-4 rounded-sm font-medium text-brand hover:underline"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <AuthError message={formError} />

      <div className={formError ? 'pt-5' : undefined}>
        <FormField id="email" label="Email" error={error}>
          {(field) => (
            <Input
              {...field}
              type="email"
              value={email}
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
              size="lg"
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
              Sending...
            </>
          ) : (
            'Email me a reset link'
          )}
        </Button>
      </div>
    </form>
  );
}

export function BackToSignIn() {
  return (
    <>
      Remembered it?{' '}
      <Link href="/login" className="focus-ring rounded-sm font-medium text-brand hover:underline">
        Sign in
      </Link>
    </>
  );
}
