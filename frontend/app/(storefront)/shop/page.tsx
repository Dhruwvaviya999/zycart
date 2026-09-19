import type { Metadata } from 'next';
import { ShopClient } from '@/components/shop/shop-client';
import { parseShopParams, PAGE_SIZE } from '@/components/shop/shop-filters';
import { getBrandsSafe } from '@/services/brand.service';
import { getCategoriesSafe } from '@/services/category.service';
import { getColorFamilies, getProducts } from '@/services/product.service';

export const metadata: Metadata = {
  title: 'Shop',
  description:
    'Browse the full ZyCart catalogue — filter by category, brand, price and availability.',
};

/** Fallback ceiling for the price slider when the catalogue cannot be read. */
const DEFAULT_PRICE_CEILING = 50_000;

/** The most expensive active product, rounded up so the slider ends on a round number. */
async function getPriceCeiling(): Promise<number> {
  try {
    const { items } = await getProducts({ sort: 'price_desc', limit: 1 });
    const highest = items[0]?.price;
    return highest ? Math.ceil(highest / 1000) * 1000 : DEFAULT_PRICE_CEILING;
  } catch {
    return DEFAULT_PRICE_CEILING;
  }
}

export default async function ShopPage({ searchParams }: PageProps<'/shop'>) {
  const filters = parseShopParams(await searchParams);

  // Filters and chrome are fetched together; a failure in either list leaves the
  // page usable rather than taking it down.
  const [result, categories, brands, priceCeiling, colors] = await Promise.all([
    getProducts({
      page: filters.page,
      limit: PAGE_SIZE,
      search: filters.query || undefined,
      category: filters.category,
      brand: filters.brand,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      minRating: filters.minRating,
      inStock: filters.inStockOnly ? true : undefined,
      color: filters.color,
      sort: filters.sort,
    }),
    getCategoriesSafe(),
    getBrandsSafe(),
    getPriceCeiling(),
    getColorFamilies(),
  ]);

  return (
    <ShopClient
      filters={filters}
      products={result.items}
      pagination={result.pagination}
      categories={categories}
      brands={brands}
      priceCeiling={priceCeiling}
      colors={colors}
    />
  );
}
