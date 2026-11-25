import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { request, type Product } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, ProductList, Screen, Status } from '../components/ui';
import { fetchProductPage, readCachedProducts, writeCachedProducts } from '../data/productRepository';
import { readFilters, writeFilters } from '../data/filterStore';
import { useCategories } from '../data/useCategories';
import { colors } from '../theme';

const sorts = [
  { label: 'Mới nhất', value: 'newest' },
  { label: 'Giá thấp trước', value: 'price-asc' },
  { label: 'Giá cao trước', value: 'price-desc' },
];
const PAGE_SIZE = 20;

export default function ExploreScreen() {
  const params = useLocalSearchParams<{ search?: string; category?: string; sort?: string }>();
  const { user, token } = useSession();
  const [search, setSearch] = useState(params.search || '');
  const [category, setCategory] = useState(params.category || '');
  const [location, setLocation] = useState('');
  const [sort, setSort] = useState(params.sort || 'newest');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const categories = useCategories();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [retry, setRetry] = useState(0);
  const [submitted, setSubmitted] = useState({ search: params.search || '', category: params.category || '', location: '', sort: params.sort || 'newest', minPrice: '', maxPrice: '' });
  const moreRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const routeKey = useRef(`${params.search || ''}|${params.category || ''}|${params.sort || ''}`);

  useEffect(() => {
    if (params.search || params.category || params.sort) return;
    let active = true;
    void readFilters().then((saved) => {
      if (!active || !saved) return;
      setSearch(saved.search); setCategory(saved.category); setLocation(saved.location); setSort(saved.sort);
      setMinPrice(saved.minPrice); setMaxPrice(saved.maxPrice); setSubmitted(saved);
    }).catch(() => {});
    return () => { active = false; };
  }, [params.search, params.category, params.sort]);

  useEffect(() => {
    const next = `${params.search || ''}|${params.category || ''}|${params.sort || ''}`;
    if (next === routeKey.current) return;
    routeKey.current = next;
    const timer = setTimeout(() => {
      setSearch(params.search || ''); setCategory(params.category || ''); setSort(params.sort || 'newest');
      setSubmitted({ search: params.search || '', category: params.category || '', location: '', sort: params.sort || 'newest', minPrice: '', maxPrice: '' });
    }, 0);
    return () => clearTimeout(timer);
  }, [params.search, params.category, params.sort]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void request<Product[]>(`/api/users/favorites/${user._id}`, { token: token || undefined, signal: controller.signal })
        .then((saved) => setFavorites(saved.map((item) => item._id))).catch(() => {});
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [user, token]);

  useEffect(() => {
    const controller = new AbortController();
    const currentGeneration = ++generation.current;
    moreRequest.current?.abort();
    moreRequest.current = null;
    const timer = setTimeout(() => {
      setLoading(true); setError(''); setMoreError(''); setLoadingMore(false); setProducts([]); setPage(1); setHasMore(false);
      void (async () => {
        let hasCache = false;
        try {
          const cached = await readCachedProducts(submitted).catch(() => null);
          if (controller.signal.aborted || generation.current !== currentGeneration) return;
          if (cached) {
            hasCache = true;
            setProducts(cached);
            setHasMore(cached.length === PAGE_SIZE);
            setLoading(false);
          }

          const posts = await fetchProductPage(submitted, 1, PAGE_SIZE, controller.signal);
          if (controller.signal.aborted || generation.current !== currentGeneration) return;
          setProducts(posts);
          setHasMore(posts.length === PAGE_SIZE);
          setError('');
          void writeCachedProducts(submitted, posts).catch(() => {});
        } catch (cause) {
          if (!controller.signal.aborted) {
            const message = cause instanceof Error ? cause.message : 'Không tải được sản phẩm.';
            setError(hasCache ? `Đang hiển thị dữ liệu đã lưu. ${message}` : message);
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [submitted, retry]);

  const loadMore = async (force = false) => {
    if (loading || loadingMore || !hasMore || (moreError && !force) || moreRequest.current) return;
    const controller = new AbortController();
    moreRequest.current = controller;
    const currentGeneration = generation.current;
    setLoadingMore(true); setMoreError('');
    try {
      const nextPage = page + 1;
      const posts = await fetchProductPage(submitted, nextPage, PAGE_SIZE, controller.signal);
      if (currentGeneration !== generation.current) return;
      setProducts((current) => {
        const seen = new Set(current.map((item) => item._id));
        return [...current, ...posts.filter((item) => !seen.has(item._id))];
      }); setPage(nextPage); setHasMore(posts.length === PAGE_SIZE);
    } catch (cause) {
      if (!controller.signal.aborted) setMoreError(cause instanceof Error ? cause.message : 'Không tải thêm được sản phẩm.');
    } finally { if (moreRequest.current === controller) moreRequest.current = null; if (currentGeneration === generation.current) setLoadingMore(false); }
  };
  const apply = () => {
    const filters = { search: search.trim(), category, location: location.trim(), sort, minPrice, maxPrice };
    setSubmitted(filters);
    void writeFilters(filters).catch(() => {});
  };
  const selectCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    const filters = { search: search.trim(), category: nextCategory, location: location.trim(), sort, minPrice, maxPrice };
    setSubmitted(filters);
    void writeFilters(filters).catch(() => {});
  };
  const toggleFavorite = async (id: string) => {
    if (!user) return router.push('/login');
    try {
      await request('/api/users/favorites', { method: 'POST', token: token || undefined, body: { userId: user._id, postId: id } });
      setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không cập nhật được yêu thích.'); }
  };

  return <Screen title="Khám phá" tab="Khám phá" scroll={false}>
    <ProductList products={products} favorites={favorites} onFavorite={toggleFavorite} onEndReached={() => void loadMore()} header={<>
    <View style={s.searchBox}><Ionicons name="search-outline" size={20} color={colors.muted} /><TextInput value={search} onChangeText={setSearch} onSubmitEditing={apply} returnKeyType="search" placeholder="Tìm sản phẩm..." placeholderTextColor={colors.muted} style={s.searchInput} /><Pressable onPress={() => router.push('/image-search')} accessibilityLabel="Tìm bằng ảnh"><Ionicons name="camera-outline" size={22} color={colors.muted} /></Pressable></View>
    <Text style={s.heading}>Danh mục</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
      <Pressable onPress={() => selectCategory('')} style={[s.chip, !category && s.selected]}><Text style={s.chipText}>Tất cả</Text></Pressable>
      {categories.map((item) => <Pressable key={item._id || item.name} onPress={() => selectCategory(item.name)} style={[s.chip, category === item.name && s.selected]}><Text style={s.chipText}>{item.name}</Text></Pressable>)}
    </ScrollView>
    <Text style={s.heading}>Khu vực</Text><TextInput value={location} onChangeText={setLocation} placeholder="Nhập tỉnh, thành phố hoặc quận" placeholderTextColor={colors.muted} style={s.input} />
    <Text style={s.heading}>Khoảng giá</Text><View style={s.priceRow}><TextInput value={minPrice} onChangeText={setMinPrice} keyboardType="numeric" placeholder="Từ" placeholderTextColor={colors.muted} style={[s.input, s.priceInput]} /><Text style={s.separator}>–</Text><TextInput value={maxPrice} onChangeText={setMaxPrice} keyboardType="numeric" placeholder="Đến" placeholderTextColor={colors.muted} style={[s.input, s.priceInput]} /></View>
    <Text style={s.heading}>Sắp xếp</Text><View style={s.sortRow}>{sorts.map((item) => <Pressable key={item.value} onPress={() => setSort(item.value)} style={[s.chip, sort === item.value && s.selected]}><Text style={s.chipText}>{item.label}</Text></Pressable>)}</View>
    <Button title="Áp dụng bộ lọc" onPress={apply} />
    <View style={s.results}><Text style={s.resultsTitle}>Danh sách tin đăng</Text><Text style={s.count}>{products.length} sản phẩm</Text></View>
    <Status loading={loading} error={error} empty={!loading && !error && !products.length ? 'Không tìm thấy sản phẩm phù hợp.' : undefined} onRetry={() => setRetry((value) => value + 1)} />
    </>} footer={loadingMore ? <Status loading /> : moreError ? <Button title="Thử tải thêm" secondary onPress={() => void loadMore(true)} /> : null} />
  </Screen>;
}

const s = StyleSheet.create({
  searchBox: { backgroundColor: colors.surface, borderRadius: 24, height: 46, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14 }, heading: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  chipRow: { gap: 7, paddingBottom: 4 }, sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  chip: { backgroundColor: '#F0E8E4', borderRadius: 22, minHeight: 35, justifyContent: 'center', paddingHorizontal: 12 }, selected: { backgroundColor: colors.yellow }, chipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 9, height: 44, paddingHorizontal: 12, color: colors.text },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, priceInput: { flex: 1 }, separator: { color: colors.muted },
  results: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 }, resultsTitle: { color: colors.text, fontSize: 17, fontWeight: '700' }, count: { color: colors.muted, fontSize: 12 },
});
