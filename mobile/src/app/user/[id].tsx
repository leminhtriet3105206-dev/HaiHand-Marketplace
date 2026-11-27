import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { imageUrl, request, type Product, type User } from '../../api/client';
import { useSession } from '../../auth/SessionContext';
import { Button, ProductGrid, Screen, Status } from '../../components/ui';
import { colors } from '../../theme';

type PublicProfile = { user: User; posts: Product[]; followersCount: number; followingCount: number; avgRating: number | string; responseRate?: number };

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, token } = useSession();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await request<PublicProfile>(`/api/users/public-profile/${id}`);
      setProfile(data);
      if (user && user._id !== id) {
        const status = await request<{ isFollowing: boolean }>(`/api/users/follow-status?followerId=${user._id}&followingId=${id}`, { token: token || undefined });
        setFollowing(status.isFollowing);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được hồ sơ công khai.'); }
    finally { setLoading(false); }
  }, [id, user, token]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  const follow = async () => {
    if (!user) return router.push('/login');
    try {
      const result = await request<{ isFollowing: boolean }>('/api/users/follow', { method: 'POST', token: token || undefined, body: { followerId: user._id, followingId: id } });
      setFollowing(result.isFollowing);
      setProfile((current) => current && { ...current, followersCount: current.followersCount + (result.isFollowing ? 1 : -1) });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không theo dõi được người bán.'); }
  };
  return <Screen title="Hồ sơ công khai">
    <Status loading={loading} error={error} onRetry={load} />
    {profile && !loading && <>
      <View style={s.hero}>
        {imageUrl(profile.user.avatar) ? <Image source={{ uri: imageUrl(profile.user.avatar) }} style={s.avatar} /> : <View style={s.avatarFallback}><Ionicons name="person" size={39} color={colors.orange} /></View>}
        <Text style={s.name}>{profile.user.name}</Text><Text style={s.bio}>{profile.user.bio || 'Thành viên HaiHand'}</Text>
        <View style={s.metrics}><Text style={s.metric}>★ {profile.avgRating}</Text><Text style={s.metric}>{profile.followersCount} người theo dõi</Text><Text style={s.metric}>{profile.posts.length} tin đăng</Text></View>
        {user?._id !== id && <View style={s.actions}><Button title={following ? 'Đang theo dõi' : 'Theo dõi'} onPress={follow} secondary={following} /><Button title="Nhắn tin" onPress={() => router.push({ pathname: '/chat/[userId]', params: { userId: id } })} secondary /></View>}
      </View>
      <Text style={s.heading}>Tin đăng của người bán</Text><ProductGrid products={profile.posts} />
    </>}
  </Screen>;
}

const s = StyleSheet.create({
  hero: { backgroundColor: colors.surface, borderRadius: 14, padding: 20, alignItems: 'center', gap: 9, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 82, height: 82, borderRadius: 41 }, avatarFallback: { width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0A6' },
  name: { color: colors.text, fontSize: 20, fontWeight: '700' }, bio: { color: colors.muted, fontSize: 13 }, metrics: { flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }, metric: { fontSize: 12, color: colors.orange, fontWeight: '600' },
  actions: { width: '100%', marginTop: 10 }, heading: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 20, marginBottom: 12 },
});
