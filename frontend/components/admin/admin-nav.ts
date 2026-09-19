import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Star,
  Tag,
  Users,
  Layers,
  type LucideIcon,
} from 'lucide-react';

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** True when the section owns its sub-routes as well as its index. */
  nested?: boolean;
}

export interface AdminNavGroup {
  label: string | null;
  items: AdminNavItem[];
}

/**
 * The shape of the console, in one place.
 *
 * Grouped rather than flat because seven equal-weight links teach an operator
 * nothing about how the system is organised, and because the groups match how
 * the work actually divides: someone managing the catalogue is rarely the same
 * person chasing an order. "Overview" sits outside a group — it is the door,
 * not a department.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: null,
    items: [{ href: '/admin', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Catalogue',
    items: [
      { href: '/admin/products', label: 'Products', icon: Package, nested: true },
      { href: '/admin/categories', label: 'Categories', icon: Layers },
      { href: '/admin/brands', label: 'Brands', icon: Tag },
    ],
  },
  {
    label: 'Commerce',
    items: [{ href: '/admin/orders', label: 'Orders', icon: ShoppingCart, nested: true }],
  },
  {
    label: 'People',
    items: [
      { href: '/admin/customers', label: 'Customers', icon: Users, nested: true },
      { href: '/admin/reviews', label: 'Reviews', icon: Star, nested: true },
    ],
  },
];

/**
 * Whether a nav item owns the current path.
 *
 * `/admin` has to match exactly or it would light up on every page; the
 * sections match their sub-routes so a product's edit page still shows
 * "Products" as where you are.
 */
export function isActiveNav(item: AdminNavItem, pathname: string): boolean {
  if (item.href === '/admin') return pathname === '/admin';
  return item.nested ? pathname.startsWith(item.href) : pathname === item.href;
}
