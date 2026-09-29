import type { Metadata } from 'next';
import { AdminPageHeader } from '@/components/admin/admin-ui';
import { CouponForm } from '@/components/admin/coupon-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'New coupon' };

/**
 * A new coupon.
 *
 * Unlike a new product, there is nothing to load first — no categories or
 * brands to choose from — so there is no failure to render here. Everything
 * that can go wrong happens on save, and the form reports it beside the field
 * it belongs to.
 */
export default function NewCouponPage() {
  return (
    <>
      <AdminPageHeader
        title="New coupon"
        description="Choose the code and what it takes off, then when and how often it can be used."
        back={{ href: '/admin/coupons', label: 'Coupons' }}
      />

      <CouponForm />
    </>
  );
}
