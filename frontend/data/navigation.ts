export interface NavLink {
  label: string;
  href: string;
}

export interface NavGroup {
  label: string;
  links: NavLink[];
}

export const primaryNav: NavLink[] = [
  { label: 'Shop', href: '/shop' },
  { label: 'Categories', href: '/#categories' },
  { label: 'Deals', href: '/shop?sort=discount' },
  { label: 'New Arrivals', href: '/shop?sort=newest' },
];

export const accountNav: NavLink[] = [
  { label: 'Profile', href: '/account?tab=profile' },
  { label: 'Orders', href: '/account?tab=orders' },
  { label: 'Wishlist', href: '/wishlist' },
  { label: 'Addresses', href: '/account?tab=addresses' },
  { label: 'Settings', href: '/account?tab=settings' },
];

export const footerNav: NavGroup[] = [
  {
    label: 'Shop',
    links: [
      { label: 'All products', href: '/shop' },
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
      { label: 'Track an order', href: '/account?tab=orders' },
      { label: 'Shipping & delivery', href: '/account?tab=orders' },
      { label: 'Returns & refunds', href: '/account?tab=orders' },
      { label: 'Size guide', href: '/shop' },
      { label: 'Contact us', href: '/account?tab=settings' },
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
