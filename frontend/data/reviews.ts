import type { Review } from '@/types/product';

/**
 * Static sample reviews. Reviews are not part of the Phase 3 catalogue API, so
 * the product page still renders these until a reviews service exists.
 */
export const reviews: Review[] = [
  {
    id: 'r-1',
    author: 'Ananya Rao',
    initials: 'AR',
    rating: 5,
    date: '2026-08-28',
    title: 'Exactly as described',
    body: 'Third order from ZyCart and the first where I did not feel the photos were doing the heavy lifting. Fit is true to size and it arrived two days early.',
    verified: true,
  },
  {
    id: 'r-2',
    author: 'Karthik Menon',
    initials: 'KM',
    rating: 4,
    date: '2026-08-14',
    title: 'Great, with one caveat',
    body: 'Build quality is genuinely good for the price. Only note is that the colour reads slightly warmer in person than on screen — not a problem, just worth knowing.',
    verified: true,
  },
  {
    id: 'r-3',
    author: 'Priya Sharma',
    initials: 'PS',
    rating: 5,
    date: '2026-07-30',
    title: 'Worth the upgrade',
    body: 'Replaced a pair I had used for four years. The difference on long days is obvious within the first week. Packaging was minimal, which I appreciated.',
    verified: true,
  },
  {
    id: 'r-4',
    author: 'Devan Iyer',
    initials: 'DI',
    rating: 4,
    date: '2026-07-11',
    title: 'Solid everyday choice',
    body: 'Not flashy, which is why I bought it. Has held up to daily use without any of the wear I expected around the edges.',
    verified: false,
  },
];
