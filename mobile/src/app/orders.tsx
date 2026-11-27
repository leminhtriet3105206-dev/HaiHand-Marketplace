import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatPrice, request, type Order } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, Screen, Status } from '../components/ui';
import { colors } from '../theme';

const filters = [
  { label: 'Tất cả', value: '' }, { label: 'Chờ xác nhận', value: 'Pending' }, { label: 'Đang xử lý', value: 'Processing' },
  { label: 'Đang giao', value: 'Shipped' }, { label: 'Đã nhận', value: 'Delivered' }, { label: 'Hoàn tất', value: 'Completed' }, { label: 'Đã hủy', value: 'Cancelled' },
];

export default function OrdersScreen() {
  const { user, token } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState('');
  const [confirmCancel, setConfirmCancel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try { setOrders(await request<Order[]>(`/api/users/${user._id}/orders`, { token: token || undefined })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được đơn mua.'); }
    finally { setLoading(false); }
  }, [user, token]);
  useFocusEffect(useCallback(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]));
  const visible = useMemo(() => status ? orders.filter((item) => item.status === status) : orders, [orders, status]);
  const update = async (id: string, action: 'cancel' | 'receive') => {
    setError('');
    try { await request(`/api/orders/${id}/${action}`, { method: 'PUT', token: token || undefined }); setConfirmCancel(''); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không cập nhật được đơn hàng.'); }
  };
  return <Screen title="Đơn mua" tab="Đơn mua">
    {!user ? <View style={s.guest}><Text style={s.muted}>Đăng nhập để theo dõi đơn hàng của bạn.</Text><Button title="Đăng nhập" onPress={() => router.push('/login')} /></View> : <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{filters.map((filter) => <Pressable key={filter.label} onPress={() => setStatus(filter.value)} style={[s.filter, status === filter.value && s.active]}><Text style={s.filterText}>{filter.label}</Text></Pressable>)}</ScrollView>
      <Status loading={loading} error={error} empty={!loading && !error && !visible.length ? 'Chưa có đơn mua trong mục này.' : undefined} onRetry={load} />
      {!loading && !error && visible.map((order) => <View key={order._id} style={s.card}>
        <View style={s.cardTop}><Text style={s.id}>Đơn #{order._id.slice(-8).toUpperCase()}</Text><Text style={s.status}>{filters.find((item) => item.value === order.status)?.label || order.status || 'Đang xử lý'}</Text></View>
        {(order.orderItems || []).map((item, index) => <Text key={`${item.productId}-${index}`} style={s.item} numberOfLines={2}>{item.name} × {item.quantity}</Text>)}
        {!order.orderItems?.length && (order.items || []).map((item) => <Text key={item._id} style={s.item} numberOfLines={2}>{item.title || item.name}</Text>)}
        <Text style={s.muted}>Thanh toán: {order.paymentMethod || 'COD'} · {order.paymentMethod === 'VNPAY' && !['escrow', 'released'].includes(order.paymentStatus || '') ? 'Chờ xác nhận thanh toán' : order.paymentStatus === 'escrow' ? 'Đã thanh toán' : order.paymentStatus === 'released' ? 'Hoàn tất' : order.paymentStatus || 'Chưa thanh toán'}</Text>
        {!!order.trackingCode && <Text style={s.muted}>Mã vận đơn: {order.trackingCode}</Text>}
        <View style={s.totalRow}><Text style={s.muted}>Tổng cộng</Text><Text style={s.total}>{formatPrice(order.totalPrice)}</Text></View>
        {order.paymentMethod === 'VNPAY' && !!order.parentOrderId && <Button title="Kiểm tra thanh toán VNPAY" secondary onPress={() => router.push({ pathname: '/payment-status', params: { parentOrderId: order.parentOrderId } })} />}
        {['Pending', 'Processing'].includes(order.status || '') && <Button title={confirmCancel === order._id ? 'Xác nhận hủy đơn' : 'Hủy đơn hàng'} secondary onPress={() => confirmCancel === order._id ? void update(order._id, 'cancel') : setConfirmCancel(order._id)} />}
        {['Shipped', 'Delivered'].includes(order.status || '') && <Button title="Xác nhận đã nhận hàng" onPress={() => void update(order._id, 'receive')} />}
      </View>)}
    </>}
  </Screen>;
}

const s = StyleSheet.create({
  guest: { paddingTop: 45, gap: 15 }, muted: { color: colors.muted, fontSize: 12, lineHeight: 18 }, filters: { gap: 7, paddingBottom: 16 }, filter: { backgroundColor: colors.surface, borderRadius: 18, minHeight: 35, justifyContent: 'center', paddingHorizontal: 12 }, active: { backgroundColor: colors.yellow }, filterText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 10, gap: 7 }, cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, id: { color: colors.text, fontSize: 14, fontWeight: '700' }, status: { color: colors.orange, fontSize: 12, fontWeight: '700' },
  item: { color: colors.text, fontSize: 13 }, totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9 }, total: { color: colors.orange, fontWeight: '700', fontSize: 17 },
});
