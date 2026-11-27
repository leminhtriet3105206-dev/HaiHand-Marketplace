import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';

import { imageUrl } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, RowLink, Screen } from '../components/ui';
import { colors } from '../theme';

export default function AccountScreen() {
  const { user, logout } = useSession();
  return <Screen title="Tài khoản" tab="Tài khoản">
    {user ? <>
      <View style={s.userCard}>
        {imageUrl(user.avatar) ? <Image source={{ uri: imageUrl(user.avatar) }} style={s.avatar} /> : <View style={s.avatarFallback}><Ionicons name="person-outline" size={28} color={colors.orange} /></View>}
        <View style={s.userText}><Text style={s.name}>{user.name}</Text><Text style={s.email}>{user.email}</Text></View>
      </View>
      <Text style={s.section}>Đơn mua của tôi</Text>
      <RowLink label="Xem đơn mua" icon="receipt-outline" href="/orders" />
      <Text style={s.section}>Tài khoản</Text>
      <RowLink label="Hồ sơ của tôi" icon="person-circle-outline" href="/profile" />
      <RowLink label="Yêu thích" icon="heart-outline" href="/favorites" />
      <RowLink label="Người bán đang theo dõi" icon="people-outline" href="/following" />
      <RowLink label="Giỏ hàng" icon="bag-outline" href="/cart" />
      <RowLink label="Tin nhắn" icon="chatbubbles-outline" href="/inbox" />
      <RowLink label="Thông báo" icon="notifications-outline" href="/notifications" />
      <RowLink label="Đổi mật khẩu" icon="lock-closed-outline" href="/change-password" />
      <View style={s.logout}><Button title="Đăng xuất" secondary onPress={() => { void logout().then(() => router.replace('/')); }} /></View>
    </> : <View style={s.guest}><Ionicons name="person-circle-outline" size={70} color={colors.orange} /><Text style={s.name}>Chào mừng đến HaiHand</Text><Text style={s.email}>Đăng nhập để xem hồ sơ, đơn hàng và tin nhắn.</Text><Button title="Đăng nhập" onPress={() => router.push('/login')} /><Button title="Tạo tài khoản" secondary onPress={() => router.push('/register')} /></View>}
  </Screen>;
}

const s = StyleSheet.create({
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 18, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 58, height: 58, borderRadius: 29 }, avatarFallback: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0AE' },
  userText: { flex: 1 }, name: { color: colors.text, fontSize: 18, fontWeight: '700' }, email: { color: colors.muted, fontSize: 13, marginTop: 4 }, section: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: 9 },
  logout: { marginTop: 22 }, guest: { paddingTop: 55, alignItems: 'center', gap: 15 },
});
