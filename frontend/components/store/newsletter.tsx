'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/layout/container';
import { newsletter } from '@/data/banners';

export function Newsletter() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  return (
    <section className="section-tight">
      <Container>
        <div className="rounded-3xl border border-border bg-surface px-7 py-12 text-center sm:px-12 sm:py-16">
          <h2 className="text-h2 mx-auto max-w-xl">{newsletter.title}</h2>
          <p className="text-body mx-auto mt-4 max-w-lg text-pretty text-muted-foreground">
            {newsletter.body}
          </p>

          {submitted ? (
            <p
              role="status"
              className="text-small mx-auto mt-8 inline-flex items-center gap-2 rounded-full bg-success/12 px-4 py-2.5 font-medium text-success"
            >
              <Check className="size-4" aria-hidden />
              Thanks — check your inbox to confirm.
            </p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setSubmitted(true);
              }}
              className="mx-auto mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row"
            >
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={newsletter.placeholder}
                className="focus-ring text-body h-12 w-full rounded-xl border border-border bg-background px-4 placeholder:text-muted-foreground"
              />
              <Button type="submit" size="cta-lg" variant="brand" className="shrink-0">
                {newsletter.ctaLabel}
              </Button>
            </form>
          )}

          <p className="text-caption mt-4 text-muted-foreground">{newsletter.note}</p>
        </div>
      </Container>
    </section>
  );
}
