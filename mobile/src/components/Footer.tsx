import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

const tabs: { label: string; href: Href; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Trang chủ', href: '/', icon: 'home-outline' },
  { label: 'Khám phá', href: '/explore', icon: 'compass-outline' },
  { label: 'Yêu thích', href: '/favorites', icon: 'heart-outline' },
  { label: 'Đơn mua', href: '/orders', icon: 'receipt-outline' },
  { label: 'Tài khoản', href: '/account', icon: 'person-outline' },
];

export function Footer({ active }: { active: string }) {
  return <View style={s.bottomNav}>{tabs.map((item) => <Pressable key={item.label} onPress={() => router.navigate(item.href)} accessibilityRole="tab" accessibilityState={{ selected: active === item.label }} style={s.tab}>
    <Ionicons name={item.icon} size={24} color={active === item.label ? colors.orange : colors.muted} />
    <Text style={[s.tabText, active === item.label && s.tabActive]} numberOfLines={1}>{item.label}</Text>
  </Pressable>)}</View>;
}

const s = StyleSheet.create({
  bottomNav: { minHeight: 66, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', paddingTop: 8 },
  tab: { width: '20%', alignItems: 'center', gap: 3 },
  tabText: { fontSize: 10, color: colors.muted, fontWeight: '600' },
  tabActive: { color: colors.orange },
});
