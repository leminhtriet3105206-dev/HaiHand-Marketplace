import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { imageUrl, request, type Conversation } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, Screen, Status } from '../components/ui';
import { colors } from '../theme';

export default function InboxScreen() {
  const { user, token } = useSession();
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try { setThreads(await request<Conversation[]>(`/api/messages/conversations/${user._id}`, { token: token || undefined })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được hộp thư.'); }
    finally { setLoading(false); }
  }, [user, token]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  const visible = threads.filter((item) => item.otherUser?.name?.toLowerCase().includes(query.trim().toLowerCase()));
  return <Screen title="Tin nhắn">
    <Pressable style={s.aiThread} onPress={() => router.push('/chatbot')} accessibilityRole="button" accessibilityLabel="Mở trợ lý HaiHand AI">
      <View style={s.aiAvatar}><Ionicons name="sparkles" size={24} color={colors.orange} /></View>
      <View style={s.copy}><Text style={s.name}>Trợ lý HaiHand AI</Text><Text style={s.preview} numberOfLines={1}>Hỏi đáp và tìm sản phẩm cùng AI</Text></View>
      <View style={s.pin}><Ionicons name="pin" size={16} color={colors.orange} /><Ionicons name="chevron-forward" size={18} color={colors.muted} /></View>
    </Pressable>
    {!user ? <View style={s.guest}><Text style={s.muted}>Đăng nhập để xem và gửi tin nhắn.</Text><Button title="Đăng nhập" onPress={() => router.push('/login')} /></View> : <>
      <View style={s.search}><Ionicons name="search-outline" size={20} color={colors.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Tìm cuộc trò chuyện" placeholderTextColor={colors.muted} style={s.input} /></View>
      <Status loading={loading} error={error} empty={!loading && !error && !visible.length ? 'Chưa có cuộc trò chuyện nào.' : undefined} onRetry={load} />
      {!loading && !error && visible.map((item) => <Pressable key={item.otherUser._id} style={s.thread} onPress={() => router.push({ pathname: '/chat/[userId]', params: { userId: item.otherUser._id, name: item.otherUser.name } })}>
        {imageUrl(item.otherUser.avatar) ? <Image source={{ uri: imageUrl(item.otherUser.avatar) }} style={s.avatar} /> : <View style={s.avatarFallback}><Ionicons name="person" size={23} color={colors.orange} /></View>}
        <View style={s.copy}><Text style={s.name}>{item.otherUser.name}</Text><Text style={s.preview} numberOfLines={1}>{item.lastMessage?.content || (item.lastMessage?.images?.length ? 'Hình ảnh' : 'Tin nhắn mới')}</Text></View>
        <View style={s.meta}><Text style={s.time}>{item.timestamp ? new Date(item.timestamp).toLocaleDateString('vi-VN') : ''}</Text>{item.unreadCount > 0 && <Text style={s.badge}>{item.unreadCount}</Text>}</View>
      </Pressable>)}
    </>}
  </Screen>;
}

const s = StyleSheet.create({
  guest: { paddingTop: 55, gap: 14 }, muted: { color: colors.muted, textAlign: 'center' }, search: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, marginBottom: 12 }, input: { flex: 1, color: colors.text },
  aiThread: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, marginBottom: 14, borderRadius: 14, backgroundColor: '#FFF0B8', borderWidth: 1, borderColor: colors.yellow }, aiAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, pin: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  thread: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, avatar: { width: 50, height: 50, borderRadius: 25 }, avatarFallback: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFF0A6', alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, gap: 4 }, name: { color: colors.text, fontWeight: '700', fontSize: 15 }, preview: { color: colors.muted, fontSize: 13 }, meta: { alignItems: 'flex-end', gap: 6 }, time: { color: colors.muted, fontSize: 11 }, badge: { backgroundColor: colors.orange, color: colors.surface, overflow: 'hidden', minWidth: 20, textAlign: 'center', borderRadius: 10, fontSize: 11, padding: 3 },
});
