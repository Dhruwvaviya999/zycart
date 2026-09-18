'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import {
  Heart,
  MapPin,
  Package,
  Plus,
  Settings,
  ShieldCheck,
  User,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Breadcrumbs } from '@/components/common/breadcrumbs';
import { EmptyState } from '@/components/common/empty-state';
import { Container } from '@/components/layout/container';
import { accountProfile, accountSettings, addresses, orders } from '@/data/account';
import { useWishlistStore } from '@/store/wishlist-store';
import { formatDate, formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

type TabKey = 'profile' | 'orders' | 'wishlist' | 'addresses' | 'settings';

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'orders', label: 'Orders', icon: Package },
  { key: 'wishlist', label: 'Wishlist', icon: Heart },
  { key: 'addresses', label: 'Addresses', icon: MapPin },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const STATUS_TONE: Record<string, string> = {
  Delivered: 'bg-success/12 text-success',
  'In transit': 'bg-brand-subtle text-brand',
  Processing: 'bg-muted text-muted-foreground',
  Cancelled: 'bg-destructive/10 text-destructive',
};

export function AccountClient({ initialTab }: { initialTab: TabKey }) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const wishlistCount = useWishlistStore((state) => state.ids.length);

  return (
    <Container className="py-8 sm:py-10">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Account' }]} />

      <header className="mt-5 flex flex-wrap items-center gap-4">
        <Avatar className="size-14">
          <AvatarFallback className="bg-brand-subtle text-h4 text-brand">
            {accountProfile.initials}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <h1 className="text-h2">{accountProfile.name}</h1>
          <p className="text-small text-muted-foreground">
            Member since {formatDate(accountProfile.memberSince)}
          </p>
        </div>

        <span className="text-caption ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-3 py-1.5 font-semibold text-brand">
          <ShieldCheck className="size-3.5" aria-hidden />
          {accountProfile.tier}
        </span>
      </header>

      <div className="mt-9 grid gap-9 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Account sections">
          <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-1 lg:px-0">
            {TABS.map(({ key, label, icon: Icon }) => (
              <li key={key} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setTab(key)}
                  aria-current={tab === key ? 'page' : undefined}
                  className={cn(
                    'focus-ring text-small flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 font-medium transition-colors',
                    tab === key
                      ? 'bg-brand-subtle text-brand'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                  {key === 'wishlist' && wishlistCount > 0 && (
                    <span className="text-caption ml-auto tabular-nums">{wishlistCount}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {tab === 'profile' && <ProfilePanel />}
          {tab === 'orders' && <OrdersPanel />}
          {tab === 'wishlist' && <WishlistPanel />}
          {tab === 'addresses' && <AddressesPanel />}
          {tab === 'settings' && <SettingsPanel />}
        </div>
      </div>
    </Container>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-h3">{title}</h2>
      <p className="text-small mt-1.5 text-muted-foreground">{description}</p>
      <div className="mt-7">{children}</div>
    </section>
  );
}

function ProfilePanel() {
  return (
    <Panel title="Profile" description="Your personal details, as they appear on orders.">
      <form className="grid max-w-xl gap-5 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <Field id="first-name" label="First name" defaultValue="Dhruw" />
        <Field id="last-name" label="Last name" defaultValue="Vaviya" />
        <Field
          id="email"
          label="Email"
          type="email"
          defaultValue={accountProfile.email}
          className="sm:col-span-2"
        />
        <Field id="phone" label="Phone" type="tel" defaultValue="+91 98250 00000" />
        <Field id="dob" label="Date of birth" type="date" defaultValue="1999-05-12" />

        <div className="sm:col-span-2">
          <Button size="cta" variant="brand" type="submit" disabled>
            Save changes
          </Button>
          <p className="text-caption mt-2.5 text-muted-foreground">
            Editing is disabled until accounts are connected in a later phase.
          </p>
        </div>
      </form>
    </Panel>
  );
}

function Field({
  id,
  label,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { id: string; label: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="h-11 rounded-xl" {...props} />
    </div>
  );
}

function OrdersPanel() {
  return (
    <Panel title="Orders" description="Every order placed on this account.">
      <ul className="space-y-4">
        {orders.map((order) => (
          <li key={order.id} className="rounded-2xl border border-border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-small font-semibold">{order.id}</p>
                <p className="text-caption text-muted-foreground">
                  Placed {formatDate(order.placedOn)} · {order.itemCount}{' '}
                  {order.itemCount === 1 ? 'item' : 'items'}
                </p>
              </div>

              <span
                className={cn(
                  'text-caption rounded-full px-2.5 py-1 font-semibold',
                  STATUS_TONE[order.status],
                )}
              >
                {order.status}
              </span>
            </div>

            <Separator className="my-4" />

            <div className="flex flex-wrap items-center gap-4">
              <ul className="flex -space-x-3">
                {order.items.map((item) => (
                  <li key={item.name}>
                    <span className="relative block size-12 overflow-hidden rounded-xl bg-surface ring-2 ring-background">
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </span>
                  </li>
                ))}
              </ul>

              <p className="text-price ml-auto">{formatPrice(order.total)}</p>
              <Button size="sm" variant="outline">
                View details
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function WishlistPanel() {
  const ids = useWishlistStore((state) => state.ids);
  const hydrated = useWishlistStore((state) => state.hydrated);

  if (hydrated && ids.length === 0) {
    return (
      <Panel title="Wishlist" description="Products you have saved for later.">
        <EmptyState
          icon={Heart}
          title="Nothing saved yet."
          body="Tap the heart on any product and it will appear here."
          action={{ label: 'Browse products', href: '/shop' }}
        />
      </Panel>
    );
  }

  return (
    <Panel title="Wishlist" description="Products you have saved for later.">
      <p className="text-body text-muted-foreground">
        {hydrated ? `${ids.length} saved.` : 'Loading...'}{' '}
        <Link href="/wishlist" className="focus-ring rounded-sm font-medium text-brand underline">
          Open the full wishlist
        </Link>
      </p>
    </Panel>
  );
}

function AddressesPanel() {
  return (
    <Panel title="Addresses" description="Where your orders are delivered.">
      <ul className="grid gap-4 sm:grid-cols-2">
        {addresses.map((address) => (
          <li key={address.id} className="rounded-2xl border border-border p-5">
            <div className="flex items-center gap-2">
              <p className="text-small font-semibold">{address.label}</p>
              {address.isDefault && (
                <span className="text-caption rounded-full bg-brand-subtle px-2 py-0.5 font-medium text-brand">
                  Default
                </span>
              )}
            </div>

            <address className="text-small mt-3 space-y-0.5 text-muted-foreground not-italic">
              <p className="text-foreground">{address.name}</p>
              {address.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p className="pt-1">{address.phone}</p>
            </address>

            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline">
                Edit
              </Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground">
                Remove
              </Button>
            </div>
          </li>
        ))}

        <li>
          <button
            type="button"
            className="focus-ring text-small flex h-full min-h-[11rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
          >
            <Plus className="size-5" aria-hidden />
            Add a new address
          </button>
        </li>
      </ul>
    </Panel>
  );
}

function SettingsPanel() {
  return (
    <Panel title="Settings" description="Notifications and personalisation preferences.">
      <ul className="max-w-2xl divide-y divide-border rounded-2xl border border-border">
        {accountSettings.map((setting) => (
          <li key={setting.title} className="flex items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-small font-medium">{setting.title}</p>
              <p className="text-caption mt-0.5 text-muted-foreground">{setting.body}</p>
            </div>

            <span
              aria-hidden
              className={cn(
                'relative h-6 w-10 shrink-0 rounded-full transition-colors',
                setting.enabled ? 'bg-brand' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'absolute top-1 size-4 rounded-full bg-background shadow-sm transition-all',
                  setting.enabled ? 'left-5' : 'left-1',
                )}
              />
            </span>
            <span className="sr-only">{setting.enabled ? 'Enabled' : 'Disabled'}</span>
          </li>
        ))}
      </ul>

      <p className="text-caption mt-4 text-muted-foreground">
        Preferences are read-only until accounts are connected in a later phase.
      </p>
    </Panel>
  );
}
