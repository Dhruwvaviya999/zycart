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

export const heroContent = {
  eyebrow: 'New season · 2026',
  headline: ['Everything you want.', 'One smarter cart.'],
  body: 'Discover products picked for the way you shop — curated ranges, honest pricing, and an assistant that actually understands what you asked for.',
  primaryCta: { label: 'Start shopping', href: '/shop' },
  secondaryCta: { label: 'See new arrivals', href: '/shop?sort=newest' },
  stats: [
    { value: '36', label: 'Curated products' },
    { value: '4.7★', label: 'Average rating' },
    { value: '2 days', label: 'Typical delivery' },
  ],
  images: {
    primary: {
      url: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=1000&q=85',
      alt: 'Pastel Air Force 1 sneakers photographed on a soft gradient backdrop',
    },
    secondary: {
      url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=85',
      alt: 'Black over-ear headphones on a bright yellow background',
    },
    tertiary: {
      url: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=700&q=85',
      alt: 'Steel dive watch with a deep blue dial',
    },
  },
};

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

export const aiSection = {
  eyebrow: 'Coming to ZyCart',
  title: 'Shopping made smarter.',
  body: 'Tell ZyCart what you are looking for and let AI narrow thousands of products down to the handful that actually fit.',
  ctaLabel: 'Try AI Shopping',
  href: '/shop',
  prompts: [
    'I need a comfortable pair of black shoes under ₹3000.',
    'Something warm for Delhi in December, under ₹6000.',
    'A gift for someone who already owns everything.',
  ],
  capabilities: [
    { title: 'Understands plain language', body: 'Describe it the way you would to a friend.' },
    { title: 'Respects your budget', body: 'Price caps are treated as hard limits, not hints.' },
    { title: 'Explains its picks', body: 'Every suggestion comes with the reason it was chosen.' },
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
  { title: '30-day returns', body: 'No questions asked' },
  { title: 'Secure checkout', body: '256-bit encryption' },
  { title: 'Genuine products', body: 'Sourced from authorised sellers' },
];
