/**
 * Marketing copy and imagery for the merchandised sections of the storefront.
 * Shaped the way a CMS or the ZyCart API would return it, so swapping the
 * source in a later phase does not touch the components.
 */

export interface Announcement {
  id: string;
  message: string;
  href?: string;
  linkLabel?: string;
}

export interface PromoBanner {
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  image: string;
  imageAlt: string;
}

export const announcement: Announcement = {
  id: 'free-shipping-2026',
  message: 'Free shipping on orders above ₹999',
  href: '/shop',
  linkLabel: 'Shop now',
};

export interface HeroImage {
  url: string;
  alt: string;
}

export interface HeroSlide {
  id: string;
  eyebrow: string;
  /** Two lines: the second one carries the brand gradient. */
  headline: [string, string];
  body: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  /** The tall crop. Always present. */
  primaryImage: HeroImage;
  /** The two supporting crops beside it. */
  supportImages: [HeroImage, HeroImage];
}

/**
 * The homepage hero, as slides.
 *
 * Three, not eight: a hero carousel earns its controls by having something
 * different to say on each stop, and past the third slide a shopper is being
 * shown the same store three more times. Each one here leads somewhere
 * different — everything, the new season, and the assistant — so the dots are
 * a table of contents rather than a timer.
 *
 * `HeroSlide` is shaped the way a CMS would return it, so the merchandising
 * team owning this later changes this file and nothing else.
 */
export const heroSlides: HeroSlide[] = [
  {
    id: 'everything',
    eyebrow: 'New season · 2026',
    headline: ['Everything you want.', 'One smarter cart.'],
    body: 'Discover products picked for the way you shop — curated ranges, honest pricing, and an assistant that actually understands what you asked for.',
    primaryCta: { label: 'Start shopping', href: '/shop' },
    secondaryCta: { label: 'See new arrivals', href: '/shop?sort=newest' },
    primaryImage: {
      url: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=1000&q=85',
      alt: 'Pastel Air Force 1 sneakers photographed on a soft gradient backdrop',
    },
    supportImages: [
      {
        url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=85',
        alt: 'Black over-ear headphones on a bright yellow background',
      },
      {
        url: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=700&q=85',
        alt: 'Steel dive watch with a deep blue dial',
      },
    ],
  },
  {
    id: 'deals',
    eyebrow: 'The essentials edit',
    headline: ['Everyday pieces,', 'marked down properly.'],
    body: 'Real reductions on the things that get used daily — not a higher price with a bigger number struck through it. Every discount on ZyCart is worked out from what the product actually sold for.',
    primaryCta: { label: 'Shop the deals', href: '/shop?sort=discount' },
    secondaryCta: { label: 'Browse everything', href: '/shop' },
    primaryImage: {
      url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1000&q=85',
      alt: 'Seasonal flat lay of knitwear, denim and a watch',
    },
    supportImages: [
      {
        url: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=700&q=85',
        alt: 'Structured amber leather satchel with a woven base',
      },
      {
        url: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=700&q=85',
        alt: 'Steel dive watch with a deep blue dial',
      },
    ],
  },
  {
    id: 'assistant',
    eyebrow: 'ZyCart AI',
    headline: ['Describe it once.', 'We narrow it down.'],
    body: 'Tell the assistant what you need in your own words and it answers from the live catalogue — real prices, real ratings, real stock, and a budget it treats as a limit rather than a hint.',
    primaryCta: { label: 'Ask ZyCart AI', href: '/ai-shopping' },
    secondaryCta: { label: 'Shop by category', href: '/#categories' },
    primaryImage: {
      url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1000&q=85',
      alt: 'Open laptop on a wooden desk',
    },
    supportImages: [
      {
        url: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=700&q=85',
        alt: 'Pastel Air Force 1 sneakers photographed on a soft gradient backdrop',
      },
      {
        url: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=700&q=85',
        alt: 'Structured amber leather satchel with a woven base',
      },
    ],
  },
];

/**
 * The proof line under the hero.
 *
 * Deliberately outside the slides: it is true whichever slide is showing, and
 * keeping it in the frame rather than in the rotation means the hero's height
 * is decided once instead of changing under the reader.
 */
export const heroStats = [
  { value: '36', label: 'Curated products' },
  { value: '4.7★', label: 'Average rating' },
  { value: '2 days', label: 'Typical delivery' },
];

export const promoBanner: PromoBanner = {
  eyebrow: 'The essentials edit',
  title: 'Upgrade your everyday.',
  body: 'Selected essentials at special prices — the pieces that get used daily, chosen because they last rather than because they trend.',
  ctaLabel: 'Explore collection',
  href: '/shop?category=home',
  image:
    'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1200&q=85',
  imageAlt: 'Seasonal flat lay of knitwear, denim and a watch',
};

export const secondaryPromo: PromoBanner = {
  eyebrow: 'Limited release',
  title: 'Made in small runs.',
  body: 'Pieces produced a few hundred at a time, by makers we can name. When a run sells out, it is genuinely gone.',
  ctaLabel: 'See limited pieces',
  href: '/shop?category=accessories',
  image:
    'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1200&q=85',
  imageAlt: 'Structured amber leather satchel with a woven base',
};

/**
 * The homepage AI band.
 *
 * `prompts` are live from Phase 10: tapping one opens the assistant with that
 * question asked. So they have to be things it can genuinely answer from the
 * catalogue — a prompt that produces "I don't have that" is worse than no
 * prompt, which is why the open-ended gift suggestion that used to sit here is
 * gone. It read well as a mock and would have failed as a feature.
 */
export const aiSection = {
  eyebrow: 'ZyCart AI',
  title: 'Shopping, with a little more intelligence.',
  body: 'Tell ZyCart what you need and the assistant narrows the catalogue down to the handful that actually fit — with the real price, rating and stock for each one.',
  ctaLabel: 'Ask ZyCart AI',
  href: '/ai-shopping',
  prompts: [
    'I need a comfortable pair of black shoes under ₹3,000.',
    'Show me highly rated headphones under ₹5,000.',
    'Compare the two best-rated laptops you can find.',
  ],
  capabilities: [
    { title: 'Understands plain language', body: 'Describe it the way you would to a friend.' },
    { title: 'Respects your budget', body: 'Price caps are treated as hard limits, not hints.' },
    { title: 'Answers from the catalogue', body: 'Live prices and stock — nothing invented.' },
  ],
};

export const newsletter = {
  title: 'Get the good stuff first.',
  body: 'New arrivals, restocks and member pricing. One email a week, and an unsubscribe link that works.',
  placeholder: 'you@example.com',
  ctaLabel: 'Subscribe',
  note: 'No spam. Unsubscribe any time.',
};

export const trustBadges = [
  { title: 'Free shipping', body: 'On orders above ₹999' },
  // Enforced from Phase 13: `RETURN_WINDOW_DAYS` in the backend's return model
  // is the rule this advertises. Change them together.
  { title: '30-day returns', body: 'No questions asked' },
  { title: 'Secure checkout', body: '256-bit encryption' },
  { title: 'Genuine products', body: 'Sourced from authorised sellers' },
];
