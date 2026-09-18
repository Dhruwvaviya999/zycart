import type { SortKey } from '@/types/product';

/** The filter state, which lives entirely in the URL so any view is shareable. */
export interface ShopFilters {
  query: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStockOnly: boolean;
  sort: SortKey;
  page: number;
}

export const PAGE_SIZE = 12;

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Highest rated' },
];

const SORT_KEYS = SORT_OPTIONS.map((option) => option.value);

export const defaultFilters: ShopFilters = {
  query: '',
  inStockOnly: false,
  sort: 'newest',
  page: 1,
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

function positiveNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Reads the query string, ignoring anything malformed rather than failing. */
export function parseShopParams(params: RawParams): ShopFilters {
  const sort = first(params.sort);
  const page = Number(first(params.page));

  return {
    query: first(params.q)?.slice(0, 100) ?? '',
    category: first(params.category),
    brand: first(params.brand),
    minPrice: positiveNumber(first(params.minPrice)),
    maxPrice: positiveNumber(first(params.maxPrice)),
    minRating: positiveNumber(first(params.minRating)),
    inStockOnly: first(params.inStock) === 'true',
    sort: sort && SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : 'newest',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/**
 * Serialises filters back to a `/shop` URL. Defaults are omitted so the address
 * bar only ever shows what the shopper actually chose.
 */
export function buildShopHref(filters: ShopFilters): string {
  const search = new URLSearchParams();

  if (filters.query.trim()) search.set('q', filters.query.trim());
  if (filters.category) search.set('category', filters.category);
  if (filters.brand) search.set('brand', filters.brand);
  if (filters.minPrice !== undefined) search.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== undefined) search.set('maxPrice', String(filters.maxPrice));
  if (filters.minRating !== undefined) search.set('minRating', String(filters.minRating));
  if (filters.inStockOnly) search.set('inStock', 'true');
  if (filters.sort !== defaultFilters.sort) search.set('sort', filters.sort);
  if (filters.page > 1) search.set('page', String(filters.page));

  const query = search.toString();
  return query ? `/shop?${query}` : '/shop';
}

/** How many narrowings are applied — drives the badge on the mobile filter button. */
export function countActiveFilters(filters: ShopFilters): number {
  return (
    (filters.query.trim() ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.brand ? 1 : 0) +
    (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0) +
    (filters.minRating !== undefined ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0)
  );
}
