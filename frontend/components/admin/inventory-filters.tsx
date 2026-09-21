'use client';

import {
  AdminSearch,
  AdminSelect,
  FilterBar,
  useAdminFilters,
} from '@/components/admin/admin-filters';
import { Checkbox } from '@/components/ui/checkbox';
import type { AdminTaxonomyRow } from '@/types/admin';

/**
 * The inventory listing's filters.
 *
 * The same shape as the products, orders and reviews filters — URL state, a
 * debounced search, native selects — because an operator who has learned one
 * admin listing should not have to learn another. What differs is only what
 * the fields mean.
 *
 * "Changed this week" is a checkbox rather than a value in the status select,
 * because it is orthogonal to stock level: "what did we touch this week that is
 * now low?" is a real question, and a single select could not ask it.
 */
export function InventoryFilters({
  categories,
  brands,
}: {
  categories: AdminTaxonomyRow[];
  brands: AdminTaxonomyRow[];
}) {
  const { get, set, clear, searchParams } = useAdminFilters();

  const active = [...searchParams.keys()].some((key) => key !== 'page');

  return (
    <FilterBar active={active} onClear={clear}>
      <AdminSearch
        value={get('search')}
        onChange={(search) => set({ search })}
        placeholder="Search by product or SKU"
        className="w-full sm:max-w-xs"
      />

      <AdminSelect
        label="Stock"
        value={get('status')}
        onChange={(status) => set({ status })}
        allLabel="All stock levels"
        options={[
          { value: 'out_of_stock', label: 'Out of stock' },
          { value: 'low_stock', label: 'Low stock' },
          { value: 'in_stock', label: 'Healthy' },
        ]}
      />

      <AdminSelect
        label="Category"
        value={get('category')}
        onChange={(category) => set({ category })}
        allLabel="All categories"
        options={categories.map((category) => ({ value: category.id, label: category.name }))}
      />

      <AdminSelect
        label="Brand"
        value={get('brand')}
        onChange={(brand) => set({ brand })}
        allLabel="All brands"
        options={brands.map((brand) => ({ value: brand.id, label: brand.name }))}
      />

      <AdminSelect
        label="Listing"
        value={get('active')}
        onChange={(value) => set({ active: value })}
        allLabel="Live and hidden"
        options={[
          { value: 'true', label: 'Live only' },
          { value: 'false', label: 'Hidden only' },
        ]}
      />

      <AdminSelect
        label="Sort"
        value={get('sort')}
        onChange={(sort) => set({ sort })}
        allLabel="Scarcest first"
        options={[
          { value: 'stock_desc', label: 'Most stock first' },
          { value: 'name_asc', label: 'Product name' },
          { value: 'updated_desc', label: 'Recently updated' },
        ]}
      />

      <label className="text-caption mb-1.5 flex cursor-pointer items-center gap-2 font-medium">
        <Checkbox
          checked={get('recentlyChanged') === 'true'}
          onCheckedChange={(checked) => set({ recentlyChanged: checked ? 'true' : '' })}
        />
        Changed this week
      </label>
    </FilterBar>
  );
}
