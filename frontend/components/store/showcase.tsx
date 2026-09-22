import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/layout/container';
import { heroStats, showcase } from '@/data/banners';

/**
 * The editorial band: what ZyCart is, rather than what is on offer today.
 *
 * This was the hero until the banner rail took that slot, and it reads better
 * here. At the top of a storefront a shopper is looking for offers and a way
 * into the catalogue; a paragraph about the store's philosophy above the fold
 * is the shop talking about itself before it has shown anything. A few rails
 * down — once the offers and the first products have done their job — the same
 * paragraph is a reason to stay.
 *
 * A server component again, and static. It was a three-slide carousel while it
 * was the hero; the rail above now does the rotating, and two things rotating
 * on one page is one too many. The copy from the other two slides did not go
 * anywhere — it became banners.
 *
 * `h2`, not `h1`: the page's `h1` belongs to the rail at the top of it.
 */
export function Showcase() {
  const { eyebrow, headline, body, primaryCta, secondaryCta, images } = showcase;

  return (
    <section className="section-tight relative overflow-hidden">
      {/* The same soft brand wash it always had, now washing a band rather
          than the top of the page. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_38rem_at_78%_-10%,var(--brand-subtle),transparent_62%)]"
      />

      <Container className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-16">
        <div>
          <p className="text-label inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-subtle px-3 py-1.5 text-brand">
            <Sparkles className="size-3.5" aria-hidden />
            {eyebrow}
          </p>

          {/* Each sentence owns a line; wrapping within one is balanced. */}
          <h2 className="text-display mt-6">
            <span className="block text-balance">{headline[0]}</span>
            <span className="brand-gradient-text block text-balance">{headline[1]}</span>
          </h2>

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
            {heroStats.map((stat) => (
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

        {/* Editorial composition: one hero product, two supporting crops.
            `aspect-ratio` gives the rows height — `fill` images need a sized
            parent. */}
        <div className="grid aspect-6/5 grid-cols-5 grid-rows-5 gap-3 sm:gap-4">
          <figure className="relative col-span-3 row-span-5 overflow-hidden rounded-3xl bg-surface ring-1 ring-border/70">
            <Image
              src={images.primary.url}
              alt={images.primary.alt}
              fill
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
      </Container>
    </section>
  );
}
