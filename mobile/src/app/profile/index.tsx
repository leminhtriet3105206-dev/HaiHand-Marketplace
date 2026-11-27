import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { imageUrl, request, type User } from '../../api/client';
import { useSession } from '../../auth/SessionContext';
import { Button, RowLink, Screen, Status } from '../../components/ui';
import { colors } from '../../theme';

export default function MyProfileScreen() {
  const { user, token } = useSession();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try { setProfile(await request<User>('/api/users/profile', { token: token || undefined })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được hồ sơ.'); }
    finally { setLoading(false); }
  }, [user, token]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  return <Screen title="Hồ sơ của tôi" tab="Tài khoản">
    {!user ? <Button title="Đăng nhập để xem hồ sơ" onPress={() => router.push('/login')} /> : <>
      <Status loading={loading} error={error} onRetry={load} />
      {profile && <>
        <View style={s.hero}>
          {imageUrl(profile.avatar) ? <Image source={{ uri: imageUrl(profile.avatar) }} style={s.avatar} /> : <View style={s.avatarFallback}><Ionicons name="person" size={40} color={colors.orange} /></View>}
          <Text style={s.name}>{profile.name}</Text><Text style={s.muted}>{profile.email}</Text>
          {!!profile.bio && <Text style={s.bio}>{profile.bio}</Text>}
          <Button title="Chỉnh sửa hồ sơ" onPress={() => router.push('/profile/edit')} secondary icon="create-outline" />
        </View>
        <View style={s.card}><Text style={s.heading}>Thông tin cá nhân</Text><Text style={s.line}>Số điện thoại: {profile.phone || 'Chưa cập nhật'}</Text><Text style={s.line}>Địa chỉ: {profile.address || 'Chưa cập nhật'}</Text></View>
        <RowLink label="Đơn mua" icon="receipt-outline" href="/orders" />
        <RowLink label="Người đang theo dõi" icon="people-outline" href="/following" />
        <RowLink label="Hồ sơ công khai" icon="globe-outline" href={{ pathname: '/user/[id]', params: { id: profile._id } }} />
      </>}
    </>}
  </Screen>;
}

const s = StyleSheet.create({
  hero: { backgroundColor: colors.surface, borderRadius: 14, padding: 20, alignItems: 'center', gap: 7, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 86, height: 86, borderRadius: 43 }, avatarFallback: { width: 86, height: 86, borderRadius: 43, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0A6' },
  name: { color: colors.text, fontSize: 20, fontWeight: '700' }, muted: { color: colors.muted, fontSize: 13 }, bio: { color: colors.text, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 15, marginVertical: 15, gap: 8 },
  heading: { fontSize: 16, fontWeight: '700', color: colors.text }, line: { color: colors.muted, fontSize: 13 },
});
