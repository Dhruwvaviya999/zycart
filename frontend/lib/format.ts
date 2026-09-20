const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });

export const formatPrice = (value: number) => inr.format(value);

export const formatCount = (value: number) => compact.format(value);

export function discountPercent(price: number, compareAtPrice?: number | null) {
  if (!compareAtPrice || compareAtPrice <= price) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * The store's timezone, stated once.
 *
 * Every timestamp the admin console renders is formatted against it rather than
 * against whatever the viewer's machine is set to. Two reasons, and the second
 * is the one that bites:
 *
 *  1. An operations console describes when things happened *at the store*. An
 *     operator checking overnight orders from a laptop still on another
 *     timezone should see the store's clock, not their own.
 *  2. Every admin page is server-rendered. A timestamp formatted in the
 *     server's timezone and then re-formatted in the browser's produces
 *     different text for the same instant, which React reports as a hydration
 *     mismatch. Pinning the zone makes both sides agree by construction.
 *
 * It matches the `en-IN` currency and number formatting the rest of ZyCart uses.
 */
const STORE_TIME_ZONE = 'Asia/Kolkata';

const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: STORE_TIME_ZONE,
});

const timeOnly = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: STORE_TIME_ZONE,
});

const dayOnly = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: STORE_TIME_ZONE,
});

/** "20 Sep 2026, 10:42 am" — the full stamp, for detail panels. */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

/** "10:42 am" — for a timeline already grouped under its day. */
export const formatTime = (iso: string) => timeOnly.format(new Date(iso));

/**
 * The day a timestamp falls on, in the store's timezone.
 *
 * Used to group a timeline, and to decide what counts as "today" — which is a
 * question about the store's day, not the viewer's.
 */
export const formatDay = (iso: string) => dayOnly.format(new Date(iso));

/**
 * "Today", "Yesterday", or the date.
 *
 * Compared as formatted day strings rather than by subtracting milliseconds, so
 * the boundary is midnight in the store's timezone rather than 24 hours ago.
 */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const day = formatDay(iso);

  if (day === dayOnly.format(now)) return 'Today';

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (day === dayOnly.format(yesterday)) return 'Yesterday';

  return day;
}
