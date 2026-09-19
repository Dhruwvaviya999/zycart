import type { SortKey } from '@/types/product';

/** The filter state, which lives entirely in the URL so any view is shareable. */
export interface ShopFilters {
  query: string;
  category?: string;
  brand?: string;
  /** Added in Phase 11: matched against the product's own colourways. */
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStockOnly: boolean;
  sort: SortKey;
  page: number;
  /**
   * Which filters a smart search decided, rather than the shopper.
   *
   * Carried in the URL so the page is self-describing: a refresh, a shared link
   * or the back button all still know which chips to present as "smart
   * filters", and the next search knows which of the current filters were the
   * shopper's own and must survive it.
   */
  interpreted: string[];
}

export const PAGE_SIZE = 12;

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  // Only meaningful with a search term, which is why it is offered first: it is
  // the default the moment a shopper searches, and irrelevant before that.
  { value: 'relevance', label: 'Most relevant' },
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
  interpreted: [],
};

/** The filter fields a smart search may decide. */
export const INTERPRETABLE_FIELDS = [
  'category',
  'brand',
  'color',
  'minPrice',
  'maxPrice',
  'minRating',
  'inStock',
  'sort',
] as const;

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

  const interpreted = (first(params.ai) ?? '')
    .split(',')
    .map((field) => field.trim())
    .filter((field): field is (typeof INTERPRETABLE_FIELDS)[number] =>
      (INTERPRETABLE_FIELDS as readonly string[]).includes(field),
    );

  return {
    query: first(params.q)?.slice(0, 200) ?? '',
    category: first(params.category),
    brand: first(params.brand),
    color: first(params.color)?.slice(0, 40),
    minPrice: positiveNumber(first(params.minPrice)),
    maxPrice: positiveNumber(first(params.maxPrice)),
    minRating: positiveNumber(first(params.minRating)),
    inStockOnly: first(params.inStock) === 'true',
    sort: sort && SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : 'newest',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    interpreted,
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
  if (filters.color) search.set('color', filters.color);
  if (filters.minPrice !== undefined) search.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice !== undefined) search.set('maxPrice', String(filters.maxPrice));
  if (filters.minRating !== undefined) search.set('minRating', String(filters.minRating));
  if (filters.inStockOnly) search.set('inStock', 'true');
  if (filters.sort !== defaultFilters.sort) search.set('sort', filters.sort);
  if (filters.page > 1) search.set('page', String(filters.page));
  if (filters.interpreted.length > 0) search.set('ai', filters.interpreted.join(','));

  const query = search.toString();
  return query ? `/shop?${query}` : '/shop';
}

/** How many narrowings are applied — drives the badge on the mobile filter button. */
export function countActiveFilters(filters: ShopFilters): number {
  return (
    (filters.query.trim() ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.brand ? 1 : 0) +
    (filters.color ? 1 : 0) +
    (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0) +
    (filters.minRating !== undefined ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0)
  );
}

/**
 * The filters the shopper chose themselves.
 *
 * Everything currently applied, minus whatever the last interpretation
 * contributed. This is what a new search sends back so a deliberate narrowing
 * survives it — while a filter the model guessed last time does not silently
 * outlive the query that produced it.
 */
export function manualFilters(filters: ShopFilters): Record<string, unknown> {
  const interpreted = new Set(filters.interpreted);
  const manual: Record<string, unknown> = {};

  const keep = (field: (typeof INTERPRETABLE_FIELDS)[number], value: unknown) => {
    if (value === undefined || value === '' || interpreted.has(field)) return;
    manual[field] = value;
  };

  keep('category', filters.category);
  keep('brand', filters.brand);
  keep('color', filters.color);
  keep('minPrice', filters.minPrice);
  keep('maxPrice', filters.maxPrice);
  keep('minRating', filters.minRating);
  keep('inStock', filters.inStockOnly ? true : undefined);

  return manual;
}
