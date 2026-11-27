import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ProductFilters } from './productRepository';

const key = '@haihand/explore-filters';

export async function readFilters(): Promise<ProductFilters | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ProductFilters;
    return ['search', 'category', 'location', 'sort', 'minPrice', 'maxPrice'].every((field) => typeof value[field as keyof ProductFilters] === 'string') ? value : null;
  } catch { return null; }
}

export async function writeFilters(filters: ProductFilters) {
  await AsyncStorage.setItem(key, JSON.stringify(filters));
}
