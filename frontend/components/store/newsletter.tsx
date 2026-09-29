'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Container } from '@/components/layout/container';
import { newsletter } from '@/data/banners';
import { toErrorMessage } from '@/services/api';
import { subscribeToNewsletter } from '@/services/newsletter.service';

/**
 * The newsletter sign-up.
 *
 * Until Phase 18 this thanked the visitor and stored nothing. It now joins the
 * list for real — as a *pending* address. Anybody can type anybody's address
 * into a public form, so the server sends one email asking the address's owner
 * to confirm, and nothing else is ever sent until they do (double opt-in). The
 * message shown here is the server's, and it is the same whatever the address's
 * history, so the form cannot be used to find out who is subscribed.
 */
export function Newsletter() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(undefined);

    try {
      setConfirmation(await subscribeToNewsletter(email.trim(), 'homepage'));
    } catch (cause) {
      setError(toErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="section-tight">
      <Container>
        <div className="rounded-3xl border border-border bg-surface px-7 py-12 text-center sm:px-12 sm:py-16">
          <h2 className="text-h2 mx-auto max-w-xl">{newsletter.title}</h2>
          <p className="text-body mx-auto mt-4 max-w-lg text-pretty text-muted-foreground">
            {newsletter.body}
          </p>

          {confirmation ? (
            <p
              role="status"
              className="text-small mx-auto mt-8 inline-flex items-center gap-2 rounded-full bg-success/12 px-4 py-2.5 font-medium text-success"
            >
              <Check className="size-4" aria-hidden />
              {confirmation}
            </p>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mx-auto mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row"
            >
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              {/* The design-system field rather than a hand-rolled one: this
                  was the last input in the storefront with its own focus
                  treatment, which meant the newsletter box lit up differently
                  from every other field on the site. */}
              <Input
                id="newsletter-email"
                type="email"
                size="xl"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={newsletter.placeholder}
                disabled={submitting}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? 'newsletter-error' : undefined}
              />
              <Button
                type="submit"
                size="cta-lg"
                variant="brand"
                className="shrink-0"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  newsletter.ctaLabel
                )}
              </Button>
            </form>
          )}

          {error && (
            <p
              id="newsletter-error"
              role="alert"
              className="text-caption mt-3 font-medium text-destructive"
            >
              {error}
            </p>
          )}

          <p className="text-caption mt-4 text-muted-foreground">{newsletter.note}</p>
        </div>
      </Container>
    </section>
  );
}
