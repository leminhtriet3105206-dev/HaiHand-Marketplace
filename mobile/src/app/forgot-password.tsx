import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { request } from '../api/client';
import { AuthIntro, authStyles } from '../components/AuthIntro';
import { Button, Field, Notice, Screen } from '../components/ui';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await request('/api/users/send-otp', { method: 'POST', body: { email: email.trim() } });
      router.push({ pathname: '/reset-password', params: { email: email.trim() } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không gửi được mã OTP.'); }
    finally { setBusy(false); }
  };
  return <Screen title="Quên mật khẩu">
    <AuthIntro title="Quên mật khẩu?" subtitle="Nhập email tài khoản để nhận mã OTP từ HaiHand" />
    <View style={authStyles.card}>
      <Field label="Email tài khoản" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="user@example.com" />
      {error && <Notice error>{error}</Notice>}
      <Button title={busy ? 'Đang gửi...' : 'Gửi mã OTP'} onPress={submit} disabled={busy || !email.trim()} />
      <Notice>Mã OTP có hiệu lực trong 5 phút.</Notice>
    </View>
  </Screen>;
}
