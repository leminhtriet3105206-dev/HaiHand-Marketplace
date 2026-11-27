import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { AppState, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { imageUrl, request, type Message } from '../../api/client';
import { useSession } from '../../auth/SessionContext';
import { Button, Screen, Status } from '../../components/ui';
import { colors } from '../../theme';

export default function ChatScreen() {
  const { userId, name, postId } = useLocalSearchParams<{ userId: string; name?: string; postId?: string }>();
  const { user, token } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user || !userId) return;
    setError('');
    try {
      const next = await request<Message[]>(`/api/messages/${user._id}/${userId}`, { token: token || undefined });
      setMessages(next);
      if (next.some((message) => !message.isRead && (typeof message.sender === 'string' ? message.sender : message.sender?._id) === userId)) {
        await request('/api/messages/mark-read', { method: 'PUT', token: token || undefined, body: { userId: user._id, otherId: userId } });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được tin nhắn.'); }
    finally { setLoading(false); }
  }, [user, userId, token]);
  useFocusEffect(useCallback(() => {
    let active = true;
    let inFlight = false;
    const timer = setTimeout(() => { if (active && AppState.currentState !== 'background') void load(); }, 0);
    const refresh = setInterval(() => {
      if (!active || AppState.currentState === 'background' || !user || inFlight) return;
      inFlight = true;
      void request<{ count: number }>(`/api/messages/unread-count/${user._id}`, { token: token || undefined })
        .then((result) => { if (active && result.count > 0) return load(); })
        .catch(() => {})
        .finally(() => { inFlight = false; });
    }, 15000);
    const subscription = AppState.addEventListener('change', (state) => { if (active && state === 'active') void load(); });
    return () => { active = false; clearTimeout(timer); clearInterval(refresh); subscription.remove(); };
  }, [load, token, user]));
  const send = async () => {
    if (!user || (!draft.trim() && !attachment) || busy) return;
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('senderId', user._id); form.append('receiverId', userId); form.append('text', draft.trim());
      if (postId) form.append('postId', postId);
      if (attachment) {
        if (Platform.OS === 'web' && attachment.file) form.append('image', attachment.file);
        else form.append('image', { uri: attachment.uri, name: attachment.fileName || 'message.jpg', type: attachment.mimeType || 'image/jpeg' } as unknown as Blob);
      }
      const sent = await request<Message>('/api/messages', { method: 'POST', token: token || undefined, body: form });
      setMessages((current) => [...current, sent]); setDraft(''); setAttachment(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không gửi được tin nhắn.'); }
    finally { setBusy(false); }
  };
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setAttachment(result.assets[0]);
  };
  return <Screen title={name || 'Cuộc trò chuyện'} scroll={false} right={<Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: userId } })} accessibilityLabel="Xem hồ sơ"><Ionicons name="person-circle-outline" size={27} color={colors.text} /></Pressable>}>
    {!user ? <Button title="Đăng nhập để nhắn tin" onPress={() => router.push('/login')} /> : <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.flex} contentContainerStyle={s.messages}>
        <Status loading={loading} error={error} empty={!loading && !error && !messages.length ? 'Bắt đầu cuộc trò chuyện.' : undefined} onRetry={load} />
        {messages.map((item) => {
          const senderId = typeof item.sender === 'string' ? item.sender : item.sender?._id;
          const mine = senderId === user._id;
          return <View key={item._id} style={[s.bubble, mine ? s.mine : s.theirs]}>
            {!!item.content && <Text style={s.message}>{item.content}</Text>}
            {item.images?.map((path) => <Image key={path} source={{ uri: imageUrl(path) }} style={s.image} />)}
            <Text style={s.time}>{item.timestamp ? new Date(item.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}</Text>
          </View>;
        })}
      </ScrollView>
      {attachment && <View style={s.attachment}><Image source={{ uri: attachment.uri }} style={s.attachmentImage} /><Pressable onPress={() => setAttachment(null)}><Text style={s.removeAttachment}>Bỏ ảnh</Text></Pressable></View>}
      <View style={s.composer}><Pressable onPress={() => void pickImage()} accessibilityLabel="Gửi hình ảnh" style={s.attachButton}><Ionicons name="image-outline" size={23} color={colors.orange} /></Pressable><TextInput value={draft} onChangeText={setDraft} placeholder="Nhập tin nhắn..." placeholderTextColor={colors.muted} multiline style={s.input} /><Pressable disabled={busy || (!draft.trim() && !attachment)} onPress={() => void send()} accessibilityLabel="Gửi tin nhắn" style={s.send}><Ionicons name="send" size={21} color={colors.text} /></Pressable></View>
    </KeyboardAvoidingView>}
  </Screen>;
}

const s = StyleSheet.create({ flex: { flex: 1 }, messages: { gap: 10, paddingBottom: 12 }, bubble: { maxWidth: '83%', minWidth: 95, borderRadius: 14, padding: 11, gap: 4 }, mine: { alignSelf: 'flex-end', backgroundColor: '#FFE083' }, theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, message: { color: colors.text, fontSize: 14, lineHeight: 20 }, time: { fontSize: 10, color: colors.muted, alignSelf: 'flex-end' }, image: { width: 180, height: 180, borderRadius: 9 }, attachment: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8 }, attachmentImage: { width: 48, height: 48, borderRadius: 8 }, removeAttachment: { color: colors.red, fontWeight: '700' }, composer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9 }, attachButton: { width: 34, alignItems: 'center' }, input: { flex: 1, minHeight: 45, maxHeight: 100, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 9, color: colors.text }, send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' } });
