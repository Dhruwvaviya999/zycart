'use client';

import { useEffect, useRef } from 'react';
import { recordProductView } from '@/services/activity.service';

/**
 * Tells the server that this product page was opened.
 *
 * Renders nothing and blocks nothing. It fires once per product per mount, in
 * an effect after paint, so the page is on screen and interactive before the
 * request goes out — and if the request never completes, or the visitor is
 * signed out and gets a 401, the shopper sees exactly nothing.
 *
 * The ref guard matters more than it looks: React runs effects twice in
 * development's Strict Mode, and this component re-renders whenever the page
 * around it does. Without it, one page visit would post several times. The
 * server deduplicates as well — ten minutes per customer per product — so a
 * refresh loop cannot fill the activity collection either. Both, because the
 * client guard keeps the requests down and the server guard keeps the rows
 * down, and neither can be relied on alone.
 */
export function ProductViewTracker({ slug }: { slug: string }) {
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    if (recorded.current === slug) return;
    recorded.current = slug;

    recordProductView(slug);
  }, [slug]);

  return null;
}
