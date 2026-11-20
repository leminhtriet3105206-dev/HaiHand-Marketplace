import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatPrice, request, type Address, type CartItem } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, Field, Notice, Screen, Status } from '../components/ui';
import { writeCart } from '../data/cartCache';
import { validPhone } from '../domain/validation';
import { colors } from '../theme';

type Province = { ProvinceID: number; ProvinceName: string };
type District = { DistrictID: number; DistrictName: string };
type Ward = { WardCode: string; WardName: string };
type AddressResponse = { addresses: Address[]; profile: { name: string; phone: string } };
type CheckoutResponse = { success: boolean; paymentUrl?: string; parentOrderId: string; amount: number };
type AddressDraft = Omit<Address, 'provinceId' | 'districtId'> & { provinceId?: number; districtId?: number };
type ShippingQuote = { fee: number };

export default function CheckoutScreen() {
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const { user, token } = useSession();
  const [items, setItems] = useState<CartItem[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [address, setAddress] = useState<Address | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<AddressDraft>({ fullName: '', phone: '', street: '', provinceName: '', districtName: '', wardName: '', wardCode: '' });
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'VNPAY'>('COD');
  const [shippingFee, setShippingFee] = useState<number | null>(null);
  const [shippingError, setShippingError] = useState('');
  const [shippingLoading, setShippingLoading] = useState(false);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [addressErrors, setAddressErrors] = useState<{ fullName?: string; phone?: string; street?: string; region?: string }>({});
  const [locating, setLocating] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try {
      const [cart, book] = await Promise.all([
        request<CartItem[]>(`/api/users/cart/${user._id}`, { token: token || undefined }),
        request<AddressResponse>('/api/addresses', { token: token || undefined }),
      ]);
      setItems(cart.filter((item) => (ids || '').split(',').includes(item.product._id)));
      setAddresses(book.addresses);
      setAddress(book.addresses.find((item) => item.isDefault) || book.addresses[0] || null);
      setDraft((current) => ({ ...current, fullName: book.profile.name, phone: book.profile.phone }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được thông tin thanh toán.'); }
    finally { setLoading(false); }
  }, [user, token, ids]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
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
  const openAddressForm = async () => {
    setAdding(true); setError('');
    try { setProvinces(await request<Province[]>('/api/shipping/provinces')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được danh sách tỉnh thành.'); }
  };
  const chooseProvince = async (value: Province) => {
    setDraft((current) => ({ ...current, provinceId: value.ProvinceID, provinceName: value.ProvinceName, districtId: undefined, districtName: '', wardCode: '', wardName: '' }));
    setWards([]); setDistricts([]);
    try { setDistricts(await request<District[]>(`/api/shipping/districts?provinceId=${value.ProvinceID}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được quận huyện.'); }
  };
  const chooseDistrict = async (value: District) => {
    setDraft((current) => ({ ...current, districtId: value.DistrictID, districtName: value.DistrictName, wardCode: '', wardName: '' }));
    setWards([]);
    try { setWards(await request<Ward[]>(`/api/shipping/wards?districtId=${value.DistrictID}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được phường xã.'); }
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
      setAddresses(result.addresses); setAddress(result.address); setAdding(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được địa chỉ.'); }
    finally { setBusy(false); }
  };
  const checkout = async () => {
    if (!user || !address || !items.length || shippingFee === null || shippingLoading) return;
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
      <Status loading={loading} error={error && loading ? error : undefined} onRetry={load} />
      {!loading && <>
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
          <Text style={s.label}>Tỉnh / Thành phố: {draft.provinceName || 'Chọn'}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.options}>{provinces.map((item) => <Pressable key={item.ProvinceID} onPress={() => void chooseProvince(item)} style={s.option}><Text style={s.optionText}>{item.ProvinceName}</Text></Pressable>)}</ScrollView>
          {!!draft.provinceId && <><Text style={s.label}>Quận / Huyện: {draft.districtName || 'Chọn'}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.options}>{districts.map((item) => <Pressable key={item.DistrictID} onPress={() => void chooseDistrict(item)} style={s.option}><Text style={s.optionText}>{item.DistrictName}</Text></Pressable>)}</ScrollView></>}
          {!!draft.districtId && <><Text style={s.label}>Phường / Xã: {draft.wardName || 'Chọn'}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.options}>{wards.map((item) => <Pressable key={item.WardCode} onPress={() => setDraft((current) => ({ ...current, wardCode: item.WardCode, wardName: item.WardName }))} style={s.option}><Text style={s.optionText}>{item.WardName}</Text></Pressable>)}</ScrollView></>}
          <Button title="Lưu địa chỉ" onPress={saveAddress} disabled={busy} />
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
        <Button title={busy ? 'Đang đặt hàng...' : 'Xác nhận đặt hàng'} onPress={checkout} disabled={busy || !address || !items.length || shippingLoading || shippingFee === null} />
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
