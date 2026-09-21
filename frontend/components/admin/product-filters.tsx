'use client';

import {
  AdminSearch,
  AdminSelect,
  FilterBar,
  useAdminFilters,
} from '@/components/admin/admin-filters';
import type { AdminTaxonomyRow } from '@/types/admin';

const STOCK_OPTIONS = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'low_stock', label: 'Low stock' },
  { value: 'out_of_stock', label: 'Out of stock' },
];

const STATUS_OPTIONS = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
];

const FLAG_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'bestSeller', label: 'Best seller' },
  { value: 'newArrival', label: 'New arrival' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'price_desc', label: 'Price high to low' },
  { value: 'price_asc', label: 'Price low to high' },
  { value: 'stock_asc', label: 'Stock low to high' },
];

/**
 * The operational filters for the product list.
 *
 * Chosen for the jobs an operator actually has — find a product, see what is
 * running out, check what is hidden from the shop — rather than exposing every
 * field the model happens to have. The three merchandising flags share one
 * control because they are the same kind of question and three separate
 * selects would take a whole row to ask it.
 */
export function ProductFilters({
  categories,
  brands,
}: {
  categories: AdminTaxonomyRow[];
  brands: AdminTaxonomyRow[];
}) {
  const { get, set, clear, searchParams } = useAdminFilters();

  const flag = FLAG_OPTIONS.find((option) => get(option.value) === 'true')?.value ?? '';

  // `page` alone is not a filter; it should not light up "clear filters".
  const active = [...searchParams.keys()].some((key) => key !== 'page');

  return (
    <FilterBar active={active} onClear={clear}>
      <AdminSearch
        value={get('search')}
        onChange={(value) => set({ search: value })}
        placeholder="Search name, SKU, brand or category"
        className="w-full sm:w-72"
      />

      <AdminSelect
        label="Category"
        value={get('category')}
        options={categories.map((row) => ({ value: row.id, label: row.name }))}
        onChange={(value) => set({ category: value })}
        allLabel="All categories"
        className="w-full sm:w-44"
      />

      <AdminSelect
        label="Brand"
        value={get('brand')}
        options={brands.map((row) => ({ value: row.id, label: row.name }))}
        onChange={(value) => set({ brand: value })}
        allLabel="All brands"
        className="w-full sm:w-40"
      />

      <AdminSelect
        label="Stock"
        value={get('stock')}
        options={STOCK_OPTIONS}
        onChange={(value) => set({ stock: value })}
        allLabel="Any stock"
        className="w-full sm:w-36"
      />

      <AdminSelect
        label="Status"
        value={get('active')}
        options={STATUS_OPTIONS}
        onChange={(value) => set({ active: value })}
        allLabel="Any status"
        className="w-full sm:w-32"
      />

      <AdminSelect
        label="Flag"
        value={flag}
        options={FLAG_OPTIONS}
        onChange={(value) =>
          // One flag at a time: setting one clears the others.
          set({
            featured: value === 'featured' ? 'true' : null,
            bestSeller: value === 'bestSeller' ? 'true' : null,
            newArrival: value === 'newArrival' ? 'true' : null,
          })
        }
        allLabel="Any"
        className="w-full sm:w-32"
      />

      <AdminSelect
        label="Sort"
        value={get('sort')}
        options={SORT_OPTIONS}
        onChange={(value) => set({ sort: value })}
        allLabel="Newest"
        className="w-full sm:w-44"
      />
    </FilterBar>
  );
}
