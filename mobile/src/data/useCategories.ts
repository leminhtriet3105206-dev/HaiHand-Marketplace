import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { request, type Category } from '../api/client';

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    void request<Category[]>('/api/categories', { signal: controller.signal, timeoutMs: 10000 })
      .then((items) => {
        if (!controller.signal.aborted) setCategories(items);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []));

  return categories;
}
