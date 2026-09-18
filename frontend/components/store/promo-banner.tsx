import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/layout/container';
import type { PromoBanner as PromoBannerData } from '@/data/banners';
import { cn } from '@/lib/utils';

interface PromoBannerProps {
  banner: PromoBannerData;
  /** Puts the image on the left instead of the right. */
  reverse?: boolean;
}

/** Editorial break between product grids. */
export function PromoBanner({ banner, reverse = false }: PromoBannerProps) {
  return (
    <section className="section-tight">
      <Container>
        <div className="grid overflow-hidden rounded-3xl bg-surface ring-1 ring-border/70 lg:grid-cols-2">
          <div
            className={cn(
              'flex flex-col justify-center gap-5 px-7 py-12 sm:px-12 lg:py-20',
              reverse && 'lg:order-2',
            )}
          >
            <p className="text-label text-brand">{banner.eyebrow}</p>
            <h2 className="text-h1 max-w-md">{banner.title}</h2>
            <p className="text-body max-w-md text-pretty text-muted-foreground">{banner.body}</p>

            <div className="pt-2">
              <Button size="cta" variant="brand" render={<Link href={banner.href} />}>
                {banner.ctaLabel}
                <ArrowRight className="size-4" data-icon="inline-end" />
              </Button>
            </div>
          </div>

          <div
            className={cn(
              'relative min-h-[18rem] lg:min-h-[26rem]',
              reverse && 'lg:order-1',
            )}
          >
            <Image
              src={banner.image}
              alt={banner.imageAlt}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
