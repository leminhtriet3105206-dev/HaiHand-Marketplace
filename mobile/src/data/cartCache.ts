import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CartItem } from '../domain/models';

const key = (userId: string) => `@haihand/cart/${userId}`;

export async function readCart(userId: string): Promise<CartItem[] | null> {
  const raw = await AsyncStorage.getItem(key(userId));
  if (!raw) return null;
  try {
    const items: unknown = JSON.parse(raw);
    return Array.isArray(items) && items.every((item) => item?.product?._id && Number.isInteger(item.quantity) && item.quantity > 0)
      ? items as CartItem[] : null;
  } catch { return null; }
}

export async function writeCart(userId: string, items: CartItem[]) {
  await AsyncStorage.setItem(key(userId), JSON.stringify(items));
}
