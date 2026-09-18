import Link from 'next/link';
import { ArrowUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/layout/container';
import { aiSection } from '@/data/banners';

/**
 * The one section that deliberately breaks the light neutral rhythm — it is the
 * anchor for the ZyCart brand, so it inverts to ink in both themes.
 */
export function AiShopping() {
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

              <div className="mt-10">
                <Button
                  size="cta-lg"
                  render={<Link href={aiSection.href} />}
                  className="bg-white text-[oklch(0.19_0.03_272)] hover:bg-white/90"
                >
                  {aiSection.ctaLabel}
                  <Sparkles className="size-4" data-icon="inline-end" />
                </Button>
              </div>
            </div>

            {/* A mock of the assistant surface, not a working input. */}
            <div className="rounded-2xl bg-white/6 p-4 ring-1 ring-white/12 backdrop-blur-sm sm:p-5">
              <p className="text-label px-1 text-white/60">Ask ZyCart</p>

              <ul className="mt-4 space-y-2.5">
                {aiSection.prompts.map((prompt, index) => (
                  <li
                    key={prompt}
                    className={
                      index === 0
                        ? 'rounded-xl bg-brand px-4 py-3.5 text-[0.9375rem] leading-snug text-brand-foreground shadow-lg'
                        : 'rounded-xl bg-white/7 px-4 py-3.5 text-[0.9375rem] leading-snug text-white/65 ring-1 ring-white/8'
                    }
                  >
                    &ldquo;{prompt}&rdquo;
                  </li>
                ))}
              </ul>

              <div
                className="mt-4 flex items-center gap-3 rounded-xl bg-white/8 px-4 py-3 ring-1 ring-white/12"
                aria-hidden
              >
                <span className="text-small text-white/55">Describe what you need...</span>
                <span className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg bg-white/15">
                  <ArrowUp className="size-4" />
                </span>
              </div>

              <p className="text-caption mt-3 px-1 text-white/55">
                Preview only — AI shopping arrives in a later release.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
