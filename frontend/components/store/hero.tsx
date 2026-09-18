import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/layout/container';
import { heroContent } from '@/data/banners';

export function Hero() {
  const { eyebrow, headline, body, primaryCta, secondaryCta, stats, images } = heroContent;

  return (
    <section className="relative overflow-hidden">
      {/* Single soft brand wash — the only gradient above the fold. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_38rem_at_78%_-10%,var(--brand-subtle),transparent_62%)]"
      />

      <Container className="grid items-center gap-12 py-14 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-16 lg:py-24">
        <div className="animate-rise">
          <p className="text-label inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-subtle px-3 py-1.5 text-brand">
            <Sparkles className="size-3.5" aria-hidden />
            {eyebrow}
          </p>

          {/* Each sentence owns a line; wrapping within one is balanced. */}
          <h1 className="text-display mt-6">
            <span className="block text-balance">{headline[0]}</span>
            <span className="brand-gradient-text block text-balance">{headline[1]}</span>
          </h1>

          <p className="text-body-lg mt-6 max-w-xl text-pretty text-muted-foreground">{body}</p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button size="cta-lg" variant="brand" render={<Link href={primaryCta.href} />}>
              {primaryCta.label}
              <ArrowRight className="size-4" data-icon="inline-end" />
            </Button>
            <Button size="cta-lg" variant="outline" render={<Link href={secondaryCta.href} />}>
              {secondaryCta.label}
            </Button>
          </div>

          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-border pt-7">
            {stats.map((stat) => (
              <div key={stat.label}>
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="text-h3 block">{stat.value}</span>
                  <span className="text-caption mt-1 block text-muted-foreground">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Editorial composition: one hero product, two supporting crops. */}
        <div className="animate-rise [animation-delay:120ms]">
          {/* aspect-ratio gives the rows height — `fill` images need a sized parent. */}
          <div className="grid aspect-6/5 grid-cols-5 grid-rows-5 gap-3 sm:gap-4">
            <figure className="relative col-span-3 row-span-5 overflow-hidden rounded-3xl bg-surface ring-1 ring-border/70">
              <Image
                src={images.primary.url}
                alt={images.primary.alt}
                fill
                priority
                sizes="(min-width: 1024px) 32vw, 58vw"
                className="object-cover"
              />
            </figure>

            <figure className="relative col-span-2 row-span-3 overflow-hidden rounded-3xl bg-surface ring-1 ring-border/70">
              <Image
                src={images.secondary.url}
                alt={images.secondary.alt}
                fill
                sizes="(min-width: 1024px) 21vw, 38vw"
                className="object-cover"
              />
            </figure>

            <figure className="relative col-span-2 row-span-2 overflow-hidden rounded-3xl bg-surface ring-1 ring-border/70">
              <Image
                src={images.tertiary.url}
                alt={images.tertiary.alt}
                fill
                sizes="(min-width: 1024px) 21vw, 38vw"
                className="object-cover"
              />
            </figure>
          </div>
        </div>
      </Container>
    </section>
  );
}
