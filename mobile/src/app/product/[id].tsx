import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { formatPrice, imageUrl, productTitle, request, type Product, type User } from '../../api/client';
import { recordProductView } from '../../api/recommendations';
import { useSession } from '../../auth/SessionContext';
import { Button, Notice, Screen, Status } from '../../components/ui';
import { colors } from '../../theme';

export default function ProductDetailScreen() {
  const { width } = useWindowDimensions();
  const gallerySize = Math.min(width, 480);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, token, ready } = useSession();
  const lastRecordedView = useRef('');
  const [product, setProduct] = useState<Product | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const post = await request<Product | null>(`/api/posts/${id}`);
      if (!post) throw new Error('Không tìm thấy sản phẩm.');
      setProduct(post);
      if (user) {
        const saved = await request<Product[]>(`/api/users/favorites/${user._id}`, { token: token || undefined });
        setFavorite(saved.some((item) => item._id === id));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được sản phẩm.'); }
    finally { setLoading(false); }
  }, [id, user, token]);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!ready || !product || product._id !== id) return;
    const viewKey = `${user?._id ?? 'guest'}:${product._id}`;
    if (lastRecordedView.current === viewKey) return;
    lastRecordedView.current = viewKey;
    recordProductView(product._id, token);
  }, [id, product, ready, token, user?._id]);
  const requireLogin = () => { if (!user) { router.push('/login'); return false; } return true; };
  const addToCart = async (buyNow = false) => {
    if (!requireLogin() || !product) return;
    setBusy(true); setMessage('');
    try {
      await request('/api/users/cart', { method: 'POST', token: token || undefined, body: { userId: user!._id, postId: product._id, quantity: 1 } });
      if (buyNow) router.push('/cart'); else setMessage('Đã thêm vào giỏ hàng.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Không thêm được vào giỏ hàng.'); }
    finally { setBusy(false); }
  };
  const toggleFavorite = async () => {
    if (!requireLogin() || !product) return;
    try {
      await request('/api/users/favorites', { method: 'POST', token: token || undefined, body: { userId: user!._id, postId: product._id } });
      setFavorite((value) => !value);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Không cập nhật được yêu thích.'); }
  };
  const seller = product && typeof product.author === 'object' ? product.author as User : product && typeof product.sellerId === 'object' ? product.sellerId as User : null;

  return <Screen title="Chi tiết sản phẩm">
    <Status loading={loading} error={error} onRetry={load} />
    {product && !loading && <>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={s.gallery}>
        {(product.images || (product.image ? [product.image] : [])).map((path, index) => {
          const uri = imageUrl(path);
          return uri ? <Image key={`${path}-${index}`} source={{ uri }} resizeMode="contain" style={{ width: gallerySize, height: gallerySize }} /> : null;
        })}
      </ScrollView>
      <View style={s.card}>
        <View style={s.titleRow}><Text style={s.title}>{productTitle(product)}</Text><Pressable accessibilityLabel={favorite ? 'Bỏ yêu thích' : 'Yêu thích'} onPress={toggleFavorite}><Ionicons name={favorite ? 'heart' : 'heart-outline'} size={27} color={favorite ? colors.red : colors.orange} /></Pressable></View>
        <Text style={s.price}>{formatPrice(product.price)}</Text>
        {!!product.originalPrice && <Text style={s.oldPrice}>{formatPrice(product.originalPrice)}</Text>}
        <Text style={s.meta}>{product.condition || 'Đã qua sử dụng'} · {product.location || 'Việt Nam'}</Text>
      </View>
      <View style={s.card}><Text style={s.sectionTitle}>Mô tả từ người bán</Text><Text style={s.description}>{product.description || 'Người bán chưa thêm mô tả.'}</Text></View>
      {seller && <Pressable style={s.card} onPress={() => router.push({ pathname: '/user/[id]', params: { id: seller._id } })}>
        <Text style={s.sectionTitle}>Người bán</Text><Text style={s.seller}>{seller.name}</Text><Text style={s.meta}>Xem hồ sơ công khai  →</Text>
      </Pressable>}
      {message && <Notice>{message}</Notice>}
      <View style={s.actions}>
        {seller && seller._id !== user?._id && <Button title="Nhắn tin" icon="chatbubble-outline" secondary onPress={() => router.push({ pathname: '/chat/[userId]', params: { userId: seller._id, postId: product._id } })} />}
        <Button title={busy ? 'Đang xử lý...' : 'Thêm vào giỏ hàng'} icon="bag-add-outline" onPress={() => void addToCart()} disabled={busy || product.stockQuantity === 0} />
        <Button title="Mua ngay" onPress={() => void addToCart(true)} disabled={busy || product.stockQuantity === 0} />
      </View>
    </>}
  </Screen>;
}

const s = StyleSheet.create({
  gallery: { marginHorizontal: -14, backgroundColor: '#F4ECE8' },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 15, marginTop: 12, borderWidth: 1, borderColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, title: { color: colors.text, fontSize: 20, fontWeight: '700', flex: 1, lineHeight: 27 },
  price: { color: colors.orange, fontSize: 24, fontWeight: '700', marginTop: 8 }, oldPrice: { color: colors.muted, textDecorationLine: 'line-through', marginTop: 3 }, meta: { color: colors.muted, fontSize: 13, marginTop: 8 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 7 }, description: { color: colors.text, lineHeight: 23, fontSize: 14 }, seller: { color: colors.text, fontSize: 15, fontWeight: '600' },
  actions: { marginTop: 15, gap: 3 },
});
