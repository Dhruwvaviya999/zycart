import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  IndianRupee,
  Package,
  ShoppingCart,
  Star,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminEmpty, AdminError, AdminPageHeader, StatusBadge } from '@/components/admin/admin-ui';
import { RevenueChart } from '@/components/admin/revenue-chart';
import { orderStatusTone, paymentStatusTone } from '@/components/admin/status-tones';
import { toErrorMessage } from '@/services/api';
import { getDashboard } from '@/services/admin.service';
import { getSessionCookie } from '@/lib/server-auth';
import { formatDate, formatPrice } from '@/lib/format';
import type { AdminDashboard } from '@/types/admin';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Overview' };

/**
 * The dashboard.
 *
 * Everything on it is a real aggregation over the real collections — there is
 * no placeholder number anywhere on this page. Where a metric has nothing
 * behind it yet, the panel says so in words rather than showing a confident
 * zero that an operator would have to interpret.
 *
 * Rendered on the server: one request, computed in MongoDB, no client-side
 * fetching waterfall on the first screen anybody sees.
 */
export default async function AdminDashboardPage({ searchParams }: PageProps<'/admin'>) {
  const params = await searchParams;
  const raw = Array.isArray(params.period) ? params.period[0] : params.period;
  const period: '7d' | '30d' = raw === '7d' ? '7d' : '30d';

  let data: AdminDashboard;
  try {
    data = await getDashboard(period, { cookie: await getSessionCookie() });
  } catch (error) {
    return (
      <>
        <AdminPageHeader title="Overview" />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Overview"
        description={`Store performance over the last ${data.period.days} days.`}
        action={<PeriodToggle period={period} />}
      />

      <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Revenue"
          icon={IndianRupee}
          value={formatPrice(data.revenue.value)}
          metric={data.revenue}
          hint="Paid online, or cash on delivery once delivered"
        />
        <MetricCard
          label="Orders"
          icon={ShoppingCart}
          value={data.orders.value.toLocaleString('en-IN')}
          metric={data.orders}
          hint="Every order placed in the period"
        />
        <MetricCard
          label="New customers"
          icon={Users}
          value={data.customers.value.toLocaleString('en-IN')}
          metric={data.customers}
          hint="Accounts registered in the period"
        />
        <MetricCard
          label="Products"
          icon={Package}
          value={data.catalogue.activeProducts.toLocaleString('en-IN')}
          hint={`${data.catalogue.products} total · ${data.catalogue.outOfStock} out of stock`}
        />
      </section>

      <NeedsAttention attention={data.attention} />

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="Revenue" description={`Last ${data.period.days} days`}>
          <RevenueChart points={data.revenueSeries} days={data.period.days} />
        </Panel>

        <Panel title="Orders by status" description="All time">
          <OrdersByStatus counts={data.ordersByStatus} />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel
          title="Recent orders"
          action={{ href: '/admin/orders', label: 'All orders' }}
        >
          <RecentOrders orders={data.recentOrders} />
        </Panel>

        <div className="grid gap-4">
          <Panel
            title="Top sellers"
            description={`By units sold, last ${data.period.days} days`}
          >
            <TopProducts products={data.topProducts} />
          </Panel>

          <Panel title="Low stock" action={{ href: '/admin/products?stock=low_stock', label: 'View' }}>
            <LowStock products={data.lowStockProducts} />
          </Panel>
        </div>
      </div>
    </>
  );
}

function PeriodToggle({ period }: { period: '7d' | '30d' }) {
  return (
    <div role="group" aria-label="Period" className="flex items-center gap-1">
      {(['7d', '30d'] as const).map((value) => (
        <Button
          key={value}
          size="sm"
          variant={period === value ? 'secondary' : 'ghost'}
          render={<Link href={`/admin?period=${value}`} scroll={false} />}
          aria-current={period === value ? 'true' : undefined}
        >
          {value === '7d' ? '7 days' : '30 days'}
        </Button>
      ))}
    </div>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface/40 p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-small font-semibold">{title}</h2>
          {description && <p className="text-caption mt-0.5 text-muted-foreground">{description}</p>}
        </div>
        {action && (
          <Link
            href={action.href}
            className="focus-ring text-caption inline-flex items-center gap-1 rounded-md font-medium text-brand hover:underline"
          >
            {action.label}
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  metric,
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  metric?: { value: number; previous: number };
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>

      <p className="text-h3 mt-2 tabular-nums">{value}</p>

      {metric && <Trend current={metric.value} previous={metric.previous} />}
      {hint && <p className="text-caption mt-1.5 text-pretty text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Change against the previous window of the same length.
 *
 * Says "no comparison yet" rather than "+100%" when there is nothing to compare
 * against — a percentage computed from zero is arithmetic, not information.
 */
function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    return (
      <p className="text-caption mt-1 text-muted-foreground">
        {current > 0 ? 'No comparison for the previous period' : ''}
      </p>
    );
  }

  const change = Math.round(((current - previous) / previous) * 100);
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <p
      className={cn(
        'text-caption mt-1 inline-flex items-center gap-1 font-medium',
        up ? 'text-success' : 'text-destructive',
      )}
    >
      <Icon className="size-3" aria-hidden />
      {up ? '+' : ''}
      {change}%
      <span className="font-normal text-muted-foreground">vs previous period</span>
    </p>
  );
}

/** Only the counts that have something to do about them, and only when non-zero. */
function NeedsAttention({ attention }: { attention: AdminDashboard['attention'] }) {
  const items = [
    {
      count: attention.pendingOrders,
      label: 'order awaiting confirmation',
      plural: 'orders awaiting confirmation',
      href: '/admin/orders?status=PENDING',
    },
    {
      count: attention.unpaidOnlineOrders,
      label: 'online order not yet paid',
      plural: 'online orders not yet paid',
      href: '/admin/orders?paymentStatus=FAILED',
    },
    {
      count: attention.pendingReviews,
      label: 'review awaiting moderation',
      plural: 'reviews awaiting moderation',
      href: '/admin/reviews?status=PENDING',
    },
  ].filter((item) => item.count > 0);

  if (items.length === 0) return null;

  return (
    <section
      aria-label="Needs attention"
      className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3"
    >
      <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="focus-ring text-caption rounded-full bg-background px-2.5 py-1 font-medium transition-colors hover:bg-muted"
        >
          {item.count} {item.count === 1 ? item.label : item.plural}
        </Link>
      ))}
    </section>
  );
}

function OrdersByStatus({ counts }: { counts: AdminDashboard['ordersByStatus'] }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  if (total === 0) {
    return <AdminEmpty icon={ShoppingCart} title="No orders yet" />;
  }

  return (
    <ul className="space-y-2.5">
      {Object.entries(counts).map(([status, count]) => {
        const percent = Math.round((count / total) * 100);

        return (
          <li key={status}>
            <Link
              href={`/admin/orders?status=${status}`}
              className="focus-ring block rounded-md p-1 transition-colors hover:bg-muted/60"
            >
              <span className="flex items-baseline justify-between gap-2">
                <StatusBadge tone={orderStatusTone(status)}>{label(status)}</StatusBadge>
                <span className="text-caption tabular-nums text-muted-foreground">
                  {count} · {percent}%
                </span>
              </span>
              <span
                aria-hidden
                className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full rounded-full bg-brand/60"
                  style={{ width: `${percent}%` }}
                />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function RecentOrders({ orders }: { orders: AdminDashboard['recentOrders'] }) {
  if (orders.length === 0) {
    return <AdminEmpty icon={ShoppingCart} title="No orders yet" body="Orders will appear here as customers place them." />;
  }

  return (
    <ul className="divide-y divide-border">
      {orders.map((order) => (
        <li key={order.id}>
          <Link
            href={`/admin/orders/${order.orderNumber}`}
            className="focus-ring flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md py-2.5 transition-colors hover:bg-muted/40"
          >
            <span className="text-small min-w-0 flex-1 font-medium">
              <span className="block truncate">{order.customer}</span>
              <span className="text-caption block truncate font-normal text-muted-foreground">
                {order.orderNumber} · {formatDate(order.createdAt)}
              </span>
            </span>

            <StatusBadge tone={orderStatusTone(order.status)}>{label(order.status)}</StatusBadge>
            <StatusBadge tone={paymentStatusTone(order.paymentStatus)}>
              {label(order.paymentStatus)}
            </StatusBadge>

            <span className="text-small shrink-0 font-medium tabular-nums">
              {formatPrice(order.total)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TopProducts({ products }: { products: AdminDashboard['topProducts'] }) {
  if (products.length === 0) {
    return (
      <AdminEmpty
        icon={Star}
        title="Nothing sold yet"
        body="Top sellers are measured from completed orders, not from the best-seller flag."
      />
    );
  }

  return (
    <ol className="space-y-3">
      {products.map((product, index) => (
        <li key={product.id ?? product.name} className="flex items-center gap-3">
          <span className="text-caption w-4 shrink-0 tabular-nums text-muted-foreground">
            {index + 1}
          </span>

          <span className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-background">
            {product.image && (
              <Image src={product.image} alt="" fill sizes="36px" className="object-cover" />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="text-small block truncate font-medium">{product.name}</span>
            <span className="text-caption block text-muted-foreground">
              {product.unitsSold} sold · {formatPrice(product.revenue)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function LowStock({ products }: { products: AdminDashboard['lowStockProducts'] }) {
  if (products.length === 0) {
    return <AdminEmpty icon={Package} title="Nothing running low" body="Every active product has healthy stock." />;
  }

  return (
    <ul className="space-y-2.5">
      {products.map((product) => (
        <li key={product.id}>
          <Link
            href={`/admin/products/${product.id}`}
            className="focus-ring flex items-center gap-3 rounded-md py-1 transition-colors hover:bg-muted/40"
          >
            <span className="min-w-0 flex-1">
              <span className="text-small block truncate font-medium">{product.name}</span>
              <span className="text-caption block text-muted-foreground">{product.sku}</span>
            </span>
            <StatusBadge tone={product.stock === 0 ? 'danger' : 'warning'}>
              {product.stock === 0 ? 'Out of stock' : `${product.stock} left`}
            </StatusBadge>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** PENDING → Pending. Enum values are for the database, not for people. */
function label(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
}
