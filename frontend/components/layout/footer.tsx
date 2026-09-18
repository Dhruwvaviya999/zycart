import Link from 'next/link';
import { Mail, MapPin } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Logo } from '@/components/layout/logo';
import { footerNav, socialLinks } from '@/data/navigation';
import { trustBadges } from '@/data/banners';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface/50">
      <Container>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-7 border-b border-border py-10 lg:grid-cols-4">
          {trustBadges.map((badge) => (
            <li key={badge.title}>
              <p className="text-small font-semibold">{badge.title}</p>
              <p className="text-caption mt-1 text-muted-foreground">{badge.body}</p>
            </li>
          ))}
        </ul>

        <div className="grid gap-10 py-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2.6fr)] lg:gap-16">
          <div className="max-w-sm">
            <Logo />
            <p className="text-small mt-4 text-pretty text-muted-foreground">
              Smart shopping, beautifully simplified. Curated ranges, honest pricing, and an
              assistant that understands what you actually asked for.
            </p>

            <div className="mt-6 space-y-2.5">
              <a
                href="mailto:hello@zycart.com"
                className="focus-ring text-small inline-flex items-center gap-2 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <Mail className="size-4" aria-hidden />
                hello@zycart.com
              </a>
              <p className="text-small flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-4" aria-hidden />
                Ahmedabad, Gujarat, India
              </p>
            </div>

            <ul className="mt-6 flex flex-wrap gap-2">
              {socialLinks.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="focus-ring text-caption inline-flex rounded-full border border-border px-3 py-1.5 font-medium transition-colors hover:border-foreground/25 hover:bg-background"
                  >
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:grid-cols-5"
          >
            {footerNav.map((group) => (
              <div key={group.label}>
                <h2 className="text-label text-muted-foreground">{group.label}</h2>
                <ul className="mt-3.5 space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="focus-ring text-small rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-border py-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-muted-foreground">© 2026 ZyCart. All rights reserved.</p>
          <p className="text-caption text-muted-foreground">
            Prices include GST. Mock storefront — no orders are processed.
          </p>
        </div>
      </Container>
    </footer>
  );
}
