import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { formatPrice, request, type Order } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, Screen, Status } from '../components/ui';
import { colors } from '../theme';

export default function PaymentStatusScreen() {
  const { parentOrderId, amount, paymentUrl } = useLocalSearchParams<{ parentOrderId: string; amount?: string; paymentUrl?: string }>();
  const { user, token } = useSession();
  const [checking, setChecking] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState('');

  const check = useCallback(async () => {
    if (!user || !parentOrderId) return;
    setChecking(true); setError('');
    try {
      const orders = await request<Order[]>(`/api/users/${user._id}/orders`, { token: token || undefined });
      const related = orders.filter((order) => order.parentOrderId === parentOrderId);
      setPaid(related.length > 0 && related.every((order) => ['escrow', 'released'].includes(order.paymentStatus || '')));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không kiểm tra được trạng thái thanh toán.'); }
    finally { setChecking(false); }
  }, [parentOrderId, token, user]);

  useFocusEffect(useCallback(() => {
    const timer = setTimeout(() => { void check(); }, 0);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void check(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [check]));

  return <Screen title="Thanh toán VNPAY">
    <View style={s.card}>
      <Text style={s.title}>{paid ? 'Đã xác nhận thanh toán' : 'Đang chờ xác nhận thanh toán'}</Text>
      <Text style={s.info}>Mã đơn: {parentOrderId || '—'}</Text>
      {!!amount && <Text style={s.info}>Số tiền: {formatPrice(Number(amount))}</Text>}
      {!paid && <Text style={s.info}>Sau khi hoàn tất trên VNPAY, quay lại ứng dụng và kiểm tra trạng thái. Chỉ trạng thái đơn hàng từ máy chủ mới xác nhận thanh toán.</Text>}
      {!paid && !paymentUrl && <Text style={s.warning}>Máy chủ chưa trả về liên kết VNPAY. Vui lòng liên hệ hỗ trợ với mã đơn ở trên.</Text>}
      <Status loading={checking} error={error} onRetry={check} />
      {!paid && <Button title="Kiểm tra lại" onPress={() => void check()} disabled={checking} />}
      {!paid && !!paymentUrl && <Button title="Mở lại VNPAY" secondary onPress={() => router.push({ pathname: '/vnpay-webview', params: { parentOrderId, amount: amount || '', paymentUrl } })} />}
      <Button title="Xem đơn mua" secondary onPress={() => router.replace('/orders')} />
    </View>
  </Screen>;
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, padding: 18, borderRadius: 12, gap: 10 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  info: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  warning: { color: colors.red, fontSize: 14, lineHeight: 21 },
});
