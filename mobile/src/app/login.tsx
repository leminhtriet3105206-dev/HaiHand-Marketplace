import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useSession } from '../auth/SessionContext';
import { AuthIntro, authStyles } from '../components/AuthIntro';
import { Button, Field, Notice, Screen } from '../components/ui';
import { validEmail } from '../domain/validation';

export default function LoginScreen() {
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const emailError = touched && !validEmail(email) ? 'Email không hợp lệ.' : '';
  const passwordError = touched && !password ? 'Vui lòng nhập mật khẩu.' : '';

  const submit = async () => {
    setTouched(true);
    if (!validEmail(email) || !password) return;
    setBusy(true); setError('');
    try { await login(email.trim(), password); router.replace('/'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Đăng nhập thất bại.'); }
    finally { setBusy(false); }
  };

  return <Screen title="Đăng nhập">
    <AuthIntro title="Chào mừng trở lại!" subtitle="Đăng nhập tài khoản HaiHand của bạn" />
    <View style={authStyles.card}>
      <Field label="Email tài khoản" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="Nhập email của bạn" error={emailError} />
      <Field label="Mật khẩu" value={password} onChangeText={setPassword} secureTextEntry showPasswordToggle placeholder="Nhập mật khẩu" error={passwordError} />
      {error && <Notice error>{error}</Notice>}
      <Pressable onPress={() => router.push('/forgot-password')}><Text style={authStyles.link}>Quên mật khẩu?</Text></Pressable>
      <Button title={busy ? 'Đang đăng nhập...' : 'Đăng nhập'} onPress={submit} disabled={busy} />
    </View>
    <Text style={authStyles.foot}>Chưa có tài khoản HaiHand?</Text>
    <Pressable onPress={() => router.push('/register')}><Text style={authStyles.link}>Đăng ký ngay  →</Text></Pressable>
  </Screen>;
}
