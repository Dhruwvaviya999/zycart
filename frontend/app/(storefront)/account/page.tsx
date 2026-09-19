import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Heart, MapPin, Package, Settings, type LucideIcon } from 'lucide-react';
import { AccountPanel } from '@/components/account/account-panel';
import { getSessionUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Account',
  description: 'Your ZyCart account overview.',
};

interface Shortcut {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export default async function AccountPage() {
  // Resolved again rather than threaded down: the layout has already made the
  // request, and Next dedupes it within a single render pass.
  const user = await getSessionUser();

  const addressCount = user?.addresses.length ?? 0;

  const shortcuts: Shortcut[] = [
    {
      href: '/account/profile',
      label: 'Profile',
      description: user?.phone ? 'Name, phone and avatar' : 'Add a phone number for deliveries',
      icon: Package,
    },
    {
      href: '/account/addresses',
      label: 'Addresses',
      description:
        addressCount === 0
          ? 'No saved addresses yet'
          : `${addressCount} saved ${addressCount === 1 ? 'address' : 'addresses'}`,
      icon: MapPin,
    },
    {
      href: '/wishlist',
      label: 'Wishlist',
      description: 'Products you have saved',
      icon: Heart,
    },
    {
      href: '/account/settings',
      label: 'Settings',
      description: 'Password and appearance',
      icon: Settings,
    },
  ];

  return (
    <div className="space-y-10">
      <AccountPanel
        title={`Welcome back, ${user?.firstName ?? 'there'}`}
        description="Everything about your ZyCart account lives here."
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {shortcuts.map(({ href, label, description, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="focus-ring group flex h-full items-start gap-3.5 rounded-2xl border border-border p-5 transition-colors hover:border-foreground/25 hover:bg-surface"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-subtle text-brand">
                  <Icon className="size-[18px]" aria-hidden />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="text-small block font-semibold">{label}</span>
                  <span className="text-caption mt-0.5 block text-muted-foreground">
                    {description}
                  </span>
                </span>

                <ArrowRight
                  className="mt-2.5 size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-(--ease-brand) group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </AccountPanel>

      <AccountPanel
        title="Orders"
        description="Your order history will appear here once checkout is available."
      >
        {/* No fabricated orders: ordering is a later phase, and an empty state is
            the honest representation of an account that has never ordered. */}
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center">
          <div className="mb-4 grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Package className="size-5" aria-hidden />
          </div>
          <p className="text-small font-semibold">No orders yet</p>
          <p className="text-caption mt-1.5 max-w-sm text-muted-foreground">
            Checkout is not open yet. When it is, everything you order will be tracked here.
          </p>
          <Link
            href="/shop"
            className="focus-ring text-small mt-5 rounded-md font-medium text-brand hover:underline"
          >
            Browse the shop
          </Link>
        </div>
      </AccountPanel>
    </div>
  );
}
