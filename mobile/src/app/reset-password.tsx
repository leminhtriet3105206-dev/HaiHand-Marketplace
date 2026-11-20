import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { request } from '../api/client';
import { AuthIntro, authStyles } from '../components/AuthIntro';
import { Button, Field, Notice, Screen } from '../components/ui';

export default function ResetPasswordScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (password.length < 6) return setError('Mật khẩu cần ít nhất 6 ký tự.');
    if (password !== confirm) return setError('Hai mật khẩu chưa khớp.');
    setBusy(true); setError('');
    try {
      await request('/api/users/reset-password-otp', { method: 'POST', body: { email, otp: otp.trim(), newPassword: password } });
      router.replace('/login');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đặt lại được mật khẩu.'); }
    finally { setBusy(false); }
  };
  return <Screen title="Đặt lại mật khẩu">
    <AuthIntro title="Nhập mã xác thực" subtitle={`Mã OTP đã được gửi đến ${email || 'email của bạn'}`} />
    <View style={authStyles.card}>
      <Field label="Mã OTP" value={otp} onChangeText={setOtp} keyboardType="numeric" placeholder="6 chữ số" />
      <Field label="Mật khẩu mới" value={password} onChangeText={setPassword} secureTextEntry placeholder="Ít nhất 6 ký tự" />
      <Field label="Nhập lại mật khẩu" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Nhập lại mật khẩu" />
      {error && <Notice error>{error}</Notice>}
      <Button title={busy ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'} onPress={submit} disabled={busy || !email || !otp || !password || !confirm} />
    </View>
  </Screen>;
}
