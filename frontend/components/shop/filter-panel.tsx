'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { formatPrice } from '@/lib/format';
import type { ShopFilters } from '@/components/shop/shop-filters';
import type { Brand, Category } from '@/types/product';
import { cn } from '@/lib/utils';

interface FilterPanelProps {
  filters: ShopFilters;
  categories: Category[];
  brands: Brand[];
  /** Highest price in the catalogue, so the slider covers the real range. */
  priceCeiling: number;
  /**
   * Colour families the catalogue actually stocks, added in Phase 11.
   *
   * Families rather than colourways: the catalogue names things "Triple Black"
   * and "Gloss Black", and a filter listing all forty of those would be a list
   * nobody reads. These are matched on a word boundary server-side, so "Black"
   * finds every black colourway without claiming a colour the product lacks.
   */
  colors?: string[];
  onChange: (patch: Partial<ShopFilters>) => void;
}

const RATING_STEPS = [4.5, 4, 3.5, 3];

/** Shared by the desktop sidebar and the mobile drawer — one source of truth. */
export function FilterPanel({
  filters,
  categories,
  brands,
  priceCeiling,
  colors = [],
  onChange,
}: FilterPanelProps) {
  // The slider is dragged locally and only committed on release, so a single
  // drag does not fire a request per pixel.
  const fromFilters: [number, number] = [filters.minPrice ?? 0, filters.maxPrice ?? priceCeiling];
  const [range, setRange] = useState<[number, number]>(fromFilters);
  const [syncedWith, setSyncedWith] = useState<[number, number]>(fromFilters);

  // Adjusting during render rather than in an effect: when the URL changes the
  // slider follows it, without a second render pass showing the stale range.
  if (syncedWith[0] !== fromFilters[0] || syncedWith[1] !== fromFilters[1]) {
    setSyncedWith(fromFilters);
    setRange(fromFilters);
  }

  function commitRange([low, high]: [number, number]) {
    onChange({
      minPrice: low > 0 ? low : undefined,
      maxPrice: high < priceCeiling ? high : undefined,
    });
  }

  return (
    <Accordion
      multiple
      defaultValue={['category', 'price', 'brand', 'color', 'rating', 'availability']}
      className="divide-y divide-border"
    >
      <FilterGroup value="category" label="Category">
        <ul className="space-y-3">
          {categories.map((category) => (
            <li key={category.id}>
              <CheckRow
                id={`category-${category.slug}`}
                checked={filters.category === category.slug}
                onChange={() =>
                  onChange({
                    category: filters.category === category.slug ? undefined : category.slug,
                  })
                }
                label={category.name}
                count={category.productCount}
              />
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup value="price" label="Price">
        <Slider
          value={range}
          onValueChange={(value) =>
            setRange((Array.isArray(value) ? value : [value, value]) as [number, number])
          }
          onValueCommitted={(value) =>
            commitRange((Array.isArray(value) ? value : [value, value]) as [number, number])
          }
          min={0}
          max={priceCeiling}
          step={500}
          aria-label="Price range"
          className="mt-1"
        />
        <div className="text-small mt-4 flex items-center justify-between tabular-nums">
          <span className="rounded-md border border-border px-2 py-1">{formatPrice(range[0])}</span>
          <span className="text-muted-foreground">to</span>
          <span className="rounded-md border border-border px-2 py-1">{formatPrice(range[1])}</span>
        </div>
      </FilterGroup>

      <FilterGroup value="brand" label="Brand">
        <ul className="max-h-60 space-y-3 overflow-y-auto pr-1">
          {brands.map((brand) => (
            <li key={brand.id}>
              <CheckRow
                id={`brand-${brand.slug}`}
                checked={filters.brand === brand.slug}
                onChange={() =>
                  onChange({ brand: filters.brand === brand.slug ? undefined : brand.slug })
                }
                label={brand.name}
              />
            </li>
          ))}
        </ul>
      </FilterGroup>

      {colors.length > 0 && (
        <FilterGroup value="color" label="Colour">
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => {
              const active = filters.color === color;

              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => onChange({ color: active ? undefined : color })}
                  aria-pressed={active}
                  className={cn(
                    'focus-ring text-caption rounded-full border px-3 py-1.5 font-medium transition-colors',
                    active
                      ? 'border-brand/40 bg-brand-subtle text-brand'
                      : 'border-border hover:bg-muted',
                  )}
                >
                  {color}
                </button>
              );
            })}
          </div>
        </FilterGroup>
      )}

      <FilterGroup value="rating" label="Rating">
        <ul className="space-y-1">
          {RATING_STEPS.map((step) => {
            const active = filters.minRating === step;

            return (
              <li key={step}>
                <button
                  type="button"
                  onClick={() => onChange({ minRating: active ? undefined : step })}
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
          onChange={() => onChange({ inStockOnly: !filters.inStockOnly })}
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
    <label htmlFor={id} className="text-small flex cursor-pointer items-center gap-2.5 select-none">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <span className="flex-1">{label}</span>
      {count !== undefined && (
        <span className="text-caption text-muted-foreground tabular-nums">{count}</span>
      )}
    </label>
  );
}
