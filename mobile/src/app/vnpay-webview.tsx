import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { request } from '../api/client';
import { Button, Screen } from '../components/ui';
import { colors } from '../theme';

export default function VnpayWebviewScreen() {
  const { paymentUrl, parentOrderId, amount } = useLocalSearchParams<{ paymentUrl: string; parentOrderId: string; amount?: string }>();
  const handling = useRef(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const validPaymentUrl = (() => {
    try {
      const url = new URL(paymentUrl);
      return url.protocol === 'https:' && (url.hostname === 'sandbox.vnpayment.vn' || url.hostname === 'pay.vnpay.vn');
    } catch { return false; }
  })();

  const handleReturn = async (url: URL) => {
    if (handling.current) return;
    handling.current = true;
    setFinished(true);
    const params = Object.fromEntries(url.searchParams.entries());
    if (params.vnp_TxnRef !== parentOrderId || !params.vnp_SecureHash) {
      setError('Kết quả thanh toán không khớp đơn hàng. Vui lòng kiểm tra trạng thái đơn.');
      return;
    }
    try {
      await request('/api/vnpay/verify', { method: 'POST', body: {
        orderId: parentOrderId,
        responseCode: params.vnp_ResponseCode,
        vnp_Params: params,
        secureHash: params.vnp_SecureHash,
      } });
      router.replace({ pathname: '/payment-status', params: { parentOrderId, amount: amount || '', paymentUrl } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa xác nhận được thanh toán. Vui lòng kiểm tra đơn hàng.');
    }
  };

  return <Screen title="Thanh toán VNPAY" scroll={false}>
    {!validPaymentUrl ? <Text style={s.error}>Liên kết thanh toán VNPAY không hợp lệ.</Text> : finished ? <View style={s.result}>
      {error ? <Text style={s.error}>{error}</Text> : <ActivityIndicator color={colors.orange} />}
      <Button title="Kiểm tra trạng thái đơn" onPress={() => router.replace({ pathname: '/payment-status', params: { parentOrderId, amount: amount || '', paymentUrl } })} />
    </View> : <WebView
      source={{ uri: paymentUrl }} style={s.webview} startInLoadingState
      renderLoading={() => <ActivityIndicator style={s.loading} color={colors.orange} />}
      onShouldStartLoadWithRequest={(requestInfo) => {
        try {
          const next = new URL(requestInfo.url);
          if (next.pathname === '/haipay/return' && next.searchParams.has('vnp_TxnRef')) {
            void handleReturn(next);
            return false;
          }
          if (!['http:', 'https:', 'about:'].includes(next.protocol)) {
            void Linking.openURL(requestInfo.url).catch(() => setError('Không mở được ứng dụng ngân hàng.'));
            return false;
          }
        } catch { return false; }
        return true;
      }}
      onError={() => setError('Không tải được trang VNPAY. Vui lòng thử lại.')}
    />}
    {!!error && !finished && <Text style={s.error}>{error}</Text>}
  </Screen>;
}

const s = StyleSheet.create({
  webview: { flex: 1, alignSelf: 'stretch' }, loading: { flex: 1 }, result: { flex: 1, justifyContent: 'center', gap: 18 },
  error: { color: colors.red, fontSize: 14, lineHeight: 21, paddingVertical: 12 },
});
