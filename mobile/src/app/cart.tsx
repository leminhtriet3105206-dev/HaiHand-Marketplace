import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatPrice, productImage, productTitle, request, type CartItem } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, Notice, Screen, Status } from '../components/ui';
import { readCart, writeCart } from '../data/cartCache';
import { colors } from '../theme';

export default function CartScreen() {
  const { user, token } = useSession();
  const [items, setItems] = useState<CartItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    let cached = false;
    try {
      const saved = await readCart(user._id).catch(() => null);
      if (saved) { cached = true; setItems(saved); setSelected(saved.map((item) => item.product._id)); setLoading(false); }
      const data = await request<CartItem[]>(`/api/users/cart/${user._id}`, { token: token || undefined });
      setItems(data); setSelected(data.map((item) => item.product._id));
      void writeCart(user._id, data).catch(() => {});
    } catch (cause) { setError(`${cached ? 'Đang hiển thị giỏ hàng đã lưu. ' : ''}${cause instanceof Error ? cause.message : 'Không tải được giỏ hàng.'}`); }
    finally { setLoading(false); }
  }, [user, token]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  const changeQuantity = async (id: string, delta: number) => {
    if (!user) return;
    try {
      await request('/api/users/cart', { method: 'POST', token: token || undefined, body: { userId: user._id, postId: id, quantity: delta } });
      const updated = items.map((item) => item.product._id === id ? { ...item, quantity: item.quantity + delta } : item);
      setItems(updated); void writeCart(user._id, updated).catch(() => {});
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đổi được số lượng.'); }
  };
  const remove = async (id: string) => {
    if (!user) return;
    try {
      await request(`/api/users/cart/${user._id}/${id}`, { method: 'DELETE', token: token || undefined });
      const updated = items.filter((item) => item.product._id !== id);
      setItems(updated); void writeCart(user._id, updated).catch(() => {});
      setSelected((current) => current.filter((value) => value !== id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không xóa được sản phẩm.'); }
  };
  const total = useMemo(() => items.filter((item) => selected.includes(item.product._id)).reduce((sum, item) => sum + item.product.price * item.quantity, 0), [items, selected]);
  return <Screen title="Giỏ hàng">
    {!user ? <View style={s.guest}><Text style={s.muted}>Đăng nhập để xem giỏ hàng.</Text><Button title="Đăng nhập" onPress={() => router.push('/login')} /></View> : <>
      <Text style={s.heading}>Sản phẩm đã chọn · {items.length}</Text>
      <Status loading={loading} error={!items.length ? error : undefined} empty={!loading && !error && !items.length ? 'Giỏ hàng của bạn đang trống.' : undefined} onRetry={load} />
      {!loading && items.map((item) => {
        const product = item.product;
        const checked = selected.includes(product._id);
        return <View key={product._id} style={s.item}>
          <Pressable onPress={() => setSelected((current) => checked ? current.filter((id) => id !== product._id) : [...current, product._id])} accessibilityLabel={checked ? 'Bỏ chọn sản phẩm' : 'Chọn sản phẩm'}><Ionicons name={checked ? 'checkbox' : 'square-outline'} size={23} color={colors.orange} /></Pressable>
          <Pressable onPress={() => router.push({ pathname: '/product/[id]', params: { id: product._id } })}>{productImage(product) ? <Image source={{ uri: productImage(product) }} style={s.image} /> : <View style={s.image} />}</Pressable>
          <View style={s.details}><Text style={s.title} numberOfLines={2}>{productTitle(product)}</Text><Text style={s.price}>{formatPrice(product.price)}</Text>
            <View style={s.controls}><Pressable onPress={() => item.quantity > 1 ? void changeQuantity(product._id, -1) : void remove(product._id)} style={s.quantityButton}><Text>−</Text></Pressable><Text style={s.quantity}>{item.quantity}</Text><Pressable onPress={() => void changeQuantity(product._id, 1)} disabled={!!product.stockQuantity && item.quantity >= product.stockQuantity} style={s.quantityButton}><Text>+</Text></Pressable><Pressable onPress={() => void remove(product._id)} style={s.delete}><Ionicons name="trash-outline" size={18} color={colors.red} /></Pressable></View>
          </View>
        </View>;
      })}
      {!!items.length && <View style={s.summary}><Text style={s.heading}>Tạm tính</Text><Text style={s.total}>{formatPrice(total)}</Text><Text style={s.muted}>Phí vận chuyển được tính ở bước thanh toán.</Text><Button title={`Thanh toán (${selected.length})`} disabled={!selected.length} onPress={() => router.push({ pathname: '/checkout', params: { ids: selected.join(',') } })} /></View>}
      {error && <Notice error>{error}</Notice>}
    </>}
  </Screen>;
}

const s = StyleSheet.create({
  guest: { paddingTop: 45, gap: 15 }, heading: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 12 },
  item: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 8 },
  image: { width: 75, height: 75, borderRadius: 8, backgroundColor: '#F0E8E4' }, details: { flex: 1, gap: 4 }, title: { color: colors.text, fontSize: 13, fontWeight: '600' }, price: { color: colors.orange, fontWeight: '700', fontSize: 15 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }, quantityButton: { width: 28, height: 28, borderWidth: 1, borderColor: colors.border, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, quantity: { color: colors.text, minWidth: 16, textAlign: 'center' }, delete: { marginLeft: 'auto' },
  summary: { marginTop: 14, backgroundColor: colors.surface, borderRadius: 12, padding: 15, gap: 7 }, total: { color: colors.orange, fontSize: 22, fontWeight: '700' }, muted: { color: colors.muted, fontSize: 13 },
});
