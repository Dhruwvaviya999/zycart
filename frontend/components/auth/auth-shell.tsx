import Image from 'next/image';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Logo } from '@/components/layout/logo';
import { trustBadges } from '@/data/banners';

interface AuthShellProps {
  eyebrow: string;
  /**
   * Omitted around Clerk's forms, which bring their own heading — one that
   * changes as the person moves through the flow ("Check your email").
   */
  title?: string;
  description?: string;
  /** Shown under the form — the link to the opposite journey, when the form has none. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const PANEL_IMAGE =
  'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1000&q=85';

/**
 * The shared composition behind sign-in and registration.
 *
 * It reuses the storefront's split-panel language from the promotional banners
 * rather than inventing a second one, so authentication reads as part of ZyCart
 * instead of a detour. The editorial half is decorative and is dropped below
 * `lg`, where the form should have the screen to itself.
 */
export function AuthShell({ eyebrow, title, description, footer, children }: AuthShellProps) {
  return (
    <Container className="relative py-10 sm:py-14">
      {/* A quiet brand glow behind the card, so the page reads as ZyCart even
          before the panel image loads. Purely ambient; screen readers and
          keyboards never meet it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-16 mx-auto h-80 max-w-3xl rounded-full bg-brand/10 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-5xl overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl shadow-black/[0.07] lg:grid-cols-2">
        <div className="flex flex-col justify-center bg-background px-6 py-10 sm:px-10 sm:py-14">
          <div className="mx-auto w-full max-w-sm">
            <Logo className="lg:hidden" />

            <p className="text-label mt-7 inline-flex items-center rounded-full bg-brand-subtle px-3 py-1 text-brand lg:mt-0">
              {eyebrow}
            </p>
            {title && <h1 className="text-h2 mt-3">{title}</h1>}
            {description && (
              <p className="text-small mt-2.5 text-pretty text-muted-foreground">{description}</p>
            )}

            <div className={title ? 'mt-8' : 'mt-5'}>{children}</div>

            {footer && <div className="text-small mt-7 text-muted-foreground">{footer}</div>}

            <Link
              href="/"
              className="focus-ring text-caption mt-4 inline-flex w-fit items-center gap-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <span aria-hidden>←</span> Back to shopping
            </Link>
          </div>
        </div>

        {/* Decorative: the form above carries every affordance on its own. */}
        <div className="relative hidden min-h-[34rem] lg:block" aria-hidden>
          <Image src={PANEL_IMAGE} alt="" fill sizes="50vw" className="object-cover" priority />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,oklch(0.19_0.03_272/0.92),oklch(0.19_0.03_272/0.55))]" />

          <div className="relative flex h-full flex-col justify-between p-10 text-[oklch(0.97_0.005_265)]">
            <Link href="/" className="focus-ring w-fit rounded-md">
              <span className="text-[1.0625rem] font-semibold tracking-[-0.03em]">ZyCart</span>
            </Link>

            <div>
              <p className="text-h3 max-w-xs text-balance">
                Smart shopping, beautifully simplified.
              </p>

              <ul className="mt-7 space-y-3">
                {trustBadges.slice(0, 3).map((badge) => (
                  <li key={badge.title} className="text-small flex items-center gap-2.5">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/15">
                      <Check className="size-3" />
                    </span>
                    <span className="text-white/80">
                      <span className="font-medium text-white">{badge.title}</span> · {badge.body}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Container>
  );
}
