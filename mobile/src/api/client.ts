import { Platform } from 'react-native';

import type { Product, User } from '../domain/models';

export type { CartItem, Product, User } from '../domain/models';

const defaultHost = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
const configuredHost = process.env.EXPO_PUBLIC_API_URL || defaultHost;
// 10.0.2.2 is only reachable from the Android Emulator; browsers need localhost.
const browserHost = Platform.OS === 'web' && configuredHost.includes('10.0.2.2')
  ? configuredHost.replace('10.0.2.2', 'localhost')
  : configuredHost;
export const API_URL = browserHost.replace(/\/$/, '');

export type Category = { _id: string; name: string; image?: string; icon?: string };
export type Message = {
  _id: string;
  sender: string | User;
  receiver: string | User;
  content: string;
  images?: string[];
  timestamp?: string;
  isRead?: boolean;
};
export type Conversation = { otherUser: User; lastMessage: Message; unreadCount: number; timestamp: string };
export type Notification = { _id: string; title: string; message?: string; content?: string; type?: string; isRead: boolean; createdAt: string; link?: string };
export type Order = {
  _id: string; items?: Product[]; orderItems?: { productId: string; name: string; price: number; quantity: number; image?: string }[];
  parentOrderId?: string;
  totalPrice?: number; status?: string; paymentMethod?: string; paymentStatus?: string; shippingFee?: number;
  trackingCode?: string; shippingAddress?: Address; createdAt?: string;
};
export type Address = { _id?: string; fullName: string; phone: string; street: string; provinceId: number; provinceName: string; districtId: number; districtName: string; wardCode: string; wardName: string; isDefault?: boolean };

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown; token?: string; timeoutMs?: number };

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!__DEV__ && !API_URL.startsWith('https://')) {
    throw new Error('Bản phát hành cần EXPO_PUBLIC_API_URL sử dụng HTTPS.');
  }
  const { body, token, headers, signal, timeoutMs, ...rest } = options;
  const isForm = body instanceof FormData;
  const controller = timeoutMs ? new AbortController() : null;
  const onAbort = () => controller?.abort();
  if (controller && signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  let timedOut = false;
  const timer = controller ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs) : null;
  let response: Response;
  let raw: string;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      signal: controller?.signal ?? signal,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    raw = await response.text();
  } catch (cause) {
    if (timedOut) throw new Error('Kết nối máy chủ quá lâu. Vui lòng thử lại.');
    if (signal?.aborted) throw cause;
    throw new Error(`Không kết nối được máy chủ ${API_URL}. Kiểm tra backend và địa chỉ API.`);
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  let data: unknown;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = { message: raw }; }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'message' in data ? String(data.message)
      : data && typeof data === 'object' && 'error' in data ? String(data.error)
      : `Lỗi HTTP ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export function imageUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  const path = value.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${API_URL}/${path.startsWith('uploads/') ? path : `uploads/${path}`}`;
}

export function productImage(product: Product): string | undefined {
  return imageUrl(product.images?.[0] || product.image);
}

export function productTitle(product: Product): string {
  return product.title || product.name || 'Sản phẩm';
}

export function formatPrice(value?: number): string {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

export function queryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
