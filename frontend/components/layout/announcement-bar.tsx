'use client';

import Link from 'next/link';
import { ArrowRight, X } from 'lucide-react';
import { announcement } from '@/data/banners';
import { useUiStore } from '@/store/ui-store';
import { Container } from '@/components/layout/container';

/**
 * Dismissible promo strip. Content comes from the data layer so it can be
 * served by the backend in a later phase without touching this component.
 */
export function AnnouncementBar() {
  const dismissed = useUiStore((state) => state.announcementDismissed);
  const dismiss = useUiStore((state) => state.dismissAnnouncement);

  if (dismissed) return null;

  return (
    <div className="relative bg-foreground text-background">
      <Container className="flex h-9 items-center justify-center gap-3">
        <p className="text-caption truncate font-medium">
          {announcement.message}
          {announcement.href && announcement.linkLabel && (
            <Link
              href={announcement.href}
              className="focus-ring ml-2.5 inline-flex items-center gap-1 rounded-sm underline decoration-background/40 underline-offset-4 transition-colors hover:decoration-background"
            >
              {announcement.linkLabel}
              <ArrowRight className="size-3" aria-hidden />
            </Link>
          )}
        </p>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss announcement"
          className="focus-ring absolute right-3 inline-flex size-6 items-center justify-center rounded-md text-background/70 transition-colors hover:bg-background/10 hover:text-background sm:right-5"
        >
          <X className="size-3.5" />
        </button>
      </Container>
    </div>
  );
}
