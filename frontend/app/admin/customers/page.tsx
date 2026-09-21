import type { Metadata } from 'next';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { CustomerFilters } from '@/components/admin/customer-filters';
import { toErrorMessage } from '@/services/api';
import { getCustomers } from '@/services/admin.service';
import { getSessionCookie } from '@/lib/server-auth';
import { formatDate, formatPrice } from '@/lib/format';
import type { AdminCustomerQuery, AdminCustomerRow } from '@/types/admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Customers' };

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function toQuery(params: Params): AdminCustomerQuery {
  const page = Number(one(params.page));
  const active = one(params.active);
  const sort = one(params.sort);

  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    limit: 20,
    search: one(params.search)?.trim() || undefined,
    active: active === 'true' ? true : active === 'false' ? false : undefined,
    sort: ['newest', 'oldest', 'name_asc'].includes(sort ?? '')
      ? (sort as AdminCustomerQuery['sort'])
      : undefined,
  };
}

export default async function AdminCustomersPage({ searchParams }: PageProps<'/admin/customers'>) {
  const params = await searchParams;

  let result;
  try {
    result = await getCustomers(toQuery(params), { cookie: await getSessionCookie() });
  } catch (error) {
    return (
      <>
        <AdminPageHeader title="Customers" />
        <AdminError message={toErrorMessage(error)} />
      </>
    );
  }

  const { items, pagination } = result;
  const filtered = Object.keys(params).some((key) => key !== 'page');

  return (
    <>
      <AdminPageHeader
        title="Customers"
        description="Everyone with an account. Spending counts completed orders only — never cancelled ones."
      />

      <CustomerFilters />

      {items.length === 0 ? (
        <AdminEmpty
          icon={Users}
          title={filtered ? 'No customers match these filters' : 'No customers yet'}
          body={
            filtered
              ? 'Try a different search, or clear the filters.'
              : 'Accounts will appear here as people register.'
          }
        />
      ) : (
        <>
          <AdminTable
            className="hidden md:block"
            head={
              <>
                <Th>Customer</Th>
                <Th className="hidden lg:table-cell">Phone</Th>
                <Th align="right">Orders</Th>
                <Th align="right">Spent</Th>
                <Th>Status</Th>
                <Th className="hidden xl:table-cell">Joined</Th>
              </>
            }
          >
            {items.map((customer) => (
              <Tr key={customer.id}>
                <Td>
                  <CustomerCell customer={customer} />
                </Td>
                <Td className="hidden text-muted-foreground lg:table-cell">
                  {customer.phone || '—'}
                </Td>
                <Td align="right" className="tabular-nums">
                  {customer.orderCount}
                </Td>
                <Td align="right" className="font-medium tabular-nums">
                  {formatPrice(customer.totalSpent)}
                </Td>
                <Td>
                  <StatusBadge tone={customer.isActive ? 'success' : 'danger'}>
                    {customer.isActive ? 'Active' : 'Deactivated'}
                  </StatusBadge>
                </Td>
                <Td className="hidden text-muted-foreground xl:table-cell">
                  {formatDate(customer.createdAt)}
                </Td>
              </Tr>
            ))}
          </AdminTable>

          <ul className="space-y-2 md:hidden">
            {items.map((customer) => (
              <li key={customer.id}>
                <Link
                  href={`/admin/customers/${customer.id}`}
                  className="focus-ring flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-foreground/25"
                >
                  <Face customer={customer} />
                  <div className="min-w-0 flex-1">
                    <p className="text-small truncate font-medium">{customer.name}</p>
                    <p className="text-caption truncate text-muted-foreground">{customer.email}</p>
                    <p className="text-caption mt-1 text-muted-foreground">
                      {customer.orderCount} {customer.orderCount === 1 ? 'order' : 'orders'} ·{' '}
                      {formatPrice(customer.totalSpent)}
                    </p>
                  </div>
                  {!customer.isActive && <StatusBadge tone="danger">Off</StatusBadge>}
                </Link>
              </li>
            ))}
          </ul>

          <AdminPagination pagination={pagination} shown={items.length} noun="customers" />
        </>
      )}
    </>
  );
}

function Face({ customer }: { customer: AdminCustomerRow }) {
  const letters = customer.name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return (
    <Avatar className="size-9 shrink-0">
      {customer.avatar && <AvatarImage src={customer.avatar} alt="" />}
      <AvatarFallback className="text-caption">{letters || '?'}</AvatarFallback>
    </Avatar>
  );
}

function CustomerCell({ customer }: { customer: AdminCustomerRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Face customer={customer} />
      <div className="min-w-0">
        <Link
          href={`/admin/customers/${customer.id}`}
          className="focus-ring block truncate rounded-sm font-medium"
        >
          {customer.name}
        </Link>
        <p className="text-caption truncate text-muted-foreground">{customer.email}</p>
      </div>
    </div>
  );
}
