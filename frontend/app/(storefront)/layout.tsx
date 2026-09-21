import { StorefrontChrome } from '@/components/layout/storefront-chrome';

/**
 * Everything a shopper sees.
 *
 * A route group, so the URLs are unchanged — `/`, `/shop`, `/products/…` and
 * the rest are exactly where they were. The grouping exists only to say which
 * routes get the shop's chrome, which is the thing the admin console must not
 * inherit.
 */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <StorefrontChrome>{children}</StorefrontChrome>;
}
