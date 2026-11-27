import AsyncStorage from '@react-native-async-storage/async-storage';

import { queryString, request, type Product } from './client';

const guestKey = 'haihand-recommendation-guest';
const newId = () => `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const sessionId = newId();
let guestId: Promise<string> | undefined;
let pendingView = Promise.resolve();

function getGuestId() {
  guestId ??= AsyncStorage.getItem(guestKey).then(async (stored) => {
    if (stored) return stored;
    const id = newId();
    await AsyncStorage.setItem(guestKey, id);
    return id;
  }).catch(() => newId());
  return guestId;
}

export function recordProductView(productId: string, token: string | null) {
  pendingView = pendingView.then(async () => {
    // Signed-in events are identified by JWT. Keep them out of guest history.
    const anonymousId = token ? sessionId : await getGuestId();
    await request('/api/track', {
      method: 'POST',
      token: token ?? undefined,
      body: { type: 'product_view', productId, source: 'detail', anonymousId, sessionId },
      timeoutMs: 5000,
    });
  }).catch(() => {});
}

export async function getViewedProductRecommendations(token: string | null, signal: AbortSignal) {
  await pendingView;
  if (signal.aborted) return [];
  const options = {
    token: token ?? undefined,
    headers: token ? undefined : { 'X-Anonymous-Id': await getGuestId() },
    signal,
    timeoutMs: 10000,
  };
  const [latest] = await request<Product[]>('/api/recommendations/recently-viewed?limit=1', options);
  if (!latest?.category) return [];
  const items = await request<Product[]>(`/api/recommendations/related-to-recent${queryString({
    productId: latest._id, limit: 8, sameCategoryOnly: 'true',
  })}`, options);
  return items.filter((item) => item._id !== latest._id && item.category === latest.category);
}
