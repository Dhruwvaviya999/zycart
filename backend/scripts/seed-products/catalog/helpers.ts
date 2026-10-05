import type { Rng } from '../random';
import type { BrandDef, ColorOption, Spec, Tier } from '../types';

/** `brands(['Samsung', 'mid', 3], ['Apple', 'premium'])` — terse brand lists. */
export const brands = (...entries: [string, Tier, number?][]): BrandDef[] =>
  entries.map(([name, tier, weight]) => ({ name, tier, weight: weight ?? 1 }));

export const spec = (label: string, value: string | number): Spec => ({
  label,
  value: String(value),
});

/** How much a tier multiplies a base price by, with a little spread inside the tier. */
export function tierPrice(rng: Rng, tier: Tier, base: number): number {
  const factor = {
    budget: rng.float(0.75, 0.95),
    mid: rng.float(1, 1.35),
    premium: rng.float(1.8, 2.8),
  };
  return base * factor[tier];
}

/** Chooses by tier: `byTier(tier, ['a'], ['b'], ['c'])`. */
export function byTier<T>(tier: Tier, budget: T, mid: T, premium: T): T {
  return tier === 'budget' ? budget : tier === 'mid' ? mid : premium;
}

/** "a, b and c" */
export function listJoin(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Fills `#` with digits and `A` with letters: `refCode(rng, 'AA####')` → "KX4821". */
export function refCode(rng: Rng, pattern: string): string {
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  return [...pattern]
    .map((ch) => (ch === '#' ? String(rng.int(0, 9)) : ch === 'A' ? rng.pick([...letters]) : ch))
    .join('');
}

/** Formats rupees the Indian way: 124999 → "₹1,24,999". */
export const inr = (value: number): string => `₹${Math.round(value).toLocaleString('en-IN')}`;

/** A few sentences picked and ordered by the rng, so two descriptions rarely read alike. */
export function paragraph(rng: Rng, required: string[], optional: string[], extra = 2): string {
  return [...required, ...rng.sample(optional, extra)].join(' ');
}

export function pickColors(rng: Rng, palette: readonly ColorOption[], min: number, max: number) {
  return rng.sample(palette, rng.int(min, max));
}

/* ------------------------------------------------------------------ */
/* Palettes                                                            */
/* ------------------------------------------------------------------ */

export const APPAREL_COLORS: ColorOption[] = [
  { name: 'Black', hex: '#111111' },
  { name: 'White', hex: '#F5F5F5' },
  { name: 'Navy Blue', hex: '#1F2A44' },
  { name: 'Olive Green', hex: '#556B2F' },
  { name: 'Maroon', hex: '#7B1E2B' },
  { name: 'Charcoal Grey', hex: '#36454F' },
  { name: 'Grey Melange', hex: '#A7A9AC' },
  { name: 'Mustard', hex: '#D4A017' },
  { name: 'Teal', hex: '#00807F' },
  { name: 'Beige', hex: '#D9C8A9' },
  { name: 'Sky Blue', hex: '#87BDE8' },
  { name: 'Rust', hex: '#B7410E' },
  { name: 'Bottle Green', hex: '#006A4E' },
  { name: 'Lavender', hex: '#B9A6D9' },
  { name: 'Peach', hex: '#F4B89A' },
  { name: 'Red', hex: '#C62828' },
];

export const WOMENS_COLORS: ColorOption[] = [
  { name: 'Dusty Pink', hex: '#D8A7A7' },
  { name: 'Mint Green', hex: '#A8D5BA' },
  { name: 'Powder Blue', hex: '#B0C4DE' },
  { name: 'Black', hex: '#111111' },
  { name: 'Ivory', hex: '#F6F1E1' },
  { name: 'Wine', hex: '#722F37' },
  { name: 'Mustard Yellow', hex: '#E1AD01' },
  { name: 'Emerald Green', hex: '#2E8B57' },
  { name: 'Coral', hex: '#F88379' },
  { name: 'Royal Blue', hex: '#2E5BBA' },
  { name: 'Magenta', hex: '#C2185B' },
  { name: 'Lilac', hex: '#C8A2C8' },
];

export const DENIM_WASHES: ColorOption[] = [
  { name: 'Light Blue', hex: '#9DB8D6' },
  { name: 'Mid Blue', hex: '#5A7DA8' },
  { name: 'Dark Indigo', hex: '#27365A' },
  { name: 'Jet Black', hex: '#1A1A1A' },
  { name: 'Charcoal', hex: '#3B3F45' },
  { name: 'Ice Blue', hex: '#C3D7EA' },
];

export const DEVICE_COLORS: ColorOption[] = [
  { name: 'Midnight Black', hex: '#1C1C1E' },
  { name: 'Titanium Grey', hex: '#7A7A7F' },
  { name: 'Glacier Blue', hex: '#A9C7E3' },
  { name: 'Mint Green', hex: '#B5D9C3' },
  { name: 'Lavender', hex: '#C8B6E2' },
  { name: 'Starlight', hex: '#F1EDE4' },
  { name: 'Forest Green', hex: '#2F4F3A' },
  { name: 'Coral Red', hex: '#E25B4B' },
  { name: 'Silver', hex: '#C0C0C0' },
  { name: 'Deep Ocean Blue', hex: '#1E3A5F' },
];

export const SHOE_COLORWAYS: ColorOption[] = [
  { name: 'Black/White', hex: '#111111' },
  { name: 'Triple White', hex: '#F7F7F7' },
  { name: 'Core Black', hex: '#1A1A1A' },
  { name: 'Grey/Volt', hex: '#8E9196' },
  { name: 'Navy/Orange', hex: '#1F2A44' },
  { name: 'Red/White', hex: '#C62828' },
  { name: 'Olive/Black', hex: '#556B2F' },
  { name: 'Beige/Gum', hex: '#D8C3A5' },
  { name: 'Royal Blue', hex: '#2E5BBA' },
  { name: 'Carbon Grey', hex: '#4A4A4A' },
  { name: 'White/Green', hex: '#E8F0E8' },
  { name: 'Cream/Brown', hex: '#EADBC8' },
];

export const LEATHER_COLORS: ColorOption[] = [
  { name: 'Black', hex: '#111111' },
  { name: 'Tan', hex: '#B5835A' },
  { name: 'Dark Brown', hex: '#5C3A21' },
  { name: 'Burgundy', hex: '#6D1A36' },
  { name: 'Cognac', hex: '#9A463D' },
];

/* ------------------------------------------------------------------ */
/* Sizes                                                               */
/* ------------------------------------------------------------------ */

export const ALPHA_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export const MENS_WAIST = ['28', '30', '32', '34', '36', '38'];
export const WOMENS_WAIST = ['26', '28', '30', '32', '34'];
export const MENS_UK_SHOES = ['6', '7', '8', '9', '10', '11'];
export const WOMENS_UK_SHOES = ['3', '4', '5', '6', '7', '8'];

/** A run of consecutive sizes from a ladder, `min`–`max` long — nobody stocks every size of everything. */
export function sizeRun(rng: Rng, ladder: readonly string[], min: number, max: number): string[] {
  const length = Math.min(ladder.length, rng.int(min, max));
  const start = rng.int(0, ladder.length - length);
  return ladder.slice(start, start + length);
}
