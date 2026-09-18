'use client';

import { Star } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { categories } from '@/data/categories';
import { brands, priceBounds } from '@/data/products';
import { formatPrice } from '@/lib/format';
import type { ShopFilters } from '@/components/shop/use-shop-filters';
import { cn } from '@/lib/utils';

interface FilterPanelProps {
  filters: ShopFilters;
  update: <K extends keyof ShopFilters>(key: K, value: ShopFilters[K]) => void;
  toggleInArray: (key: 'categories' | 'brands', value: string) => void;
  /** Counts per category for the current result set, so filters feel alive. */
  counts: Record<string, number>;
}

const RATING_STEPS = [4.5, 4, 3.5, 3];

/** Shared by the desktop sidebar and the mobile drawer — one source of truth. */
export function FilterPanel({ filters, update, toggleInArray, counts }: FilterPanelProps) {
  return (
    <Accordion
      multiple
      defaultValue={['category', 'price', 'brand', 'rating', 'availability']}
      className="divide-y divide-border"
    >
      <FilterGroup value="category" label="Category">
        <ul className="space-y-3">
          {categories.map((category) => (
            <li key={category.slug}>
              <CheckRow
                id={`category-${category.slug}`}
                checked={filters.categories.includes(category.slug)}
                onChange={() => toggleInArray('categories', category.slug)}
                label={category.name}
                count={counts[category.slug]}
              />
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup value="price" label="Price">
        <Slider
          value={filters.priceRange}
          onValueChange={(value) =>
            update('priceRange', (Array.isArray(value) ? value : [value, value]) as [number, number])
          }
          min={priceBounds.min}
          max={priceBounds.max}
          step={500}
          aria-label="Price range"
          className="mt-1"
        />
        <div className="text-small mt-4 flex items-center justify-between tabular-nums">
          <span className="rounded-md border border-border px-2 py-1">
            {formatPrice(filters.priceRange[0])}
          </span>
          <span className="text-muted-foreground">to</span>
          <span className="rounded-md border border-border px-2 py-1">
            {formatPrice(filters.priceRange[1])}
          </span>
        </div>
      </FilterGroup>

      <FilterGroup value="brand" label="Brand">
        <ul className="max-h-60 space-y-3 overflow-y-auto pr-1">
          {brands.map((brand) => (
            <li key={brand}>
              <CheckRow
                id={`brand-${brand}`}
                checked={filters.brands.includes(brand)}
                onChange={() => toggleInArray('brands', brand)}
                label={brand}
              />
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup value="rating" label="Rating">
        <ul className="space-y-1">
          {RATING_STEPS.map((step) => {
            const active = filters.minRating === step;

            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() => update('minRating', active ? 0 : step)}
                  aria-pressed={active}
                  className={cn(
                    'focus-ring text-small flex w-full items-center gap-2 rounded-lg px-2 py-2 transition-colors',
                    active ? 'bg-brand-subtle text-brand' : 'hover:bg-muted',
                  )}
                >
                  <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
                  <span className="font-medium">{step}</span>
                  <span className="text-muted-foreground">and above</span>
                </button>
              </li>
            );
          })}
        </ul>
      </FilterGroup>

      <FilterGroup value="availability" label="Availability">
        <CheckRow
          id="in-stock"
          checked={filters.inStockOnly}
          onChange={() => update('inStockOnly', !filters.inStockOnly)}
          label="In stock only"
        />
      </FilterGroup>
    </Accordion>
  );
}

function FilterGroup({
  value,
  label,
  children,
}: {
  value: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value} className="border-0">
      <AccordionTrigger className="text-small py-4 font-semibold hover:no-underline">
        {label}
      </AccordionTrigger>
      <AccordionContent className="pb-5">{children}</AccordionContent>
    </AccordionItem>
  );
}

function CheckRow({
  id,
  checked,
  onChange,
  label,
  count,
}: {
  id: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  count?: number;
}) {
  return (
    <label
      htmlFor={id}
      className="text-small flex cursor-pointer items-center gap-2.5 select-none"
    >
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <span className="flex-1">{label}</span>
      {count !== undefined && (
        <span className="text-caption text-muted-foreground tabular-nums">{count}</span>
      )}
    </label>
  );
}
