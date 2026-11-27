import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../theme';

export function Header({ title, right }: { title: string; right?: ReactNode }) {
  return <View style={s.pageHeader}>
    <Pressable onPress={() => router.canGoBack() ? router.back() : router.navigate('/')} accessibilityLabel="Quay lại" style={s.back}>
      <Ionicons name="arrow-back" size={23} color={colors.text} />
    </Pressable>
    <Text style={s.title} numberOfLines={1}>{title}</Text>
    <View style={s.right}>{right}</View>
  </View>;
}

export function HomeHeader({ query, onChangeQuery, onSearch, cartCount, unreadCount }: {
  query: string;
  onChangeQuery: (value: string) => void;
  onSearch: () => void;
  cartCount: number;
  unreadCount: number;
}) {
  return <View style={s.homeHeader}>
    <View style={s.searchBox}>
      <Ionicons name="search-outline" size={21} color={colors.muted} />
      <TextInput value={query} onChangeText={onChangeQuery} onSubmitEditing={onSearch} returnKeyType="search" accessibilityLabel="Tìm sản phẩm" placeholder="Tìm sản phẩm trên HaiHand" placeholderTextColor={colors.muted} style={s.searchInput} />
      <Pressable onPress={() => router.push('/image-search')} accessibilityLabel="Tìm bằng ảnh"><Ionicons name="camera-outline" size={22} color={colors.muted} /></Pressable>
    </View>
    <Pressable style={s.headerIcon} onPress={() => router.push('/cart')} accessibilityLabel="Giỏ hàng">
      <Ionicons name="bag-outline" size={25} color={colors.text} />
      {cartCount > 0 && <Text style={s.badge}>{cartCount}</Text>}
    </Pressable>
    <Pressable style={s.headerIcon} onPress={() => router.push('/inbox')} accessibilityLabel="Tin nhắn">
      <Ionicons name="chatbubble-outline" size={25} color={colors.text} />
      {unreadCount > 0 && <Text style={s.badge}>{unreadCount}</Text>}
    </Pressable>
  </View>;
}

const s = StyleSheet.create({
  pageHeader: { backgroundColor: colors.yellow, minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  back: { width: 40, height: 44, justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 19, fontWeight: '700' },
  right: { width: 40, alignItems: 'flex-end' },
  homeHeader: { height: 68, backgroundColor: colors.yellow, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBox: { flex: 1, height: 44, paddingHorizontal: 12, borderRadius: 24, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, height: '100%', fontSize: 13 },
  headerIcon: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 1, right: 0, minWidth: 17, textAlign: 'center', borderRadius: 9, paddingHorizontal: 3, color: '#FFFFFF', backgroundColor: colors.red, fontSize: 10, fontWeight: '700' },
});
