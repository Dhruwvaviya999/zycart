import {
  Activity,
  Boxes,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Siren,
  Star,
  Tag,
  Users,
  Layers,
  Mail,
  RotateCcw,
  Newspaper,
  TicketPercent,
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
 *
 * Phase 12 adds two things and moves nothing. Inventory joins the catalogue,
 * beside the products it counts. Operations is a new group, because running the
 * day — what needs attention, what changed and who changed it — is a different
 * job from maintaining the catalogue, and burying an exception queue under
 * "Commerce" would be how it stops getting looked at.
 *
 * There are deliberately no counts on these links. A badge has to be fresh to
 * be trusted, every page here is server-rendered per request, and fetching
 * counts on every navigation to decorate a sidebar would cost more than it
 * tells anybody. The dashboard and the operations page carry the numbers, and
 * they are the pages an operator opens to read them.
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
      { href: '/admin/inventory', label: 'Inventory', icon: Boxes, nested: true },
      { href: '/admin/categories', label: 'Categories', icon: Layers },
      { href: '/admin/brands', label: 'Brands', icon: Tag },
    ],
  },
  {
    label: 'Commerce',
    items: [
      { href: '/admin/orders', label: 'Orders', icon: ShoppingCart, nested: true },
      /**
       * Beside orders rather than under Operations.
       *
       * A return is a commercial transaction with a customer at the other end
       * of it, and the person working the return queue is the same person
       * working the order queue. Filing it under Operations would have put a
       * customer-facing workflow next to the exception panels nobody opens
       * unless something is wrong.
       */
      { href: '/admin/returns', label: 'Returns', icon: RotateCcw, nested: true },
      /**
       * With orders rather than with the catalogue.
       *
       * A coupon changes what an order costs, not what the shop sells, and the
       * question that brings somebody to it — "why did this customer pay less
       * than the list price?" — is asked by whoever is looking at the order.
       */
      { href: '/admin/coupons', label: 'Coupons', icon: TicketPercent, nested: true },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/admin/customers', label: 'Customers', icon: Users, nested: true },
      { href: '/admin/reviews', label: 'Reviews', icon: Star, nested: true },
      /**
       * Beside customers, and deliberately not merged with them.
       *
       * Anybody may join the newsletter without an account, and an address on
       * the list is a different fact from an account that happens to share it.
       * It is still a list of people who asked to hear from the store, which is
       * what this group is — not a campaign tool, which ZyCart does not have.
       */
      { href: '/admin/subscribers', label: 'Subscribers', icon: Newspaper },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/admin/operations', label: 'Needs attention', icon: Siren },
      /**
       * Under Operations rather than beside Orders.
       *
       * A delivery record is not a commercial object — nobody works a queue of
       * emails the way they work a queue of returns. It is infrastructure that
       * occasionally needs a person, which is exactly what this group is for,
       * and it sits next to the activity log because both answer "what has the
       * system been doing?".
       */
      { href: '/admin/notifications', label: 'Emails', icon: Mail, nested: true },
      { href: '/admin/activity', label: 'Activity log', icon: Activity },
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
  if (!item.nested) return pathname === item.href;

  /**
   * The segment boundary matters: a bare `startsWith` would light "Orders" on
   * a hypothetical `/admin/orders-archive`, which is a different section that
   * merely begins with the same letters.
   */
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
