'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/layout/container';
import { heroSlides, heroStats, type HeroSlide } from '@/data/banners';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { cn } from '@/lib/utils';

/** Long enough to read the body copy, short enough not to feel stuck. */
const INTERVAL_MS = 7000;

/** Below this, a drag is a scroll or a mis-tap rather than a swipe. */
const SWIPE_THRESHOLD_PX = 48;

/**
 * The homepage hero.
 *
 * Built as a stack rather than a sliding track, and that is the whole design.
 *
 * A track is `overflow: hidden` wrapped around a row three viewports wide,
 * which is how a carousel ends up adding a horizontal scrollbar to the
 * document the first time a slide is a pixel wider than its frame. Stacking
 * the slides in one grid cell means the section is exactly as wide as the page
 * and exactly as tall as its tallest slide — measured on the first paint, with
 * all three in the DOM — so the frame around the copy never changes size while
 * the copy inside it does. No track, no overflow, no layout shift.
 *
 * What rotates is therefore opacity and a few pixels of rise, which is also
 * the only kind of motion that can be switched off without the component
 * losing a feature: with `prefers-reduced-motion` the transition goes (the
 * global stylesheet flattens it) and so does the timer (this component reads
 * the preference and never starts one), leaving a hero a reader drives.
 *
 * Accessibility follows the ARIA carousel pattern: the region is labelled as a
 * carousel, each slide as a slide of N, inactive slides are `inert` so no
 * keyboard can reach a link it cannot see, the live region is silent while the
 * thing is rotating and polite once it is not, and rotation stops for good the
 * moment the reader takes a turn — with a pause control for the case where
 * they would rather it just stopped.
 */
export function Hero() {
  const slides = heroSlides;
  const reducedMotion = useReducedMotion();

  const [index, setIndex] = useState(0);

  /**
   * Set once the reader has driven the carousel themselves. Rotation does not
   * come back afterwards: having taken control, being moved along anyway is
   * the single most irritating thing a carousel does.
   */
  const [taken, setTaken] = useState(false);
  const [paused, setPaused] = useState(false);

  /** Pointer over it, or keyboard focus inside it — tracked apart, because a
      blur must not restart rotation under a pointer that never left. */
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const regionId = useId();
  const count = slides.length;
  const single = count <= 1;

  const rotating = !single && !taken && !paused && !hovered && !focused && !reducedMotion;

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  /** Every reader-driven move goes through here, so one place stops the timer. */
  const drive = useCallback(
    (next: number) => {
      setTaken(true);
      go(next);
    },
    [go],
  );

  useEffect(() => {
    if (!rotating) return;

    const timer = window.setInterval(() => {
      // Paused while the tab is in the background: otherwise a reader comes
      // back to a slide chosen by however long they were away.
      if (document.hidden) return;
      setIndex((current) => (current + 1) % count);
    }, INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [rotating, count]);

  // Touch swipe. Pointer events cover pen and touch alike, and the horizontal
  // test keeps a vertical page scroll from being read as a slide change.
  const drag = useRef<{ x: number; y: number } | null>(null);

  function onPointerDown(event: React.PointerEvent) {
    if (event.pointerType === 'mouse') return;
    drag.current = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: React.PointerEvent) {
    const start = drag.current;
    drag.current = null;
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;

    drive(index + (dx < 0 ? 1 : -1));
  }

  return (
    <section
      aria-roledescription={single ? undefined : 'carousel'}
      aria-label={single ? undefined : 'Featured'}
      className="relative overflow-hidden"
      onKeyDown={(event) => {
        if (single) return;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          drive(index - 1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          drive(index + 1);
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
    >
      {/* Single soft brand wash — the only gradient above the fold. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_38rem_at_78%_-10%,var(--brand-subtle),transparent_62%)]"
      />

      {/* The entrance runs once, on the container, not on each slide: a rise
          on every rotation would be motion for its own sake, and it would
          fight the crossfade. */}
      <Container className="animate-rise py-12 lg:py-20">
        <div
          id={regionId}
          /* Silent while it moves on its own, announced once the reader is the
             one moving it — the pattern's rule, and the reason a rotating
             carousel is not a screen-reader interruption. */
          aria-live={rotating ? 'off' : 'polite'}
          className="grid"
        >
          {slides.map((slide, slideIndex) => {
            const active = slideIndex === index;

            return (
              <div
                key={slide.id}
                role={single ? undefined : 'group'}
                aria-roledescription={single ? undefined : 'slide'}
                aria-label={single ? undefined : `${slideIndex + 1} of ${count}`}
                aria-hidden={!active}
                /* Nothing behind the visible slide can be tabbed into. */
                inert={!active}
                className={cn(
                  // Every slide occupies the same grid cell, so the section is
                  // as tall as the tallest one from the first paint onwards.
                  'col-start-1 row-start-1 transition-opacity duration-500 ease-brand',
                  active ? 'opacity-100' : 'pointer-events-none opacity-0',
                )}
              >
                <HeroSlideView slide={slide} active={active} priority={slideIndex === 0} />
              </div>
            );
          })}
        </div>

        {/* The frame below the rotation: controls on the left, proof on the
            right, both fixed whichever slide is showing. */}
        <div className="mt-10 flex flex-col gap-8 border-t border-border pt-7 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
          {!single && (
            <div className="flex items-center gap-2 sm:order-2">
              <IconControl label="Previous slide" controls={regionId} onClick={() => drive(index - 1)}>
                <ChevronLeft className="size-4" aria-hidden />
              </IconControl>

              <ol className="flex items-center gap-1.5" aria-label="Slides">
                {slides.map((slide, slideIndex) => (
                  <li key={slide.id}>
                    <button
                      type="button"
                      onClick={() => drive(slideIndex)}
                      aria-label={`Go to slide ${slideIndex + 1}: ${slide.eyebrow}`}
                      aria-current={slideIndex === index ? 'true' : undefined}
                      aria-controls={regionId}
                      /* A 36px target around a 6px dot: the indicator can stay
                         small without the control being hard to hit. */
                      className="focus-ring group/dot grid size-9 place-items-center rounded-full"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'h-1.5 rounded-full transition-all duration-300 ease-brand',
                          slideIndex === index
                            ? 'w-6 bg-brand'
                            : 'w-1.5 bg-border group-hover/dot:bg-foreground/35',
                        )}
                      />
                    </button>
                  </li>
                ))}
              </ol>

              <IconControl label="Next slide" controls={regionId} onClick={() => drive(index + 1)}>
                <ChevronRight className="size-4" aria-hidden />
              </IconControl>

              {/* Offered only while there is something to pause. Once the
                  reader has taken over, or the timer never started because
                  they asked for less motion, a pause button is a lie. */}
              {!taken && !reducedMotion && (
                <IconControl
                  label={paused ? 'Resume the carousel' : 'Pause the carousel'}
                  controls={regionId}
                  pressed={paused}
                  onClick={() => setPaused((current) => !current)}
                >
                  {paused ? (
                    <Play className="size-3.5" aria-hidden />
                  ) : (
                    <Pause className="size-3.5" aria-hidden />
                  )}
                </IconControl>
              )}
            </div>
          )}

          <dl className="grid max-w-md flex-1 grid-cols-3 gap-6 sm:order-1">
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
      </Container>
    </section>
  );
}

function IconControl({
  label,
  controls,
  pressed,
  onClick,
  children,
}: {
  label: string;
  controls: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-controls={controls}
      aria-pressed={pressed}
      title={label}
      className="focus-ring inline-flex size-9 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:border-foreground/25 hover:bg-muted"
    >
      {children}
    </button>
  );
}

/**
 * One slide: copy on the left, an editorial crop composition on the right.
 *
 * The aspect-ratio on the image grid is what gives the `fill` images a height
 * to fill, and it is also what stops the composition from resizing between
 * slides — the crops differ, the frame does not.
 */
function HeroSlideView({
  slide,
  active,
  priority,
}: {
  slide: HeroSlide;
  active: boolean;
  priority: boolean;
}) {
  const [support, secondary] = [slide.supportImages[0], slide.supportImages[1]];

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-16">
      <div>
        <p className="text-label inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-subtle px-3 py-1.5 text-brand">
          <Sparkles className="size-3.5" aria-hidden />
          {slide.eyebrow}
        </p>

        {/* Each sentence owns a line; wrapping within one is balanced. */}
        <h1 className="text-display mt-6">
          <span className="block text-balance">{slide.headline[0]}</span>
          <span className="brand-gradient-text block text-balance">{slide.headline[1]}</span>
        </h1>

        <p className="text-body-lg mt-6 max-w-xl text-pretty text-muted-foreground">
          {slide.body}
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Button
            size="cta-lg"
            variant="brand"
            render={<Link href={slide.primaryCta.href} />}
            /* An inactive slide is `inert`, but a link that is invisible should
               also be out of the tab order for browsers without it. */
            tabIndex={active ? undefined : -1}
          >
            {slide.primaryCta.label}
            <ArrowRight className="size-4" data-icon="inline-end" />
          </Button>
          <Button
            size="cta-lg"
            variant="outline"
            render={<Link href={slide.secondaryCta.href} />}
            tabIndex={active ? undefined : -1}
          >
            {slide.secondaryCta.label}
          </Button>
        </div>
      </div>

      <div className="grid aspect-6/5 grid-cols-5 grid-rows-5 gap-3 sm:gap-4">
        <figure className="relative col-span-3 row-span-5 overflow-hidden rounded-3xl bg-surface ring-1 ring-border/70">
          <Image
            src={slide.primaryImage.url}
            alt={slide.primaryImage.alt}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 32vw, 58vw"
            className="object-cover"
          />
        </figure>

        <figure className="relative col-span-2 row-span-3 overflow-hidden rounded-3xl bg-surface ring-1 ring-border/70">
          <Image
            src={support.url}
            alt={support.alt}
            fill
            sizes="(min-width: 1024px) 21vw, 38vw"
            className="object-cover"
          />
        </figure>

        <figure className="relative col-span-2 row-span-2 overflow-hidden rounded-3xl bg-surface ring-1 ring-border/70">
          <Image
            src={secondary.url}
            alt={secondary.alt}
            fill
            sizes="(min-width: 1024px) 21vw, 38vw"
            className="object-cover"
          />
        </figure>
      </div>
    </div>
  );
}
