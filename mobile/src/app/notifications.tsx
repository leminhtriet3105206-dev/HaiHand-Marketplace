import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { queryString, request, type Notification } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, Screen, Status } from '../components/ui';
import { colors } from '../theme';

type NotificationResponse = { notifications: Notification[]; unreadCount: number };
export default function NotificationsScreen() {
  const { user, token } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      const result = await request<NotificationResponse>(`/api/notifications${queryString({ role: 'buyer', userId: user._id })}`, { token: token || undefined });
      setNotifications(result.notifications); setUnread(result.unreadCount);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được thông báo.'); }
    finally { setLoading(false); }
  }, [user, token]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  const markRead = async (item: Notification) => {
    if (!item.isRead) {
      try { await request(`/api/notifications/${item._id}/read`, { method: 'PUT', token: token || undefined }); setNotifications((current) => current.map((entry) => entry._id === item._id ? { ...entry, isRead: true } : entry)); setUnread((count) => Math.max(0, count - 1)); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Không cập nhật được thông báo.'); return; }
    }
    if (item.type === 'MESSAGE') router.push('/inbox');
    else if (['ORDER', 'ORDER_STATUS', 'PAYMENT'].includes(item.type || '')) router.push('/orders');
  };
  const markAll = async () => {
    if (!user) return;
    try { await request('/api/notifications/read-all', { method: 'PUT', token: token || undefined, body: { role: 'buyer', userId: user._id } }); setNotifications((current) => current.map((item) => ({ ...item, isRead: true }))); setUnread(0); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không cập nhật được thông báo.'); }
  };
  return <Screen title="Thông báo" right={unread > 0 ? <Pressable onPress={() => void markAll()} accessibilityLabel="Đọc tất cả"><Ionicons name="checkmark-done-outline" size={24} color={colors.text} /></Pressable> : null}>
    {!user ? <View style={s.guest}><Text style={s.muted}>Đăng nhập để xem thông báo.</Text><Button title="Đăng nhập" onPress={() => router.push('/login')} /></View> : <>
      <Text style={s.heading}>{unread ? `${unread} thông báo chưa đọc` : 'Tất cả thông báo'}</Text>
      <Status loading={loading} error={error} empty={!loading && !error && !notifications.length ? 'Bạn chưa có thông báo nào.' : undefined} onRetry={load} />
      {!loading && !error && notifications.map((item) => <Pressable key={item._id} onPress={() => void markRead(item)} style={[s.card, !item.isRead && s.unread]}>
        <View style={s.icon}><Ionicons name={item.type === 'MESSAGE' ? 'chatbubble-outline' : item.type === 'ORDER' ? 'receipt-outline' : 'notifications-outline'} size={21} color={colors.orange} /></View>
        <View style={s.copy}><Text style={s.title}>{item.title}</Text><Text style={s.body}>{item.message || item.content || ''}</Text><Text style={s.date}>{item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : ''}</Text></View>
        {!item.isRead && <View style={s.dot} />}
      </Pressable>)}
    </>}
  </Screen>;
}

const s = StyleSheet.create({ guest: { paddingTop: 55, gap: 14 }, muted: { textAlign: 'center', color: colors.muted }, heading: { color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 12 }, card: { flexDirection: 'row', gap: 12, padding: 13, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 9 }, unread: { backgroundColor: '#FFF4CD' }, icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFF0AE', alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, gap: 5 }, title: { color: colors.text, fontWeight: '700', fontSize: 14 }, body: { color: colors.muted, fontSize: 13, lineHeight: 19 }, date: { color: colors.muted, fontSize: 11 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.orange } });
