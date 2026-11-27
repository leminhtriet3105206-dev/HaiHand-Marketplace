import { router } from 'expo-router';
import { useState } from 'react';

import { request } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, Field, Notice, Screen } from '../components/ui';

export default function ChangePasswordScreen() {
  const { user, token } = useSession();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    if (!user) return;
    if (newPassword.length < 6) return setError('Mật khẩu mới cần ít nhất 6 ký tự.');
    if (newPassword !== confirm) return setError('Hai mật khẩu chưa khớp.');
    setBusy(true); setError(''); setMessage('');
    try {
      await request(`/api/users/change-password/${user._id}`, { method: 'PUT', token: token || undefined, body: { oldPassword, newPassword } });
      setOldPassword(''); setNewPassword(''); setConfirm(''); setMessage('Đổi mật khẩu thành công.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không đổi được mật khẩu.'); }
    finally { setBusy(false); }
  };
  return <Screen title="Đổi mật khẩu">
    {!user ? <Button title="Đăng nhập" onPress={() => router.push('/login')} /> : <>
      <Field label="Mật khẩu hiện tại" value={oldPassword} onChangeText={setOldPassword} secureTextEntry />
      <Field label="Mật khẩu mới" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
      <Field label="Nhập lại mật khẩu mới" value={confirm} onChangeText={setConfirm} secureTextEntry />
      {error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}
      <Button title={busy ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'} onPress={submit} disabled={busy || !oldPassword || !newPassword || !confirm} />
    </>}
  </Screen>;
}
