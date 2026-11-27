import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { imageUrl, queryString, request, type Category, type Product } from '../api/client';
import { getViewedProductRecommendations } from '../api/recommendations';
import { useSession } from '../auth/SessionContext';
import { Footer } from '../components/Footer';
import { HomeHeader } from '../components/Header';
import { ProductList, ProductTile, Status } from '../components/ui';
import { useCategories } from '../data/useCategories';
import { colors } from '../theme';

const icons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  'Thú cưng & Đồ dùng': 'paw-outline',
  'Điện thoại & Phụ kiện': 'cellphone',
  'Điện tử & Công nghệ': 'laptop',
  'Xe cộ & Phụ tùng': 'motorbike',
  'Thời trang & Phụ kiện': 'hanger',
  'Thời trang': 'hanger',
  'Điện tử & Phụ kiện': 'cellphone',
  'Nhà cửa & Đời sống': 'sofa-outline',
  'Sức khỏe & Làm đẹp': 'heart-pulse',
  'Mẹ & Bé': 'baby-face-outline',
  'Đồ gia dụng & Nội thất': 'sofa-outline',
  'Đồ chơi, Mẹ & Bé': 'baby-face-outline',
  'Thể thao & Dã ngoại': 'basketball',
};
const PAGE_SIZE = 12;

function CategoryArtwork({ category }: { category: Category }) {
  const [imageFailed, setImageFailed] = useState(false);
  const uri = imageUrl(category.image);
  return <View style={s.categoryIcon}>
    {uri && !imageFailed
      ? <Image source={{ uri }} style={s.categoryImage} onError={() => setImageFailed(true)} />
      : <MaterialCommunityIcons name={icons[category.name] || 'shape-outline'} size={27} color={colors.orange} />}
  </View>;
}

export default function HomeScreen() {
  const { user, token, ready } = useSession();
  const [personalized, setPersonalized] = useState<{ userId?: string; items: Product[] }>();
  const userId = user?._id;
  const recommendations = personalized?.userId === userId ? personalized?.items ?? [] : [];
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<'all' | 'newest' | 'price-asc'>('all');
  const [products, setProducts] = useState<Product[]>([]);
  const categories = useCategories();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const moreRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const currentGeneration = ++generation.current;
    moreRequest.current?.abort();
    moreRequest.current = null;
    setLoading(true);
    setError('');
    setLoadingMore(false);
    setMoreError('');
    setHasMore(false);
    try {
      const posts = await request<Product[]>(`/api/posts${queryString({ page: 1, limit: PAGE_SIZE, sort: sortMode === 'all' ? undefined : sortMode })}`, { timeoutMs: 10000 });
      if (currentGeneration !== generation.current) return;
      setProducts(posts);
      setPage(1);
      setHasMore(posts.length === PAGE_SIZE);
      setLoading(false);
      if (user && token) {
        const [saved, cart, unread] = await Promise.allSettled([
          request<Product[]>(`/api/users/favorites/${user._id}`, { token, timeoutMs: 10000 }),
          request<unknown[]>(`/api/users/cart/${user._id}`, { token, timeoutMs: 10000 }),
          request<{ count: number }>(`/api/messages/unread-count/${user._id}`, { token, timeoutMs: 10000 }),
        ]);
        if (currentGeneration !== generation.current) return;
        setFavorites(saved.status === 'fulfilled' ? saved.value.map((item) => item._id) : []);
        setCartCount(cart.status === 'fulfilled' ? cart.value.length : 0);
        setUnreadCount(unread.status === 'fulfilled' ? unread.value.count : 0);
      } else {
        setFavorites([]);
        setCartCount(0);
        setUnreadCount(0);
      }
    } catch (cause) {
      if (currentGeneration === generation.current) setError(cause instanceof Error ? cause.message : 'Không tải được Trang chủ.');
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
    }
  }, [user, token, sortMode]);

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);

  useFocusEffect(useCallback(() => {
    if (!ready) return;
    const controller = new AbortController();
    setPersonalized(undefined);
    const show = (items: Product[]) => {
      if (!controller.signal.aborted) setPersonalized({ userId, items });
    };
    void getViewedProductRecommendations(token, controller.signal).then(show, () => show([]));
    return () => controller.abort();
  }, [ready, token, userId]));

  const loadMore = async (force = false) => {
    if (loading || loadingMore || !hasMore || (moreError && !force) || moreRequest.current) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    const currentGeneration = generation.current;
    setLoadingMore(true);
    setMoreError('');
    try {
      const nextPage = page + 1;
      const posts = await request<Product[]>(`/api/posts${queryString({ page: nextPage, limit: PAGE_SIZE, sort: sortMode === 'all' ? undefined : sortMode })}`, { signal: controller.signal, timeoutMs: 10000 });
      if (currentGeneration !== generation.current) return;
      setProducts((current) => {
        const seen = new Set(current.map((item) => item._id));
        return [...current, ...posts.filter((item) => !seen.has(item._id))];
      });
      setPage(nextPage);
      setHasMore(posts.length === PAGE_SIZE);
    } catch (cause) {
      if (!controller.signal.aborted) setMoreError(cause instanceof Error ? cause.message : 'Không tải thêm được sản phẩm.');
    } finally {
      if (moreRequest.current === controller) moreRequest.current = null;
      if (currentGeneration === generation.current) setLoadingMore(false);
    }
  };

  const toggleFavorite = async (id: string) => {
    if (!user) return router.push('/login');
    try {
      await request('/api/users/favorites', { method: 'POST', body: { userId: user._id, postId: id }, token: token || undefined });
      setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không cập nhật được yêu thích.'); }
  };

  const search = () => router.push(`/explore${queryString({ search: query.trim() })}`);

  return <SafeAreaView style={s.safe} edges={['top', 'bottom']}><View style={s.page}>
    <HomeHeader query={query} onChangeQuery={setQuery} onSearch={search} cartCount={cartCount} unreadCount={unreadCount} />
    <ProductList products={!loading && !error ? products : []} favorites={favorites} onFavorite={toggleFavorite} onEndReached={() => void loadMore()} contentContainerStyle={s.content} footer={
      loadingMore ? <ActivityIndicator color={colors.orange} style={s.listFooter} /> : moreError ? <Pressable onPress={() => void loadMore(true)} style={s.listFooter}><Text style={s.more}>Tải thêm thất bại. Chạm để thử lại.</Text></Pressable> : null
    } header={<>
      <Pressable style={s.hero} onPress={() => router.push('/explore')}>
        <View style={s.heroCopy}><Text style={s.heroEyebrow}>ĐỒ CŨ GIÁ TỐT</Text><Text style={s.heroTitle}>Dọn nhà đón Tết</Text><Text style={s.heroSubtitle}>Săn đồ cũ giá hời, tiết kiệm thông minh</Text><Text style={s.heroLink}>Khám phá sản phẩm  →</Text></View>
        <Image source={require('../../assets/stitch-home/hero.jpg')} style={s.heroImage} />
      </Pressable>
      {categories.length > 0 && <View style={s.categoryScroller}>
        <View style={s.categoryHeading}>
          <Text style={s.sectionTitle} accessibilityRole="header">Danh mục</Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => router.push('/explore')}><Text style={s.more}>Xem tất cả →</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>{categories.map((category) => <Pressable key={category._id} accessibilityRole="button" style={s.category} onPress={() => router.push(`/explore${queryString({ category: category.name })}`)}>
        <CategoryArtwork category={category} />
        <Text style={s.categoryLabel} numberOfLines={2}>{category.name}</Text>
        </Pressable>)}</ScrollView>
      </View>}
      {recommendations.length > 0 && <View>
        <View style={s.sectionHeading}><Text style={s.sectionTitle} accessibilityRole="header">Gợi ý cho bạn</Text></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recommendationRow}>
          {recommendations.map((product) => <ProductTile key={product._id} product={product} style={s.recommendationTile} />)}
        </ScrollView>
      </View>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        <Pressable style={[s.chip, sortMode === 'all' && s.chipSelected]} onPress={() => setSortMode('all')}><Text style={s.chipText}>Tất cả</Text></Pressable>
        <Pressable style={[s.chip, sortMode === 'newest' && s.chipSelected]} onPress={() => setSortMode('newest')}><Text style={s.chipText}>Mới đăng</Text></Pressable>
        <Pressable style={[s.chip, sortMode === 'price-asc' && s.chipSelected]} onPress={() => setSortMode('price-asc')}><Text style={s.chipText}>Giá tăng dần</Text></Pressable>
      </ScrollView>
      <View style={s.sectionHeading}><Text style={s.sectionTitle}>Gợi ý hôm nay</Text><Pressable onPress={() => router.push('/explore')}><Text style={s.more}>Xem tất cả  →</Text></Pressable></View>
      <Status loading={loading} error={error} empty={!loading && !error && !products.length ? 'Chưa có sản phẩm nào.' : undefined} onRetry={load} />
    </>} />
    <Footer active="Trang chủ" />
  </View></SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.yellow }, page: { flex: 1, maxWidth: 480, width: '100%', alignSelf: 'center', backgroundColor: colors.background },
  content: { paddingHorizontal: 12, paddingBottom: 24 }, hero: { minHeight: 152, padding: 16, borderRadius: 16, backgroundColor: '#FFE5C5', flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroCopy: { flex: 1, gap: 4 }, heroEyebrow: { alignSelf: 'flex-start', backgroundColor: colors.orange, color: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden', borderRadius: 12, fontSize: 10, fontWeight: '700' },
  heroTitle: { color: colors.text, fontSize: 18, fontWeight: '700' }, heroSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 }, heroLink: { color: colors.orange, fontSize: 13, fontWeight: '600', marginTop: 7 }, heroImage: { width: 104, height: 104, borderRadius: 10 },
  categoryScroller: { marginTop: 20 }, categoryRow: { gap: 8, paddingRight: 12 }, category: { width: 82, alignItems: 'center' }, categoryIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, categoryImage: { width: 54, height: 54 },
  categoryLabel: { color: colors.text, textAlign: 'center', fontSize: 11, fontWeight: '600', lineHeight: 15, marginTop: 6 }, chips: { alignItems: 'center', gap: 8, paddingTop: 25, paddingBottom: 4 },
  chip: { height: 34, borderRadius: 18, paddingHorizontal: 14, backgroundColor: colors.surface, justifyContent: 'center' }, chipSelected: { backgroundColor: colors.yellow }, chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  sectionHeading: { marginTop: 24, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' }, more: { color: colors.orange, fontSize: 12, fontWeight: '600' },
  listFooter: { paddingVertical: 18, alignItems: 'center' },
  categoryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  recommendationRow: { gap: 10 },
  recommendationTile: { width: 156 },
});
