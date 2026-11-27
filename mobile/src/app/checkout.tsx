import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatPrice, request, type Address, type CartItem } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, Field, Notice, Screen, Status } from '../components/ui';
import { emptyAddressDraft, readAddressDraft, writeAddressDraft } from '../data/addressDraft';
import { writeCart } from '../data/cartCache';
import { validPhone } from '../domain/validation';
import { colors } from '../theme';

type Province = { ProvinceID: number; ProvinceName: string };
type District = { DistrictID: number; DistrictName: string };
type Ward = { WardCode: string; WardName: string };
type AddressResponse = { addresses: Address[]; profile: { name: string; phone: string } };
type CheckoutResponse = { success: boolean; paymentUrl?: string; parentOrderId: string; amount: number };
type ShippingQuote = { fee: number };

function useAddressOptions<T>(path: string) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ path: string; items: T[]; failed: boolean }>();
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    void request<T[]>(path, { signal: controller.signal, timeoutMs: 10000 }).then(
      (items) => { if (!controller.signal.aborted) setResult({ path, items, failed: false }); },
      () => { if (!controller.signal.aborted) setResult({ path, items: [], failed: true }); },
    );
    return () => controller.abort();
  }, [path, retry]);
  return {
    items: result?.path === path ? result.items : [],
    failed: result?.path === path && result.failed,
    loading: !!path && result?.path !== path,
    retry: () => { setResult(undefined); setRetry((count) => count + 1); },
  };
}

export default function CheckoutScreen() {
  const { user } = useSession();
  return <CheckoutForm key={user?._id ?? 'guest'} />;
}

function CheckoutForm() {
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const { user, token } = useSession();
  const userId = user?._id;
  const [items, setItems] = useState<CartItem[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [address, setAddress] = useState<Address | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(emptyAddressDraft);
  const addressFormOpen = useRef(false);
  const [draftError, setDraftError] = useState('');
  const provinces = useAddressOptions<Province>(adding ? '/api/shipping/provinces' : '');
  const districts = useAddressOptions<District>(adding && draft.provinceId ? `/api/shipping/districts?provinceId=${draft.provinceId}` : '');
  const wards = useAddressOptions<Ward>(adding && draft.districtId ? `/api/shipping/wards?districtId=${draft.districtId}` : '');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'VNPAY'>('COD');
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [shippingError, setShippingError] = useState('');
  const [shippingLoading, setShippingLoading] = useState(false);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [loadRetry, setLoadRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [addressErrors, setAddressErrors] = useState<{ fullName?: string; phone?: string; street?: string; region?: string }>({});
  const [locating, setLocating] = useState(false);

  const load = useCallback(async (signal: AbortSignal) => {
    if (!userId) return;
    setLoading(true); setLoadError('');
    try {
      const [cart, book, savedDraft] = await Promise.all([
        request<CartItem[]>(`/api/users/cart/${userId}`, { token: token || undefined, signal, timeoutMs: 10000 }),
        request<AddressResponse>('/api/addresses', { token: token || undefined, signal, timeoutMs: 10000 }),
        readAddressDraft(userId),
      ]);
      if (signal.aborted) return;
      setItems(cart.filter((item) => (ids || '').split(',').includes(item.product._id)));
      setAddresses(book.addresses);
      setAddress(book.addresses.find((item) => item.isDefault) || book.addresses[0] || null);
      addressFormOpen.current = !!savedDraft;
      setDraft(savedDraft ?? emptyAddressDraft(book.profile.name, book.profile.phone));
      setAdding(!!savedDraft);
    } catch (cause) {
      if (!signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Không tải được thông tin thanh toán.');
    } finally { if (!signal.aborted) setLoading(false); }
  }, [userId, token, ids]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { void load(controller.signal); }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load, loadRetry]);
  useEffect(() => {
    if (!userId || !adding || !addressFormOpen.current) return;
    let active = true;
    void writeAddressDraft(userId, draft).then(
      () => { if (active) setDraftError(''); },
      () => { if (active) setDraftError('Thiết bị không lưu được bản nháp địa chỉ.'); },
    );
    return () => { active = false; };
  }, [userId, adding, draft]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setShippingFee(null); setShippingError('');
      if (!address || !items.length || !token) { setShippingLoading(false); return; }
      setShippingLoading(true);
      const groups = new Map<string, CartItem[]>();
      for (const item of items) {
        const seller = item.product.sellerId || item.product.author;
        const sellerId = typeof seller === 'string' ? seller : seller?._id;
        if (!sellerId) { setShippingError('Sản phẩm thiếu thông tin người bán.'); setShippingLoading(false); return; }
        groups.set(sellerId, [...(groups.get(sellerId) || []), item]);
      }
      void Promise.all([...groups].map(([sellerId, packageItems]) => request<ShippingQuote>('/api/shipping/calculate', {
        method: 'POST', token, signal: controller.signal,
        body: { sellerId, toAddress: address, items: packageItems.map((item) => ({ productId: item.product._id, quantity: item.quantity })) },
      }))).then((quotes) => {
        if (!controller.signal.aborted) setShippingFee(quotes.reduce((sum, quote) => sum + Math.max(0, Number(quote.fee) || 0), 0));
      }).catch((cause) => {
        if (!controller.signal.aborted) setShippingError(cause instanceof Error ? cause.message : 'Không tính được phí vận chuyển.');
      }).finally(() => { if (!controller.signal.aborted) setShippingLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [address, items, token, quoteRetry]);
  const openAddressForm = () => {
    addressFormOpen.current = true;
    setAdding(true); setError('');
  };
  const closeAddressForm = (saved?: Address) => {
    addressFormOpen.current = false;
    setAdding(false); setAddressErrors({}); setError(''); setDraftError('');
    setDraft(emptyAddressDraft(saved?.fullName ?? user?.name, saved?.phone ?? user?.phone));
    if (userId) void writeAddressDraft(userId, null).catch(() => setError('Thiết bị không xóa được bản nháp địa chỉ.'));
  };
  const chooseProvince = (value: Province) => {
    setDraft((current) => ({ ...current, provinceId: value.ProvinceID, provinceName: value.ProvinceName, districtId: undefined, districtName: '', wardCode: '', wardName: '' }));
  };
  const chooseDistrict = (value: District) => {
    setDraft((current) => ({ ...current, districtId: value.DistrictID, districtName: value.DistrictName, wardCode: '', wardName: '' }));
  };
  const suggestCurrentAddress = async () => {
    setLocating(true); setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { setError('Cần cấp quyền vị trí để tìm địa chỉ hiện tại.'); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync(position.coords);
      if (!place) throw new Error('Không xác định được địa chỉ.');
      setDraft((current) => ({ ...current, street: [place.streetNumber, place.street].filter(Boolean).join(' ') || current.street }));
      setError('Đã gợi ý tên đường. Hãy kiểm tra số nhà và chọn tỉnh, quận, phường chính xác trước khi lưu.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lấy được vị trí.'); }
    finally { setLocating(false); }
  };
  const saveAddress = async () => {
    const errors = {
      fullName: !draft.fullName.trim() ? 'Vui lòng nhập họ tên.' : undefined,
      phone: !validPhone(draft.phone) ? 'Số điện thoại không hợp lệ.' : undefined,
      street: !draft.street.trim() ? 'Vui lòng nhập số nhà, tên đường.' : undefined,
      region: !draft.provinceId || !draft.districtId || !draft.wardCode ? 'Vui lòng chọn đầy đủ tỉnh, quận và phường.' : undefined,
    };
    setAddressErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true); setError('');
    try {
      const result = await request<{ address: Address; addresses: Address[] }>('/api/addresses', { method: 'POST', token: token || undefined, body: { ...draft, fullName: draft.fullName.trim(), phone: draft.phone.trim(), street: draft.street.trim(), isDefault: !addresses.length } });
      setAddresses(result.addresses); setAddress(result.address); closeAddressForm(result.address);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được địa chỉ.'); }
    finally { setBusy(false); }
  };
  const checkout = async () => {
    if (!user || !address || adding || !items.length || shippingFee === null || shippingLoading) return;
    setBusy(true); setError('');
    try {
      const result = await request<CheckoutResponse>('/api/checkout', { method: 'POST', token: token || undefined, body: {
        items: items.map((item) => ({ productId: item.product._id, quantity: item.quantity })), shippingAddress: address, paymentMethod,
      } });
      if (paymentMethod === 'COD') {
        try {
          const cart = await request<CartItem[]>(`/api/users/cart/${user._id}`, { token: token || undefined });
          await writeCart(user._id, cart);
        } catch { await writeCart(user._id, []).catch(() => {}); }
      }
      if (paymentMethod === 'VNPAY') {
        router.replace({ pathname: result.paymentUrl ? '/vnpay-webview' : '/payment-status', params: { parentOrderId: result.parentOrderId, amount: String(result.amount), paymentUrl: result.paymentUrl || '' } });
      } else router.replace('/orders');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể đặt hàng.'); }
    finally { setBusy(false); }
  };
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  return <Screen title="Thanh toán">
    {!user ? <Button title="Đăng nhập" onPress={() => router.push('/login')} /> : <>
      <Status loading={loading} error={loadError} onRetry={() => setLoadRetry((count) => count + 1)} />
      {!loading && !loadError && <>
        <Text style={s.heading}>Sản phẩm ({items.length})</Text>
        {items.map((item) => <View key={item.product._id} style={s.row}><Text style={s.rowText} numberOfLines={2}>{item.product.title || item.product.name} × {item.quantity}</Text><Text style={s.bold}>{formatPrice(item.product.price * item.quantity)}</Text></View>)}
        <Text style={s.heading}>Địa chỉ giao hàng</Text>
        {addresses.map((item) => <Pressable key={item._id} onPress={() => setAddress(item)} style={[s.address, address?._id === item._id && s.addressActive]}><Text style={s.bold}>{item.fullName} · {item.phone}</Text><Text style={s.muted}>{item.street}, {item.wardName}, {item.districtName}, {item.provinceName}</Text></Pressable>)}
        {!adding ? <Button title="Thêm địa chỉ giao hàng" secondary onPress={openAddressForm} /> : <View style={s.form}>
          <Button title={locating ? 'Đang định vị...' : 'Gợi ý địa chỉ từ vị trí hiện tại'} secondary disabled={locating} onPress={() => void suggestCurrentAddress()} />
          <Field label="Họ tên người nhận" value={draft.fullName} onChangeText={(value) => setDraft((current) => ({ ...current, fullName: value }))} error={addressErrors.fullName} />
          <Field label="Số điện thoại" value={draft.phone} onChangeText={(value) => setDraft((current) => ({ ...current, phone: value }))} keyboardType="phone-pad" error={addressErrors.phone} />
          <Field label="Số nhà, tên đường" value={draft.street} onChangeText={(value) => setDraft((current) => ({ ...current, street: value }))} error={addressErrors.street} />
          {!!addressErrors.region && <Notice error>{addressErrors.region}</Notice>}
          <Text style={s.label}>Tỉnh / Thành phố: {draft.provinceName || 'Chọn'}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.options}>{provinces.items.map((item) => <Pressable key={item.ProvinceID} onPress={() => chooseProvince(item)} style={s.option}><Text style={s.optionText}>{item.ProvinceName}</Text></Pressable>)}</ScrollView>
          {!!draft.provinceId && <><Text style={s.label}>Quận / Huyện: {draft.districtName || 'Chọn'}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.options}>{districts.items.map((item) => <Pressable key={item.DistrictID} onPress={() => chooseDistrict(item)} style={s.option}><Text style={s.optionText}>{item.DistrictName}</Text></Pressable>)}</ScrollView></>}
          {!!draft.districtId && <><Text style={s.label}>Phường / Xã: {draft.wardName || 'Chọn'}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.options}>{wards.items.map((item) => <Pressable key={item.WardCode} onPress={() => setDraft((current) => ({ ...current, wardCode: item.WardCode, wardName: item.WardName }))} style={s.option}><Text style={s.optionText}>{item.WardName}</Text></Pressable>)}</ScrollView></>}
          {(provinces.loading || districts.loading || wards.loading) && <Notice>Đang tải danh sách khu vực...</Notice>}
          {provinces.failed && <Button title="Tải lại tỉnh / thành phố" secondary onPress={provinces.retry} />}
          {districts.failed && <Button title="Tải lại quận / huyện" secondary onPress={districts.retry} />}
          {wards.failed && <Button title="Tải lại phường / xã" secondary onPress={wards.retry} />}
          {!!draftError && <Notice error>{draftError}</Notice>}
          <Button title="Lưu địa chỉ" onPress={saveAddress} disabled={busy} />
          <Button title="Bỏ nháp địa chỉ" secondary onPress={() => closeAddressForm()} disabled={busy || locating} />
        </View>}
        <Text style={s.heading}>Phương thức thanh toán</Text>
        {(['COD', 'VNPAY'] as const).map((method) => <Pressable key={method} onPress={() => setPaymentMethod(method)} style={[s.payment, paymentMethod === method && s.paymentActive]}><Text style={s.bold}>{method === 'COD' ? 'Thanh toán khi nhận hàng (COD)' : 'VNPAY'}</Text></Pressable>)}
        <Notice>Ví HaiPay chưa có luồng kích hoạt trên ứng dụng.</Notice>
        <View style={s.summary}>
          <View style={s.summaryRow}><Text style={s.muted}>Tiền sản phẩm</Text><Text style={s.bold}>{formatPrice(subtotal)}</Text></View>
          <View style={s.summaryRow}><Text style={s.muted}>Phí vận chuyển</Text><Text style={s.bold}>{shippingLoading ? 'Đang tính...' : shippingFee === null ? 'Chưa có' : formatPrice(shippingFee)}</Text></View>
          <View style={s.summaryRow}><Text style={s.bold}>Tổng thanh toán</Text><Text style={s.total}>{shippingFee === null ? '—' : formatPrice(subtotal + shippingFee)}</Text></View>
          {!!shippingError && <><Notice error>{shippingError}</Notice><Button title="Tính lại phí vận chuyển" secondary onPress={() => setQuoteRetry((count) => count + 1)} /></>}
        </View>
        {error && <Notice error>{error}</Notice>}
        <Button title={busy ? 'Đang đặt hàng...' : 'Xác nhận đặt hàng'} onPress={checkout} disabled={busy || adding || !address || !items.length || shippingLoading || shippingFee === null} />
      </>}
    </>}
  </Screen>;
}

const s = StyleSheet.create({
  heading: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 18, marginBottom: 8 }, row: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 6 }, rowText: { color: colors.text, flex: 1 }, bold: { color: colors.text, fontWeight: '700', fontSize: 13 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }, address: { backgroundColor: colors.surface, borderRadius: 11, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 7 }, addressActive: { borderColor: colors.orange },
  form: { backgroundColor: colors.surface, borderRadius: 12, padding: 13, marginTop: 8 }, label: { color: colors.text, fontWeight: '600', marginTop: 7 }, options: { gap: 7, paddingVertical: 9 }, option: { backgroundColor: '#F4ECE8', borderRadius: 16, paddingHorizontal: 10, minHeight: 34, justifyContent: 'center' }, optionText: { color: colors.text, fontSize: 12 },
  payment: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 15, marginBottom: 7 }, paymentActive: { borderColor: colors.orange, backgroundColor: '#FFF4D4' }, summary: { marginVertical: 15, backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 10 }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, total: { color: colors.orange, fontSize: 22, fontWeight: '700' },
});
