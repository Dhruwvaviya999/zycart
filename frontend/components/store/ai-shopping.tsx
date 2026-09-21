'use client';

import Link from 'next/link';
import { ArrowUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/layout/container';
import { aiSection } from '@/data/banners';
import { useAiStore } from '@/store/ai-store';

/**
 * The homepage's AI band.
 *
 * Until Phase 10 this was a mock: a picture of an assistant, with a note saying
 * it was coming. The prompts are now real — tapping one opens the assistant with
 * that question already asked, so the section demonstrates the feature instead
 * of illustrating it.
 *
 * It keeps its place in the page rather than taking over: it sits between the
 * New Arrivals and Best Sellers rails, after the categories and the products,
 * because browsing the catalogue is still the primary way to shop here and the
 * assistant is a second way in, not a replacement for the first.
 *
 * The one section that deliberately breaks the light neutral rhythm — it is the
 * anchor for the ZyCart brand, so it inverts to ink in both themes.
 */
export function AiShopping() {
  const availability = useAiStore((state) => state.availability);
  const openAssistant = useAiStore((state) => state.openAssistant);
  const send = useAiStore((state) => state.send);

  const live = availability === 'available';

  function ask(prompt: string) {
    openAssistant();
    void send(prompt);
  }

  return (
    <section className="section">
      <Container>
        <div className="relative overflow-hidden rounded-[1.75rem] bg-[oklch(0.19_0.03_272)] text-[oklch(0.97_0.005_265)] ring-1 ring-brand/25">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(38rem_26rem_at_18%_0%,color-mix(in_oklab,var(--brand)_42%,transparent),transparent_64%),radial-gradient(30rem_22rem_at_92%_108%,color-mix(in_oklab,var(--brand)_26%,transparent),transparent_62%)]"
          />

          <div className="relative grid gap-12 px-7 py-14 sm:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:py-20">
            <div>
              <p className="text-label inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[oklch(0.86_0.09_277)] ring-1 ring-white/15">
                <Sparkles className="size-3.5" aria-hidden />
                {aiSection.eyebrow}
              </p>

              <h2 className="text-h1 mt-6 text-balance">{aiSection.title}</h2>
              <p className="text-body-lg mt-5 max-w-lg text-pretty text-white/70">
                {aiSection.body}
              </p>

              <ul className="mt-9 grid gap-5 sm:grid-cols-3">
                {aiSection.capabilities.map((capability) => (
                  <li key={capability.title}>
                    <p className="text-small font-semibold">{capability.title}</p>
                    <p className="text-caption mt-1 text-white/60">{capability.body}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex flex-wrap gap-3">
                {live ? (
                  <Button
                    size="cta-lg"
                    onClick={() => openAssistant()}
                    className="bg-white text-[oklch(0.19_0.03_272)] hover:bg-white/90"
                  >
                    {aiSection.ctaLabel}
                    <Sparkles className="size-4" data-icon="inline-end" />
                  </Button>
                ) : (
                  <Button
                    size="cta-lg"
                    render={<Link href="/shop" />}
                    className="bg-white text-[oklch(0.19_0.03_272)] hover:bg-white/90"
                  >
                    Browse the catalogue
                  </Button>
                )}

                {live && (
                  <Button
                    size="cta-lg"
                    variant="ghost"
                    render={<Link href="/ai-shopping" />}
                    className="text-white ring-1 ring-white/20 hover:bg-white/10 hover:text-white"
                  >
                    Open full screen
                  </Button>
                )}
              </div>
            </div>

            {/*
              Real prompts. Each one opens the assistant with that question
              already asked, so this is the feature rather than a picture of it.
              Without an assistant configured they fall back to plain quotations,
              because a control that cannot work should not look like one.
            */}
            <div className="rounded-2xl bg-white/6 p-4 ring-1 ring-white/12 backdrop-blur-sm sm:p-5">
              <p className="text-label px-1 text-white/60">Ask ZyCart</p>

              <ul className="mt-4 space-y-2.5">
                {aiSection.prompts.map((prompt, index) => (
                  <li key={prompt}>
                    {live ? (
                      <button
                        type="button"
                        onClick={() => ask(prompt)}
                        className={
                          index === 0
                            ? 'focus-ring w-full rounded-xl bg-brand px-4 py-3.5 text-left text-[0.9375rem] leading-snug text-brand-foreground shadow-lg transition-opacity hover:opacity-90'
                            : 'focus-ring w-full rounded-xl bg-white/7 px-4 py-3.5 text-left text-[0.9375rem] leading-snug text-white/75 ring-1 ring-white/8 transition-colors hover:bg-white/12 hover:text-white'
                        }
                      >
                        &ldquo;{prompt}&rdquo;
                      </button>
                    ) : (
                      <p
                        className={
                          index === 0
                            ? 'rounded-xl bg-brand px-4 py-3.5 text-[0.9375rem] leading-snug text-brand-foreground shadow-lg'
                            : 'rounded-xl bg-white/7 px-4 py-3.5 text-[0.9375rem] leading-snug text-white/65 ring-1 ring-white/8'
                        }
                      >
                        &ldquo;{prompt}&rdquo;
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              {live ? (
                <button
                  type="button"
                  onClick={() => openAssistant()}
                  className="focus-ring mt-4 flex w-full items-center gap-3 rounded-xl bg-white/8 px-4 py-3 text-left ring-1 ring-white/12 transition-colors hover:bg-white/14"
                >
                  <span className="text-small text-white/70">Describe what you need...</span>
                  <span className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg bg-white/15">
                    <ArrowUp className="size-4" aria-hidden />
                  </span>
                  <span className="sr-only">Open ZyCart AI</span>
                </button>
              ) : (
                <p className="text-caption mt-4 px-1 text-white/55">
                  The assistant is unavailable on this store right now. Search and filters work as
                  normal.
                </p>
              )}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
