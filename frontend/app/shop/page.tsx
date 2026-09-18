import type { Metadata } from 'next';
import { ShopClient } from '@/components/shop/shop-client';
import { categories } from '@/data/categories';
import { brands } from '@/data/products';
import type { ShopFilters } from '@/components/shop/use-shop-filters';
import type { CategorySlug, SortKey } from '@/types/product';

export const metadata: Metadata = {
  title: 'Shop',
  description:
    'Browse the full ZyCart catalogue — filter by category, brand, price, rating and availability.',
};

const SORT_KEYS: SortKey[] = ['featured', 'newest', 'price-asc', 'price-desc', 'rating', 'discount'];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Turns the query string into initial filter state, ignoring anything unknown. */
function parseFilters(params: Record<string, string | string[] | undefined>): Partial<ShopFilters> {
  const initial: Partial<ShopFilters> = {};

  const query = first(params.q);
  if (query) initial.query = query;

  const category = first(params.category);
  if (category && categories.some((entry) => entry.slug === category)) {
    initial.categories = [category as CategorySlug];
  }

  const brand = first(params.brand);
  if (brand && brands.includes(brand)) initial.brands = [brand];

  const sort = first(params.sort);
  if (sort && SORT_KEYS.includes(sort as SortKey)) initial.sort = sort as SortKey;

  return initial;
}

export default async function ShopPage({ searchParams }: PageProps<'/shop'>) {
  const params = await searchParams;
  return <ShopClient initial={parseFilters(params)} />;
}
