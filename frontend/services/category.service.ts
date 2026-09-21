import { request } from '@/services/api';
import type { Category } from '@/types/product';

export function getCategories(): Promise<Category[]> {
  return request<Category[]>('/api/categories');
}

export function getCategoryBySlug(slug: string): Promise<Category> {
  return request<Category>(`/api/categories/${encodeURIComponent(slug)}`);
}

/**
 * Categories drive navigation chrome that must never take the page down with
 * it, so this variant answers with an empty list instead of throwing.
 */
export async function getCategoriesSafe(): Promise<Category[]> {
  try {
    return await getCategories();
  } catch {
    return [];
  }
}
