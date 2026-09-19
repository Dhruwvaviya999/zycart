import { Brand } from '../../models/brand.model';
import { Category } from '../../models/category.model';
import { Product } from '../../models/product.model';
import { countProducts } from '../product.service';
import { productQuerySchema, type ProductQuery } from '../../validators/product.validator';
import type { SmartSearchInput } from '../../validators/search.validator';
import {
  interpretSearchQuery,
  type CatalogueVocabulary,
  type SearchInterpretation,
} from '../ai/search/query-interpreter';
import type { AiProvider } from '../ai/provider';
import { classifyQuery } from './query-classifier';

/**
 * Smart search: read the sentence, then let the store do the searching.
 *
 * What this service returns is an *interpretation*, not a result set. That is
 * the central design decision of the phase and it is worth stating plainly:
 *
 *   query -> interpretation -> a normal /shop URL -> the normal product API
 *
 * The alternative — an endpoint that returns its own ranked products — would
 * have meant a second search path with its own pagination, its own filter
 * handling and its own idea of sort order, sitting beside the one `/shop`
 * already has. It would also produce results the URL could not describe, so a
 * refresh or a shared link would lose them.
 *
 * Instead the interpretation becomes query parameters, and every existing
 * thing keeps working: paging, sorting, the filter panel, back navigation,
 * bookmarking. Relevance ranking lives in the product service as a sort, so the
 * ranking applies to plain keyword searches too rather than only to AI ones.
 */

export type SmartSearchSource = 'keyword' | 'ai' | 'fallback';

/** The resolved criteria, in the shape the storefront's filters already use. */
export interface ResolvedFilters {
  query: string;
  category?: string;
  brand?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  sort: ProductQuery['sort'];
}

export interface SmartSearchResult {
  /** What the shopper typed, unchanged. */
  query: string;
  source: SmartSearchSource;
  filters: ResolvedFilters;
  /**
   * Which fields the interpretation decided, so the storefront can show them as
   * "smart filters", and so the next search knows which of the current filters
   * were the shopper's own rather than a previous interpretation's.
   */
  interpreted: string[];
  /** How many products the resolved criteria actually match. */
  total: number;
  /**
   * Set when interpretation was attempted and did not work. The customer is
   * told plainly that they are looking at a standard search — never given a
   * provider error, and never left to wonder why the results look literal.
   */
  notice?: string;
}

const FALLBACK_NOTICE =
  'Smart search is unavailable right now, so these are standard search results.';

/**
 * The catalogue's vocabulary, cached briefly.
 *
 * Categories, brands and colourways change when an administrator edits the
 * catalogue — rarely, and never mid-search. Re-reading three collections on
 * every search to build a prompt would be the most expensive part of a cheap
 * request, so it is held for a few minutes in this process. Nothing depends on
 * it being fresh: it only decides which words the model is allowed to use, and
 * a value it has not heard of is dropped rather than trusted.
 */
const VOCABULARY_TTL_MS = 5 * 60 * 1000;
let vocabularyCache: { value: CatalogueVocabulary; expiresAt: number } | null = null;

export async function catalogueVocabulary(): Promise<CatalogueVocabulary> {
  if (vocabularyCache && vocabularyCache.expiresAt > Date.now()) return vocabularyCache.value;

  const [categories, brands, colors] = await Promise.all([
    Category.find({ isActive: true }).select('name').lean(),
    Brand.find({ isActive: true }).select('name').lean(),
    Product.distinct('colors.name', { isActive: true }),
  ]);

  const value: CatalogueVocabulary = {
    categories: categories.map((entry) => entry.name),
    brands: brands.map((entry) => entry.name),
    colors: (colors as string[]).filter(Boolean).sort(),
  };

  vocabularyCache = { value, expiresAt: Date.now() + VOCABULARY_TTL_MS };
  return value;
}

/** Test seam, and the hook an admin catalogue write would use if it ever needs to. */
export function clearVocabularyCache(): void {
  vocabularyCache = null;
}

/**
 * Combines the interpretation with the filters the shopper set themselves.
 *
 * Manual wins, every time. The storefront sends only the filters the shopper
 * actually chose — it strips the ones a previous interpretation contributed,
 * which it knows from `interpreted` on the last response — so a category the
 * shopper picked survives a new search, and a category the model guessed last
 * time does not silently outlive the query that produced it.
 */
function merge(
  query: string,
  interpretation: SearchInterpretation | null,
  retain: SmartSearchInput['retain'],
): { filters: ResolvedFilters; interpreted: string[] } {
  const manual = retain ?? {};

  /**
   * A field is the interpretation's only when the model produced it and the
   * shopper did not set it themselves. Written as one rule rather than as an
   * assign-then-overwrite pass, so "manual wins" is visible in the code instead
   * of being a consequence of ordering.
   */
  const interpreted: string[] = [];

  type Field = keyof SearchInterpretation & keyof NonNullable<SmartSearchInput['retain']>;

  function pick<K extends Field>(key: K): SearchInterpretation[K] {
    const manualValue = manual[key];
    if (manualValue !== undefined) return manualValue as SearchInterpretation[K];

    const value = interpretation?.[key];
    if (value !== undefined) interpreted.push(key);
    return value;
  }

  const category = pick('category');
  const brand = pick('brand');
  const color = pick('color');
  const minPrice = pick('minPrice');
  const maxPrice = pick('maxPrice');
  const minRating = pick('minRating');
  const inStock = pick('inStock');
  const sort = pick('sort');

  const filters: ResolvedFilters = {
    // The free text the catalogue searches on: the model's reduced terms when
    // it produced any, otherwise the shopper's words exactly as typed.
    query: interpretation ? (interpretation.query ?? '') : query,
    // Relevance unless the shopper or the interpretation asked for an ordering.
    sort: sort ?? 'relevance',
    ...(category ? { category } : {}),
    ...(brand ? { brand } : {}),
    ...(color ? { color } : {}),
    ...(minPrice === undefined ? {} : { minPrice }),
    ...(maxPrice === undefined ? {} : { maxPrice }),
    ...(minRating === undefined ? {} : { minRating }),
    ...(inStock === undefined ? {} : { inStock }),
  };

  return { filters, interpreted };
}

/**
 * Runs the resolved criteria through the storefront's own query schema.
 *
 * This is the security boundary for everything the model produced. Whatever it
 * returned has already been validated by Zod and normalised against the real
 * catalogue vocabulary; here it is validated a third time by the exact schema
 * that guards `GET /api/products`. There is no field a smart search can set
 * that a shopper cannot, no operator it can express, and no way for a value to
 * reach MongoDB without passing the same check a URL parameter does.
 */
export function toProductQuery(filters: ResolvedFilters, page = 1, limit = 12): ProductQuery {
  return productQuerySchema.parse({
    page,
    limit,
    ...(filters.query ? { search: filters.query } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.brand ? { brand: filters.brand } : {}),
    ...(filters.color ? { color: filters.color } : {}),
    ...(filters.minPrice === undefined ? {} : { minPrice: filters.minPrice }),
    ...(filters.maxPrice === undefined ? {} : { maxPrice: filters.maxPrice }),
    ...(filters.minRating === undefined ? {} : { minRating: filters.minRating }),
    ...(filters.inStock === undefined ? {} : { inStock: String(filters.inStock) }),
    sort: filters.sort,
  });
}

export interface SmartSearchOptions {
  /** Absent when this deployment has no AI configured — a supported state. */
  provider: AiProvider | null;
  signal?: AbortSignal;
}

export async function smartSearch(
  input: SmartSearchInput,
  options: SmartSearchOptions,
): Promise<SmartSearchResult> {
  const query = input.query.trim();
  const classification = classifyQuery(query);

  let interpretation: SearchInterpretation | null = null;
  let source: SmartSearchSource = 'keyword';
  let notice: string | undefined;

  /**
   * The model is called only when the sentence needs reading. "nike shoes" is
   * the common case and it goes straight to the catalogue — no model call, no
   * latency, no cost, and the same results it has always returned.
   */
  if (classification.kind === 'natural_language' && options.provider) {
    interpretation = await interpretSearchQuery(query, {
      provider: options.provider,
      vocabulary: await catalogueVocabulary(),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    if (interpretation) {
      source = 'ai';
    } else {
      // Interpretation was worth attempting and did not work. The shopper still
      // gets results — the keyword search they would have got anyway — and is
      // told why they look literal.
      source = 'fallback';
      notice = FALLBACK_NOTICE;
    }
  }

  const { filters, interpreted } = merge(query, interpretation, input.retain);

  // The count comes from the same query the storefront is about to run, so the
  // number reported here and the number on the results page cannot disagree.
  const total = await countProducts(toProductQuery(filters));

  console.info(
    `[search] "${query.slice(0, 60)}" kind=${classification.kind} (${classification.reason}) ` +
      `source=${source} interpreted=[${interpreted.join(',')}] total=${String(total)}`,
  );

  return {
    query,
    source,
    filters,
    interpreted,
    total,
    ...(notice ? { notice } : {}),
  };
}
