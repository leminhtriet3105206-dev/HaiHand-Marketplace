import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';

import { imageUrl, request, type User } from '../../api/client';
import { useSession } from '../../auth/SessionContext';
import { Button, Field, Notice, Screen } from '../../components/ui';
import { colors } from '../../theme';

export default function EditProfileScreen() {
  const { user, token, refresh } = useSession();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [currentAvatar, setCurrentAvatar] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    request<User>('/api/users/profile', { token: token || undefined }).then((profile) => {
      setName(profile.name || ''); setPhone(profile.phone || ''); setAddress(profile.address || ''); setBio(profile.bio || ''); setCurrentAvatar(profile.avatar || '');
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Không tải được hồ sơ.'));
  }, [user, token]);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setAvatar(result.assets[0]);
  };
  const save = async () => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('name', name.trim()); form.append('phone', phone.trim()); form.append('address', address.trim()); form.append('bio', bio.trim());
      if (avatar) {
        if (Platform.OS === 'web' && avatar.file) form.append('avatar', avatar.file);
        else form.append('avatar', { uri: avatar.uri, name: avatar.fileName || 'avatar.jpg', type: avatar.mimeType || 'image/jpeg' } as unknown as Blob);
      }
      await request(`/api/users/profile/${user._id}`, { method: 'PUT', token: token || undefined, body: form });
      await refresh();
      router.replace('/profile');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không lưu được hồ sơ.'); }
    finally { setBusy(false); }
  };
  return <Screen title="Chỉnh sửa hồ sơ">
    {!user ? <Button title="Đăng nhập" onPress={() => router.push('/login')} /> : <>
      <View style={s.avatarBox}>{(avatar?.uri || imageUrl(currentAvatar)) ? <Image source={{ uri: avatar?.uri || imageUrl(currentAvatar) }} style={s.avatar} /> : null}<Button title="Chọn ảnh đại diện" secondary onPress={pickAvatar} /></View>
      <Text style={s.heading}>Thông tin cơ bản</Text>
      <Field label="Họ tên" value={name} onChangeText={setName} />
      <Field label="Số điện thoại" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Địa chỉ" value={address} onChangeText={setAddress} />
      <Field label="Giới thiệu" value={bio} onChangeText={setBio} multiline />
      {error && <Notice error>{error}</Notice>}
      <Button title={busy ? 'Đang lưu...' : 'Lưu thay đổi'} onPress={save} disabled={busy || !name.trim()} />
    </>}
  </Screen>;
}

const s = StyleSheet.create({ avatarBox: { alignItems: 'center', gap: 12, paddingVertical: 16 }, avatar: { width: 88, height: 88, borderRadius: 44 }, heading: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 16 } });
