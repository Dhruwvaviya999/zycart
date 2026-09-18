/** Placeholder account data. Phase 4 replaces this with the authenticated user. */

export interface MockOrder {
  id: string;
  placedOn: string;
  status: 'Delivered' | 'In transit' | 'Processing' | 'Cancelled';
  total: number;
  itemCount: number;
  /**
   * Orders snapshot what was bought, the way a real order history does, so they
   * never depend on a product still existing in the catalogue.
   */
  items: { name: string; image: string }[];
}

export interface MockAddress {
  id: string;
  label: string;
  name: string;
  lines: string[];
  phone: string;
  isDefault: boolean;
}

export const accountProfile = {
  name: 'Dhruw Vaviya',
  email: 'dhruw.vaviya@example.com',
  initials: 'DV',
  memberSince: '2025-11-04',
  tier: 'ZyCart Plus',
};

export const orders: MockOrder[] = [
  {
    id: 'ZY-10482',
    placedOn: '2026-09-09',
    status: 'In transit',
    total: 19489,
    itemCount: 2,
    items: [
      {
        name: 'Studio One Over-Ear Headphones',
        image:
          'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80',
      },
      {
        name: 'Heavyweight Essential Tee',
        image:
          'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?auto=format&fit=crop&w=900&q=80',
      },
    ],
  },
  {
    id: 'ZY-10344',
    placedOn: '2026-08-21',
    status: 'Delivered',
    total: 8495,
    itemCount: 1,
    items: [
      {
        name: 'Air Max Heritage Runner',
        image:
          'https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?auto=format&fit=crop&w=900&q=80',
      },
    ],
  },
  {
    id: 'ZY-10219',
    placedOn: '2026-07-30',
    status: 'Delivered',
    total: 27198,
    itemCount: 3,
    items: [
      {
        name: 'Meridian Automatic Diver',
        image:
          'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=900&q=80',
      },
      {
        name: 'Insulated Bottle 750 ml',
        image:
          'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=80',
      },
      {
        name: 'Daily Skincare Set',
        image:
          'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=900&q=80',
      },
    ],
  },
  {
    id: 'ZY-10077',
    placedOn: '2026-06-12',
    status: 'Cancelled',
    total: 4999,
    itemCount: 1,
    items: [
      {
        name: 'Street Runner 90',
        image:
          'https://images.unsplash.com/photo-1595341888016-a392ef81b7de?auto=format&fit=crop&w=900&q=80',
      },
    ],
  },
];

export const addresses: MockAddress[] = [
  {
    id: 'addr-1',
    label: 'Home',
    name: 'Dhruw Vaviya',
    lines: ['12 Satellite Road', 'Vastrapur', 'Ahmedabad, Gujarat 380015'],
    phone: '+91 98250 00000',
    isDefault: true,
  },
  {
    id: 'addr-2',
    label: 'Office',
    name: 'Dhruw Vaviya',
    lines: ['4th Floor, Titanium Square', 'Thaltej Cross Road', 'Ahmedabad, Gujarat 380054'],
    phone: '+91 98250 00001',
    isDefault: false,
  },
];

export const accountSettings = [
  {
    title: 'Order updates',
    body: 'Shipping and delivery notifications by email and SMS.',
    enabled: true,
  },
  {
    title: 'Price drop alerts',
    body: 'Tell me when a saved product is discounted.',
    enabled: true,
  },
  { title: 'New arrivals', body: 'A weekly digest of what has just landed.', enabled: false },
  {
    title: 'Personalised picks',
    body: 'Use my browsing history to tailor suggestions.',
    enabled: true,
  },
];
