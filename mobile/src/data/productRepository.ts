import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_URL, queryString, request } from '../api/client';
import type { Product } from '../domain/models';

export type ProductFilters = {
  search: string;
  category: string;
  location: string;
  sort: string;
  minPrice: string;
  maxPrice: string;
};

type ProductCache = { products: Product[]; updatedAt: number };

const cacheKey = (filters: ProductFilters) =>
  `@haihand/products/${encodeURIComponent(API_URL)}/${encodeURIComponent(JSON.stringify(filters))}`;

export async function readCachedProducts(filters: ProductFilters): Promise<Product[] | null> {
  const raw = await AsyncStorage.getItem(cacheKey(filters));
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw) as ProductCache;
    return Array.isArray(cached.products) && cached.products.every((item) => typeof item?._id === 'string')
      ? cached.products
      : null;
  } catch {
    await AsyncStorage.removeItem(cacheKey(filters));
    return null;
  }
}

export async function writeCachedProducts(filters: ProductFilters, products: Product[]) {
  await AsyncStorage.setItem(cacheKey(filters), JSON.stringify({ products, updatedAt: Date.now() } satisfies ProductCache));
}

export function fetchProductPage(filters: ProductFilters, page: number, limit: number, signal?: AbortSignal) {
  return request<Product[]>(`/api/posts${queryString({ ...filters, page, limit })}`, { signal });
}
