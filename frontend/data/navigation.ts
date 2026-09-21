/**
 * What a navigation item considers "here".
 *
 * Kept next to the links rather than in the header, because the answer is a
 * property of the destination, not of the component drawing it — the desktop
 * bar and the mobile sheet both read it, and neither gets to disagree.
 */
export interface NavMatch {
  /** Pathnames that are exactly this destination. */
  paths?: string[];
  /** Pathnames nested under this destination — `/products` belongs to Shop. */
  prefixes?: string[];
  /** Search params that must all be present with these values. */
  query?: Record<string, string>;
  /** Location hash, including the `#`. */
  hash?: string;
}

export interface NavLink {
  label: string;
  href: string;
  /** Omit to make the item purely a link, never an active destination. */
  match?: NavMatch;
}

export interface NavGroup {
  label: string;
  links: NavLink[];
}

export const primaryNav: NavLink[] = [
  {
    label: 'Shop',
    href: '/shop',
    // A product detail page is inside the shop, so the indicator stays on Shop
    // rather than vanishing the moment a shopper opens something.
    match: { paths: ['/shop'], prefixes: ['/products'] },
  },
  {
    label: 'Categories',
    href: '/#categories',
    match: { paths: ['/'], hash: '#categories' },
  },
  {
    label: 'Deals',
    href: '/shop?sort=discount',
    match: { paths: ['/shop'], query: { sort: 'discount' } },
  },
  {
    label: 'New Arrivals',
    href: '/shop?sort=newest',
    match: { paths: ['/shop'], query: { sort: 'newest' } },
  },
];

export const accountNav: NavLink[] = [
  { label: 'Overview', href: '/account' },
  { label: 'Profile', href: '/account/profile' },
  { label: 'Wishlist', href: '/wishlist' },
  { label: 'Addresses', href: '/account/addresses' },
  { label: 'Settings', href: '/account/settings' },
];

export const footerNav: NavGroup[] = [
  {
    label: 'Shop',
    links: [
      { label: 'All products', href: '/shop' },
      { label: 'AI Shopping', href: '/ai-shopping' },
      { label: 'New arrivals', href: '/shop?sort=newest' },
      { label: 'Best sellers', href: '/shop?sort=rating' },
      { label: 'Deals', href: '/shop?sort=discount' },
      { label: 'Gift cards', href: '/shop' },
    ],
  },
  {
    label: 'Categories',
    links: [
      { label: 'Electronics', href: '/shop?category=electronics' },
      { label: 'Fashion', href: '/shop?category=fashion' },
      { label: 'Footwear', href: '/shop?category=footwear' },
      { label: 'Accessories', href: '/shop?category=accessories' },
      { label: 'Home & Beauty', href: '/shop?category=home' },
    ],
  },
  {
    label: 'Customer service',
    links: [
      { label: 'Track an order', href: '/account' },
      { label: 'Shipping & delivery', href: '/account' },
      { label: 'Returns & refunds', href: '/account' },
      { label: 'Size guide', href: '/shop' },
      { label: 'Contact us', href: '/account/settings' },
    ],
  },
  {
    label: 'About',
    links: [
      { label: 'Our story', href: '/' },
      { label: 'How we choose', href: '/' },
      { label: 'Careers', href: '/' },
      { label: 'Press', href: '/' },
    ],
  },
  {
    label: 'Policies',
    links: [
      { label: 'Privacy policy', href: '/' },
      { label: 'Terms of service', href: '/' },
      { label: 'Refund policy', href: '/' },
      { label: 'Cookie preferences', href: '/' },
    ],
  },
];

export const socialLinks: NavLink[] = [
  { label: 'Instagram', href: 'https://instagram.com' },
  { label: 'X', href: 'https://x.com' },
  { label: 'YouTube', href: 'https://youtube.com' },
  { label: 'LinkedIn', href: 'https://linkedin.com' },
];

export const recentSearches = ['running shoes', 'noise cancelling', 'linen shirt'];

export const popularSearches = [
  'air max',
  'wireless headphones',
  'merino cardigan',
  'dive watch',
  'skincare set',
  'insulated bottle',
];
