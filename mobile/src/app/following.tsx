import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { imageUrl, request, type User } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, Screen, Status } from '../components/ui';
import { colors } from '../theme';

type Follow = { _id: string; follower?: User; following?: User };

export default function FollowingScreen() {
  const { user, token } = useSession();
  const [type, setType] = useState<'following' | 'followers'>('following');
  const [list, setList] = useState<Follow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try { setList(await request<Follow[]>(`/api/users/${user._id}/follow-list?type=${type}`, { token: token || undefined })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được danh sách.'); }
    finally { setLoading(false); }
  }, [user, token, type]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  return <Screen title="Danh sách theo dõi" tab="Tài khoản">
    {!user ? <Button title="Đăng nhập" onPress={() => router.push('/login')} /> : <>
      <View style={s.tabs}><Pressable onPress={() => setType('following')} style={[s.tab, type === 'following' && s.active]}><Text style={s.tabText}>Đang theo dõi</Text></Pressable><Pressable onPress={() => setType('followers')} style={[s.tab, type === 'followers' && s.active]}><Text style={s.tabText}>Người theo dõi</Text></Pressable></View>
      <Status loading={loading} error={error} empty={!loading && !error && !list.length ? 'Chưa có người dùng nào trong danh sách.' : undefined} onRetry={load} />
      {!loading && !error && list.map((follow) => {
        const person = type === 'following' ? follow.following : follow.follower;
        if (!person) return null;
        return <Pressable key={follow._id} style={s.row} onPress={() => router.push({ pathname: '/user/[id]', params: { id: person._id } })}>
          {imageUrl(person.avatar) ? <Image source={{ uri: imageUrl(person.avatar) }} style={s.avatar} /> : <View style={s.fallback}><Ionicons name="person" size={23} color={colors.orange} /></View>}
          <View style={s.text}><Text style={s.name}>{person.name}</Text><Text style={s.email}>{person.email}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>;
      })}
    </>}
  </Screen>;
}

const s = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 15 }, tab: { flex: 1, minHeight: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, active: { backgroundColor: colors.yellow }, tabText: { color: colors.text, fontWeight: '600' },
  row: { minHeight: 72, backgroundColor: colors.surface, borderRadius: 10, marginBottom: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 }, avatar: { width: 46, height: 46, borderRadius: 23 }, fallback: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFF0A6', alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 }, name: { color: colors.text, fontWeight: '700' }, email: { color: colors.muted, fontSize: 12, marginTop: 3 },
});
