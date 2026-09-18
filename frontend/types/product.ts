export type CategorySlug =
  'electronics' | 'fashion' | 'footwear' | 'accessories' | 'home' | 'beauty';

export type ProductBadge = 'sale' | 'new' | 'bestseller' | 'limited';

export interface ProductImage {
  url: string;
  alt: string;
}

export interface ProductVariantOption {
  label: string;
  value: string;
  /** CSS colour for swatch rendering; only set on colour options. */
  swatch?: string;
  available?: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: CategorySlug;
  /** Primary image first; the second is revealed on card hover when present. */
  images: ProductImage[];
  price: number;
  /** Pre-discount price. Absent when the product is not discounted. */
  compareAtPrice?: number;
  rating: number;
  reviewCount: number;
  badges: ProductBadge[];
  inStock: boolean;
  /** Short line used on cards and in search results. */
  tagline: string;
  /** Extra search terms — plurals, synonyms and the words shoppers actually type. */
  tags: string[];
  description: string;
  highlights: string[];
  specifications: { label: string; value: string }[];
  sizes?: ProductVariantOption[];
  colors?: ProductVariantOption[];
  createdAt: string;
  /** Drives the "Best Sellers" ordering. */
  unitsSold: number;
}

export interface Category {
  slug: CategorySlug;
  name: string;
  tagline: string;
  image: string;
  itemCount: number;
}

export interface Review {
  id: string;
  author: string;
  initials: string;
  rating: number;
  date: string;
  title: string;
  body: string;
  verified: boolean;
}

export type SortKey = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'rating' | 'discount';

export interface CartLine {
  productId: string;
  quantity: number;
  size?: string;
  color?: string;
}
