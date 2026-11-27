import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Address } from '../api/client';

export type AddressDraft = Omit<Address, '_id' | 'isDefault' | 'provinceId' | 'districtId'> & {
  provinceId?: number;
  districtId?: number;
};

export function emptyAddressDraft(fullName = '', phone = ''): AddressDraft {
  return { fullName, phone, street: '', provinceName: '', districtName: '', wardCode: '', wardName: '' };
}

const key = (userId: string) => `haihand.checkout-address.${userId}`;
let pendingWrite: Promise<void> = Promise.resolve();

export async function readAddressDraft(userId: string): Promise<AddressDraft | null> {
  if (Platform.OS === 'web') return null;
  await pendingWrite;
  try {
    const raw = await SecureStore.getItemAsync(key(userId));
    if (!raw) return null;
    const draft: unknown = JSON.parse(raw);
    if (!draft || typeof draft !== 'object') return null;

    const fields = draft as Record<string, unknown>;
    if (Object.keys(emptyAddressDraft()).some(field => typeof fields[field] !== 'string')) return null;
    if (['provinceId', 'districtId'].some(field => fields[field] !== undefined &&
        (typeof fields[field] !== 'number' || !Number.isInteger(fields[field]) || fields[field] <= 0))) return null;
    return draft as AddressDraft;
  } catch {
    return null;
  }
}

export function writeAddressDraft(userId: string, draft: AddressDraft | null): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  const update = pendingWrite.then(() => draft
    ? SecureStore.setItemAsync(key(userId), JSON.stringify(draft))
    : SecureStore.deleteItemAsync(key(userId)));
  // Finish old writes before deleting, so a saved or discarded draft cannot reappear.
  pendingWrite = update.catch(() => {});
  return update;
}
