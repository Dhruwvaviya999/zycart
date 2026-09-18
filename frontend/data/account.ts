/** Placeholder account data. Phase 4 replaces this with the authenticated user. */

export interface MockOrder {
  id: string;
  placedOn: string;
  status: 'Delivered' | 'In transit' | 'Processing' | 'Cancelled';
  total: number;
  itemCount: number;
  productIds: string[];
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
  email: 'owner@shubhamtanks.com',
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
    productIds: ['p-009', 'p-017'],
  },
  {
    id: 'ZY-10344',
    placedOn: '2026-08-21',
    status: 'Delivered',
    total: 8495,
    itemCount: 1,
    productIds: ['p-001'],
  },
  {
    id: 'ZY-10219',
    placedOn: '2026-07-30',
    status: 'Delivered',
    total: 27198,
    itemCount: 3,
    productIds: ['p-022', 'p-034', 'p-030'],
  },
  {
    id: 'ZY-10077',
    placedOn: '2026-06-12',
    status: 'Cancelled',
    total: 4999,
    itemCount: 1,
    productIds: ['p-008'],
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
  { title: 'Price drop alerts', body: 'Tell me when a saved product is discounted.', enabled: true },
  { title: 'New arrivals', body: 'A weekly digest of what has just landed.', enabled: false },
  { title: 'Personalised picks', body: 'Use my browsing history to tailor suggestions.', enabled: true },
];
