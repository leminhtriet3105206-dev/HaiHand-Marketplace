import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { request, type Product } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, ProductGrid, Screen, Status } from '../components/ui';
import { colors } from '../theme';

export default function FavoritesScreen() {
  const { user, token } = useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try { setProducts(await request<Product[]>(`/api/users/favorites/${user._id}`, { token: token || undefined })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được danh sách yêu thích.'); }
    finally { setLoading(false); }
  }, [user, token]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  const categories = [...new Set(products.map((item) => item.category))];
  const visible = useMemo(() => products.filter((item) => (!category || item.category === category) && (!search || `${item.title || item.name} ${item.location || ''}`.toLowerCase().includes(search.trim().toLowerCase()))), [products, search, category]);
  const remove = async (id: string) => {
    if (!user) return;
    try {
      await request('/api/users/favorites', { method: 'POST', token: token || undefined, body: { userId: user._id, postId: id } });
      setProducts((current) => current.filter((item) => item._id !== id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xóa được sản phẩm.'); }
  };
  return <Screen title="Yêu thích" tab="Yêu thích">
    {!user ? <View style={s.guest}><Text style={s.guestText}>Đăng nhập để xem sản phẩm bạn đã lưu.</Text><Button title="Đăng nhập" onPress={() => router.push('/login')} /></View> : <>
      <Text style={s.count}>Mục đã lưu · {products.length} sản phẩm</Text>
      <TextInput value={search} onChangeText={setSearch} placeholder="Tìm nhanh trong mục đã lưu..." placeholderTextColor={colors.muted} style={s.search} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        <Pressable onPress={() => setCategory('')} style={[s.chip, !category && s.active]}><Text style={s.chipText}>Tất cả</Text></Pressable>
        {categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[s.chip, category === item && s.active]}><Text style={s.chipText}>{item}</Text></Pressable>)}
      </ScrollView>
      <Status loading={loading} error={error} empty={!loading && !error && !visible.length ? 'Bạn chưa lưu sản phẩm nào phù hợp.' : undefined} onRetry={load} />
      {!loading && !error && <ProductGrid products={visible} favorites={visible.map((item) => item._id)} onFavorite={remove} />}
    </>}
  </Screen>;
}

const s = StyleSheet.create({
  guest: { paddingVertical: 50, gap: 16 }, guestText: { textAlign: 'center', color: colors.muted }, count: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
  search: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, height: 48, paddingHorizontal: 13, color: colors.text },
  chips: { gap: 7, paddingVertical: 14 }, chip: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 13, height: 35, justifyContent: 'center' }, active: { backgroundColor: colors.yellow }, chipText: { color: colors.text, fontWeight: '600', fontSize: 12 },
});
