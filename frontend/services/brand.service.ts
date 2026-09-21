import { request } from '@/services/api';
import type { Brand } from '@/types/product';

export function getBrands(): Promise<Brand[]> {
  return request<Brand[]>('/api/brands');
}

export function getBrandBySlug(slug: string): Promise<Brand> {
  return request<Brand>(`/api/brands/${encodeURIComponent(slug)}`);
}

/** Used by the shop filter panel, which should still render if brands fail. */
export async function getBrandsSafe(): Promise<Brand[]> {
  try {
    return await getBrands();
  } catch {
    return [];
  }
}
