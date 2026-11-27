import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatPrice, request, type Order } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, Screen, Status } from '../components/ui';
import { useForegroundEffect } from '../lifecycle/useForegroundEffect';
import { colors } from '../theme';

const titles = {
  pending: 'Đang chờ xác nhận thanh toán',
  paid: 'Đã xác nhận thanh toán',
  cancelled: 'Đơn hàng đã hủy',
  missing: 'Không tìm thấy đơn thanh toán',
};

export default function PaymentStatusScreen() {
  const { parentOrderId, amount, paymentUrl } = useLocalSearchParams<{ parentOrderId: string; amount?: string; paymentUrl?: string }>();
  const { user, token } = useSession();
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<keyof typeof titles | null>(null);
  const [error, setError] = useState('');
  const foregroundSignal = useRef<AbortSignal | null>(null);

  const userId = user?._id;
  const check = useCallback(async (signal: AbortSignal) => {
    if (!userId || !parentOrderId || signal.aborted) return;
    setChecking(true); setError('');
    try {
      const orders = await request<Order[]>(`/api/users/${userId}/orders`, { token: token || undefined, signal, timeoutMs: 10000 });
      if (signal.aborted) return;
      const related = orders.filter((order) => order.parentOrderId === parentOrderId);
      if (!related.length) setStatus('missing');
      else if (related.every((order) => order.status === 'Cancelled')) setStatus('cancelled');
      else if (related.every((order) => ['escrow', 'released'].includes(order.paymentStatus || ''))) setStatus('paid');
      else setStatus('pending');
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Không kiểm tra được trạng thái thanh toán.');
    } finally { if (!signal.aborted) setChecking(false); }
  }, [parentOrderId, token, userId]);

  useForegroundEffect(useCallback((signal) => {
    foregroundSignal.current = signal;
    void check(signal);
  }, [check]));
  const retry = () => { if (foregroundSignal.current && !checking) void check(foregroundSignal.current); };

  return <Screen title="Thanh toán VNPAY">
    <View style={s.card}>
      <Text style={s.title}>{status ? titles[status] : 'Trạng thái thanh toán'}</Text>
      <Text style={s.info}>Mã đơn: {parentOrderId || '—'}</Text>
      {!!amount && <Text style={s.info}>Số tiền: {formatPrice(Number(amount))}</Text>}
      {status === 'pending' && <Text style={s.info}>Nếu bạn đã thanh toán, hãy kiểm tra lại để lấy kết quả mới nhất từ máy chủ.</Text>}
      {status === 'pending' && !paymentUrl && <Text style={s.info}>Bạn có thể dùng mã đơn ở trên khi cần liên hệ hỗ trợ về giao dịch.</Text>}
      <Status loading={checking} error={error} onRetry={retry} />
      {user && parentOrderId && status !== 'paid' && !error && <Button title="Kiểm tra lại" onPress={retry} disabled={checking} />}
      {status === 'pending' && !checking && !error && !!paymentUrl && <Button title="Mở lại VNPAY" secondary onPress={() => router.push({ pathname: '/vnpay-webview', params: { parentOrderId, amount: amount || '', paymentUrl } })} />}
      <Button title="Xem đơn mua" secondary onPress={() => router.replace('/orders')} />
    </View>
  </Screen>;
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, padding: 18, borderRadius: 12, gap: 10 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  info: { color: colors.muted, fontSize: 14, lineHeight: 21 },
});
