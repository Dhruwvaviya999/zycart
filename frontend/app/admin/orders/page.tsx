import type { Metadata } from 'next';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import {
  AdminEmpty,
  AdminError,
  AdminPageHeader,
  AdminTable,
  StatusBadge,
  Td,
  Th,
  Tr,
} from '@/components/admin/admin-ui';
import { AdminPagination } from '@/components/admin/admin-pagination';
import {
  OrderBulkBar,
  OrderSelectAllCheckbox,
  OrderSelectCheckbox,
  OrderSelectionProvider,
} from '@/components/admin/order-bulk-actions';
import { OrderFilters } from '@/components/admin/order-filters';
import {
  attentionTone,
  humanise,
  orderStatusTone,
  paymentStatusTone,
} from '@/components/admin/status-tones';
import { toErrorMessage } from '@/services/api';
import { getOrders } from '@/services/admin.service';
import { getSessionToken } from '@/lib/server-auth';
import { formatDate, formatPrice } from '@/lib/format';
import type { AdminOrderQuery, AdminOrderRow } from '@/types/admin';
import type { OrderStatus, PaymentMethod, PaymentStatus } from '@/types/order';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Orders' };

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

const PAYMENT_STATUSES = ['PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'REFUND_PENDING', 'REFUNDED'];

/** Unrecognised parameters are dropped rather than forwarded to a strict API. */
function toQuery(params: Params): AdminOrderQuery {
  const page = Number(one(params.page));
  const status = one(params.status);
  const paymentStatus = one(params.paymentStatus);
  const method = one(params.paymentMethod);
  const period = one(params.period);
  const sort = one(params.sort);

  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: 20,
    search: one(params.search)?.trim() || undefined,
    status: ORDER_STATUSES.includes(status ?? '') ? (status as OrderStatus) : undefined,
    paymentStatus: PAYMENT_STATUSES.includes(paymentStatus ?? '')
      ? (paymentStatus as PaymentStatus)
      : undefined,
    paymentMethod: ['COD', 'RAZORPAY'].includes(method ?? '')
      ? (method as PaymentMethod)
      : undefined,
    period: ['7d', '30d', '90d'].includes(period ?? '')
      ? (period as AdminOrderQuery['period'])
      : undefined,
    sort: ['newest', 'oldest', 'total_desc', 'total_asc'].includes(sort ?? '')
      ? (sort as AdminOrderQuery['sort'])
      : undefined,
    attention: one(params.attention) === 'true' ? true : undefined,
  };
}

export default async function AdminOrdersPage({ searchParams }: PageProps<'/admin/orders'>) {
  const params = await searchParams;
  const query = toQuery(params);

  let result;
  try {
    result = await getOrders(query, { token: await getSessionToken() });
  } catch (error) {
    return (
      <>
        <AdminPageHeader title="Orders" />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  const { items, pagination } = result;
  const filtered = Object.keys(params).some((key) => key !== 'page');

  return (
    <>
      <AdminPageHeader
        title="Orders"
        description="Fulfilment and payment are tracked separately — an order can be shipped and unpaid, or paid and pending."
        action={
          query.attention ? (
            <StatusBadge tone="warning" className="self-center">
              Showing orders that need attention
            </StatusBadge>
          ) : undefined
        }
      />

      <OrderFilters />

      {items.length === 0 ? (
        <AdminEmpty
          icon={ShoppingCart}
          title={filtered ? 'No orders match these filters' : 'No orders yet'}
          body={
            filtered
              ? 'Try a wider period, or clear the filters to see everything.'
              : 'Orders will appear here as customers place them.'
          }
        />
      ) : (
        <OrderSelectionProvider selectable={items.map((order) => order.orderNumber)}>
          <AdminTable
            className="hidden lg:block"
            head={
              <>
                <Th className="w-10">
                  <OrderSelectAllCheckbox />
                  <span className="sr-only">Select every order on this page</span>
                </Th>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th align="right">Items</Th>
                <Th align="right">Total</Th>
                <Th>Payment</Th>
                <Th>Status</Th>
                <Th className="hidden xl:table-cell">Placed</Th>
              </>
            }
          >
            {items.map((order) => (
              <Tr key={order.id}>
                <Td>
                  <OrderSelectCheckbox orderNumber={order.orderNumber} />
                </Td>
                <Td>
                  <Link
                    href={`/admin/orders/${order.orderNumber}`}
                    className="focus-ring rounded-sm font-medium"
                  >
                    {order.orderNumber}
                  </Link>
                  <AttentionFlags order={order} />
                </Td>
                <Td>
                  <span className="block max-w-[14rem] truncate">{order.customer.name}</span>
                  {order.customer.email && (
                    <span className="text-caption block max-w-[14rem] truncate text-muted-foreground">
                      {order.customer.email}
                    </span>
                  )}
                </Td>
                <Td align="right" className="tabular-nums text-muted-foreground">
                  {order.itemCount}
                </Td>
                <Td align="right" className="font-medium tabular-nums">
                  {formatPrice(order.total)}
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <StatusBadge tone={paymentStatusTone(order.paymentStatus)}>
                      {humanise(order.paymentStatus)}
                    </StatusBadge>
                    <span className="text-caption text-muted-foreground">
                      {order.paymentMethod === 'COD' ? 'Cash' : 'Online'}
                    </span>
                  </div>
                </Td>
                <Td>
                  <StatusBadge tone={orderStatusTone(order.status)}>
                    {humanise(order.status)}
                  </StatusBadge>
                </Td>
                <Td className="hidden text-muted-foreground xl:table-cell">
                  {formatDate(order.createdAt)}
                </Td>
              </Tr>
            ))}
          </AdminTable>

          {/* Below `lg` the eight columns stop being comparable, so each order
              becomes a card that still leads with what matters. */}
          <ul className="space-y-2 lg:hidden">
            {items.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/admin/orders/${order.orderNumber}`}
                  className="focus-ring block rounded-xl border border-border p-3 transition-colors hover:border-foreground/25"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-small font-medium">{order.orderNumber}</p>
                      <p className="text-caption truncate text-muted-foreground">
                        {order.customer.name} · {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <p className="text-small shrink-0 font-medium tabular-nums">
                      {formatPrice(order.total)}
                    </p>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={orderStatusTone(order.status)}>
                      {humanise(order.status)}
                    </StatusBadge>
                    <StatusBadge tone={paymentStatusTone(order.paymentStatus)}>
                      {humanise(order.paymentStatus)}
                    </StatusBadge>
                    <span className="text-caption text-muted-foreground">
                      {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  <AttentionFlags order={order} />
                </Link>
              </li>
            ))}
          </ul>

          <AdminPagination pagination={pagination} shown={items.length} noun="orders" />

          {/* Selection lives below `lg`, where rows are cards without a
              checkbox column — the bar simply never appears there. */}
          <OrderBulkBar />
        </OrderSelectionProvider>
      )}
    </>
  );
}

/**
 * Why an order is in the attention queue.
 *
 * Computed on the server from stored state, so a row cannot claim a problem the
 * queue does not agree with. Most orders carry none and render nothing.
 */
function AttentionFlags({ order }: { order: AdminOrderRow }) {
  if (order.attention.length === 0) return null;

  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {order.attention.map((flag) => (
        <StatusBadge key={flag.key} tone={attentionTone(flag.severity)}>
          {flag.label}
        </StatusBadge>
      ))}
    </span>
  );
}
