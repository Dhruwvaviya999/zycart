'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { heroBanners, type HeroBanner } from '@/data/banners';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';

/** Long enough to read a banner, short enough that the rail keeps moving. */
const INTERVAL_MS = 5500;

/**
 * The banner rail at the top of the homepage.
 *
 * A native scroll container, not a transform track, and that is the whole
 * design. `overflow-x: auto` with `scroll-snap` gives momentum scrolling,
 * swipe, trackpad gestures, keyboard arrow scrolling and the peeking
 * neighbour on either edge — all of it from the browser, none of it from
 * gesture-handling code that has to guess what a drag meant. Autoplay is then
 * a `scrollTo`, which the same snap points bring to rest in the right place.
 *
 * It also cannot widen the page: the overflow belongs to the rail, so a banner
 * wider than its frame scrolls inside it rather than pushing the document
 * sideways, which is the failure mode of every hero built as a wide row that
 * is translated.
 *
 * The cards carry the page's promotions, not advertising. Nothing here
 * imitates a third-party brand and nothing is badged "AD" — ZyCart sells no ad
 * inventory, and a fake ad slot is a lie told to the shopper about why they
 * are being shown something.
 */
export function Hero() {
  const banners = heroBanners;
  const reducedMotion = useReducedMotion();

  const railRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);

  /** Set once the shopper has driven the rail; autoplay does not come back. */
  const [taken, setTaken] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const railId = useId();
  const count = banners.length;
  const single = count <= 1;

  const rotating = !single && !taken && !hovered && !focused && !reducedMotion;

  /**
   * Which card is showing.
   *
   * Observed rather than calculated: the rail is a real scroll container whose
   * card width changes at every breakpoint, so measuring one card and dividing
   * would be a second source of truth that has to be kept in step with the CSS.
   * The browser already knows which card is in view.
   */
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const cards = Array.from(rail.children);
    const ratios = new Map<Element, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(entry.target, entry.intersectionRatio);

        let best = 0;
        let bestRatio = 0;
        cards.forEach((card, position) => {
          const ratio = ratios.get(card) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = position;
          }
        });

        setIndex(best);
      },
      { root: rail, threshold: [0.25, 0.5, 0.75, 1] },
    );

    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [count]);

  const scrollTo = useCallback((position: number) => {
    const rail = railRef.current;
    const card = rail?.children[position] as HTMLElement | undefined;
    if (!rail || !card) return;

    // `scrollLeft` rather than `scrollIntoView`, which would also scroll the
    // page vertically to bring the rail into view.
    rail.scrollTo({ left: card.offsetLeft - rail.offsetLeft, behavior: 'smooth' });
  }, []);

  /** Every shopper-driven move goes through here, so one place stops the timer. */
  const drive = useCallback(
    (position: number) => {
      setTaken(true);
      scrollTo(((position % count) + count) % count);
    },
    [count, scrollTo],
  );

  useEffect(() => {
    if (!rotating) return;

    const timer = window.setInterval(() => {
      // Left alone while the tab is in the background: otherwise a shopper
      // returns to whichever banner the clock happened to land on.
      if (document.hidden) return;
      setIndex((current) => {
        const next = (current + 1) % count;
        scrollTo(next);
        return next;
      });
    }, INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [rotating, count, scrollTo]);

  return (
    <section
      aria-roledescription={single ? undefined : 'carousel'}
      aria-label="Featured offers"
      className="relative pt-4 pb-2 sm:pt-6"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {/*
        The page's one `h1`. The rail is images and links, so without this the
        homepage would open on an `h2` and have no heading of its own — the
        showcase further down used to carry it, and no longer should now that
        it is not the first thing on the page.
      */}
      <h1 className="sr-only">ZyCart — smart shopping, beautifully simplified</h1>

      <div className="relative mx-auto w-full max-w-(--container-page)">
        {/*
          `px` on the scroll container rather than on a wrapper, so the first
          and last cards line up with the page gutter while the ones between
          them still scroll edge to edge. `scroll-px` makes the snap points
          respect the same gutter.
        */}
        <ul
          ref={railRef}
          id={railId}
          tabIndex={0}
          aria-label="Featured offers"
          className={cn(
            'no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-1 sm:gap-4 sm:px-6 lg:px-8',
            'scroll-px-4 sm:scroll-px-6 lg:scroll-px-8',
            'focus-visible:outline-none',
          )}
          onPointerDown={() => setTaken(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') setTaken(true);
          }}
        >
          {banners.map((banner, position) => (
            <li
              key={banner.id}
              role={single ? undefined : 'group'}
              aria-roledescription={single ? undefined : 'slide'}
              aria-label={single ? undefined : `${position + 1} of ${count}`}
              /*
                `basis` under a third at `lg` is what leaves the next card
                peeking at the right edge — the cue that says the row scrolls,
                without a scrollbar having to say it.
              */
              className="shrink-0 basis-[86%] snap-start sm:basis-[62%] md:basis-[47%] lg:basis-[32.4%]"
            >
              <BannerCard banner={banner} priority={position === 0} />
            </li>
          ))}
        </ul>

        {!single && (
          <>
            {/* Pointer affordances. Hidden on touch, where the swipe is the
                control and an arrow floating over a card is just clutter. */}
            <RailArrow side="start" controls={railId} onClick={() => drive(index - 1)} />
            <RailArrow side="end" controls={railId} onClick={() => drive(index + 1)} />
          </>
        )}
      </div>

      {!single && (
        <ol className="mt-3 flex items-center justify-center gap-1" aria-label="Featured offers">
          {banners.map((banner, position) => {
            const current = position === index;

            return (
              <li key={banner.id}>
                <button
                  type="button"
                  onClick={() => drive(position)}
                  aria-label={`Go to offer ${position + 1}: ${banner.title}`}
                  aria-current={current ? 'true' : undefined}
                  aria-controls={railId}
                  /* A 6px indicator inside a 28px target: small enough to stay
                     quiet, big enough to hit. */
                  className="focus-ring group/dot grid h-7 w-6 place-items-center rounded-full"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-300 ease-brand',
                      current
                        ? 'w-5 bg-brand'
                        : 'w-1.5 bg-border group-hover/dot:bg-foreground/35',
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const toneScrim: Record<NonNullable<HeroBanner['tone']>, string> = {
  ink: 'from-[oklch(0.16_0.02_265)]/92 via-[oklch(0.16_0.02_265)]/70',
  brand: 'from-[oklch(0.24_0.09_277)]/94 via-[oklch(0.24_0.09_277)]/70',
  sale: 'from-[oklch(0.22_0.06_25)]/94 via-[oklch(0.22_0.06_25)]/68',
};

/**
 * One banner.
 *
 * The scrim is the load-bearing part: a promotional image is chosen by a
 * merchandiser for the product in it, not for how much contrast it happens to
 * leave behind white text, so the copy sits over a gradient rather than over
 * the photograph. Three tones, so five consecutive cards are distinguishable
 * at a glance rather than reading as one long strip.
 */
function BannerCard({ banner, priority }: { banner: HeroBanner; priority: boolean }) {
  const alignEnd = banner.align === 'end';

  return (
    <Link
      href={banner.href}
      className="focus-ring group/banner relative block aspect-16/9 overflow-hidden rounded-2xl bg-surface ring-1 ring-border/70 sm:aspect-2/1"
    >
      <Image
        src={banner.image.url}
        alt=""
        fill
        priority={priority}
        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 47vw, 86vw"
        className="object-cover transition-transform duration-700 ease-brand group-hover/banner:scale-[1.04]"
      />

      <span
        aria-hidden
        className={cn(
          'absolute inset-0 bg-gradient-to-r to-transparent',
          alignEnd && 'bg-gradient-to-l',
          toneScrim[banner.tone ?? 'ink'],
        )}
      />

      <span
        className={cn(
          'absolute inset-0 flex flex-col justify-center gap-1.5 p-5 sm:p-6',
          alignEnd ? 'items-end text-right' : 'items-start',
        )}
      >
        <span className="text-label text-white/70">{banner.eyebrow}</span>

        <span className="font-heading max-w-[19ch] text-xl leading-[1.15] font-semibold text-balance text-white sm:text-2xl">
          {banner.title}
        </span>

        <span className="text-caption hidden max-w-[34ch] text-pretty text-white/75 sm:block">
          {banner.body}
        </span>

        {/* A span, not a button: the whole card is already the link, and a
            control inside a link is a control that cannot be reached. */}
        <span className="text-small mt-2 inline-flex items-center gap-1.5 font-semibold text-white">
          {banner.ctaLabel}
          <ArrowRight
            className="size-4 transition-transform duration-300 ease-brand group-hover/banner:translate-x-0.5"
            aria-hidden
          />
        </span>
      </span>
    </Link>
  );
}

function RailArrow({
  side,
  controls,
  onClick,
}: {
  side: 'start' | 'end';
  controls: string;
  onClick: () => void;
}) {
  const Icon = side === 'start' ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'start' ? 'Previous offers' : 'Next offers'}
      aria-controls={controls}
      className={cn(
        'focus-ring absolute top-1/2 z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/90 text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background md:grid',
        side === 'start' ? 'left-1' : 'right-1',
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
