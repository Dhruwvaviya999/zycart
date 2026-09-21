import type { SortKey } from '@/types/product';

/**
 * Where a set of results came from.
 *
 * `keyword` means no model was involved at all — the query was short and
 * literal, and went straight to the catalogue. `fallback` means interpretation
 * was attempted and did not work, which the storefront says out loud rather
 * than quietly returning literal results for a sentence.
 */
export type SmartSearchSource = 'keyword' | 'ai' | 'fallback';

/** The criteria a search resolved to, in the shape the shop filters already use. */
export interface ResolvedSearchFilters {
  query: string;
  category?: string;
  brand?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  sort: SortKey;
}

/** Which resolved fields the interpretation decided, rather than the shopper. */
export type InterpretedField = keyof Omit<ResolvedSearchFilters, 'query'>;

export interface SmartSearchResult {
  /** What the shopper typed, unchanged. */
  query: string;
  source: SmartSearchSource;
  filters: ResolvedSearchFilters;
  interpreted: string[];
  total: number;
  /** Present only when interpretation failed; safe to show to a customer. */
  notice?: string;
}

export interface SmartSearchRequest {
  query: string;
  /**
   * Filters the shopper chose themselves, so a new search does not discard
   * them. The previous interpretation's fields are stripped before sending.
   */
  retain?: Partial<Omit<ResolvedSearchFilters, 'query' | 'sort'>> & { sort?: SortKey };
}

/** What the shop's search field is doing right now. */
export type SearchPhase = 'idle' | 'interpreting' | 'navigating';
