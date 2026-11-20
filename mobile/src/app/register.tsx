import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useSession } from '../auth/SessionContext';
import { AuthIntro, authStyles } from '../components/AuthIntro';
import { Button, Field, Notice, Screen } from '../components/ui';
import { validEmail, validPhone } from '../domain/validation';

export default function RegisterScreen() {
  const { register } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const errors = {
    name: touched && !name.trim() ? 'Vui lòng nhập họ tên.' : '',
    email: touched && !validEmail(email) ? 'Email không hợp lệ.' : '',
    phone: touched && phone.trim() && !validPhone(phone) ? 'Số điện thoại không hợp lệ.' : '',
    password: touched && password.length < 6 ? 'Mật khẩu cần ít nhất 6 ký tự.' : '',
    confirm: touched && password !== confirm ? 'Hai mật khẩu chưa khớp.' : '',
  };

  const submit = async () => {
    setTouched(true);
    if (!name.trim() || !validEmail(email) || (phone.trim() && !validPhone(phone)) || password.length < 6 || password !== confirm) return;
    setBusy(true); setError('');
    try { await register(name.trim(), email.trim(), password, phone.trim()); router.replace('/'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Đăng ký thất bại.'); }
    finally { setBusy(false); }
  };

  return <Screen title="Đăng ký">
    <AuthIntro title="Tạo tài khoản mới" subtitle="Mua và bán đồ đã qua sử dụng trên HaiHand" />
    <View style={authStyles.card}>
      <Field label="Họ và tên" value={name} onChangeText={setName} placeholder="Tên của bạn" error={errors.name} />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="user@example.com" error={errors.email} />
      <Field label="Số điện thoại" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Số điện thoại (tùy chọn)" error={errors.phone} />
      <Field label="Mật khẩu" value={password} onChangeText={setPassword} secureTextEntry placeholder="Ít nhất 6 ký tự" error={errors.password} />
      <Field label="Nhập lại mật khẩu" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Nhập lại mật khẩu" error={errors.confirm} />
      {error && <Notice error>{error}</Notice>}
      <Button title={busy ? 'Đang tạo tài khoản...' : 'Đăng ký'} onPress={submit} disabled={busy} />
    </View>
    <Text style={authStyles.foot}>Đã có tài khoản?</Text>
    <Pressable onPress={() => router.replace('/login')}><Text style={authStyles.link}>Đăng nhập</Text></Pressable>
  </Screen>;
}
