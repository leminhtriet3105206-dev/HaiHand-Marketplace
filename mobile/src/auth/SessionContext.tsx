import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { ApiError, request, type User } from '../api/client';

type Session = { user: User; token: string };
type SessionValue = {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const key = 'haihand-buyer-session';
const SessionContext = createContext<SessionValue | null>(null);

async function saveSession(value: Session | null) {
  const text = value ? JSON.stringify({ user: { _id: value.user._id, name: value.user.name, email: value.user.email, avatar: value.user.avatar }, token: value.token }) : null;
  if (Platform.OS === 'web') {
    if (text) localStorage.setItem(key, text); else localStorage.removeItem(key);
  } else if (text) {
    await SecureStore.setItemAsync(key, text);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

async function loadSession(): Promise<Session | null> {
  const text = Platform.OS === 'web' ? localStorage.getItem(key) : await SecureStore.getItemAsync(key);
  if (!text) return null;
  try { return JSON.parse(text) as Session; } catch { return null; }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const stored = await loadSession();
        if (!stored) return;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const user = await request<User>('/api/users/profile', { token: stored.token, signal: controller.signal });
          if (active) setSession({ user, token: stored.token });
          await saveSession({ user, token: stored.token });
        } catch (cause) {
          if (cause instanceof ApiError && [401, 404].includes(cause.status)) {
            await saveSession(null);
          } else if (active) {
            setSession(stored);
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        // Storage can fail on a device; keep the app usable as a guest.
      } finally {
        if (active) setReady(true);
      }
    };
    void restore();
    return () => { active = false; };
  }, []);

  const commit = async (value: Session | null) => {
    await saveSession(value);
    setSession(value);
  };

  const login = async (email: string, password: string) => {
    const user = await request<User>('/api/users/login', { method: 'POST', body: { email, password } });
    if (!user.token) throw new Error('Máy chủ không trả về phiên đăng nhập.');
    await commit({ user, token: user.token });
  };

  const register = async (name: string, email: string, password: string, phone?: string) => {
    const result = await request<{ user: User }>('/api/users/register', { method: 'POST', body: { name, email, password, phone } });
    if (!result.user.token) throw new Error('Máy chủ không trả về phiên đăng ký.');
    await commit({ user: result.user, token: result.user.token });
  };

  const refresh = async () => {
    if (!session) return;
    try {
      const user = await request<User>('/api/users/profile', { token: session.token });
      await commit({ user, token: session.token });
    } catch (cause) {
      if (cause instanceof ApiError && [401, 404].includes(cause.status)) await commit(null);
      throw cause;
    }
  };

  return (
    <SessionContext.Provider value={{
      user: session?.user ?? null,
      token: session?.token ?? null,
      ready,
      login,
      register,
      refresh,
      logout: () => commit(null),
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession phải nằm trong SessionProvider');
  return value;
}
