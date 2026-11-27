import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';

import { request, type Product } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Button, ProductTile, Screen } from '../components/ui';
import { useForegroundEffect } from '../lifecycle/useForegroundEffect';
import { colors } from '../theme';

type ChatTurn = { role: 'user' | 'assistant'; content: string; products?: Product[] };

export default function ChatbotScreen() {
  const { user, token } = useSession();
  const scroll = useRef<ScrollViewInstance>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [supportBusy, setSupportBusy] = useState(false);
  const [human, setHuman] = useState(false);
  const [supportStatus, setSupportStatus] = useState('pending');
  const [supportTurns, setSupportTurns] = useState<ChatTurn[]>([]);
  const [supportRefreshError, setSupportRefreshError] = useState('');
  const version = useRef(0);
  const updateSupport = useCallback((data: { status: string; messages: { sender: string; content: string }[] }) => {
    setSupportStatus(data.status);
    setSupportTurns(data.messages.map(m => ({ role: m.sender === 'customer' ? 'user' : 'assistant', content: m.content })));
    setSupportRefreshError('');
  }, []);
  useForegroundEffect(useCallback((signal) => {
    if (!human || !token) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (signal.aborted) return;
      const current = version.current;
      try {
        const data = await request<Parameters<typeof updateSupport>[0]>('/api/support/conversation', { token, signal, timeoutMs: 10000 });
        if (!signal.aborted && current === version.current) updateSupport(data);
      } catch {
        if (!signal.aborted && current === version.current) setSupportRefreshError('Chưa thể cập nhật hội thoại hỗ trợ. App sẽ thử lại.');
      } finally {
        if (!signal.aborted) timer = setTimeout(() => void poll(), 3000);
      }
    };
    signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    void poll();
  }, [human, token, updateSupport]));

  const openSupport = async () => {
    if (!user) { router.push('/login'); return; }
    setSupportBusy(true); setError('');
    try {
      const data = await request<Parameters<typeof updateSupport>[0]>('/api/support/start', { method: 'POST', token: token || undefined });
      updateSupport(data); setHuman(true); setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa kết nối được nhân viên chăm sóc khách hàng.');
    } finally { setSupportBusy(false); }
  };

  const send = async () => {
    const message = draft.trim();
    if (!message || busy) return;
    if (human) {
      setBusy(true); setError(''); version.current += 1;
      try {
        const data = await request<Parameters<typeof updateSupport>[0]>('/api/support/messages', { method: 'POST', token: token || undefined, body: { content: message } });
        version.current += 1; updateSupport(data); setDraft('');
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không gửi được tin nhắn.'); }
      finally { setBusy(false); }
      return;
    }
    const history = turns.map(({ role, content }) => ({ role, content })).slice(-6);
    setTurns((current) => [...current, { role: 'user', content: message }]);
    setDraft(''); setBusy(true); setError('');
    try {
      const answer = await request<{ reply: string; products?: Product[] }>('/api/chatbot/ask', {
        method: 'POST', body: { message, history }, timeoutMs: 90000,
      });
      setTurns((current) => [...current, { role: 'assistant', content: answer.reply, products: answer.products }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không kết nối được trợ lý AI.');
    } finally { setBusy(false); }
  };

  return <Screen title={human ? 'Chăm sóc khách hàng' : 'Trợ lý HaiHand AI'} scroll={false}>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} style={s.flex} contentContainerStyle={s.messages} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {human && <Text style={s.introText}>{supportStatus === 'active' ? 'Tư vấn viên đã tiếp nhận' : 'Đang chờ nhân viên tiếp nhận. Bạn có thể để lại lời nhắn.'}</Text>}
        {!human && turns.length === 0 && <View style={s.intro}><Text style={s.introTitle}>Xin chào! Mình có thể giúp gì?</Text></View>}
        {(human ? supportTurns : turns).map((turn, index) => <View key={index} style={[s.bubble, turn.role === 'user' ? s.mine : s.theirs]}>
          <Text style={s.message}>{turn.content}</Text>
          {!!turn.products?.length && <View style={s.products}>{turn.products.map((product) => <ProductTile key={product._id} product={product} style={s.product} />)}</View>}
        </View>)}
        {busy && <View style={s.waiting}><ActivityIndicator color={colors.orange} /><Text style={s.muted}>{human ? 'Đang gửi...' : 'AI đang trả lời...'}</Text></View>}
      </ScrollView>
      {!!(error || (human && supportRefreshError)) && <Text style={s.error}>{error || supportRefreshError}</Text>}
      <Button title={human ? 'Quay lại trợ lý AI' : supportBusy ? 'Đang kết nối CSKH...' : 'Gặp tư vấn viên'} icon="headset-outline" secondary onPress={() => { if (human) { setHuman(false); setDraft(''); } else void openSupport(); }} disabled={supportBusy || busy} />
      <View style={s.composer}><TextInput value={draft} editable={!busy} onChangeText={setDraft} placeholder={human ? 'Nhắn cho tư vấn viên...' : 'Hỏi trợ lý HaiHand...'} placeholderTextColor={colors.muted} multiline maxLength={2000} style={s.input} /><Pressable onPress={() => void send()} disabled={busy || !draft.trim()} accessibilityLabel="Gửi tin nhắn" style={[s.send, (busy || !draft.trim()) && s.disabled]}><Ionicons name="send" size={21} color={colors.text} /></Pressable></View>
    </KeyboardAvoidingView>
  </Screen>;
}

const s = StyleSheet.create({
  flex: { flex: 1 }, messages: { flexGrow: 1, gap: 12, paddingBottom: 15 },
  intro: { alignItems: 'center', paddingTop: 45, gap: 9 }, introTitle: { color: colors.text, fontSize: 18, fontWeight: '700' }, introText: { color: colors.muted, textAlign: 'center' },
  bubble: { maxWidth: '88%', borderRadius: 15, padding: 12, gap: 10 }, mine: { alignSelf: 'flex-end', backgroundColor: '#FFE083' }, theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, message: { color: colors.text, fontSize: 14, lineHeight: 21 },
  products: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, product: { width: 145 }, waiting: { flexDirection: 'row', alignItems: 'center', gap: 9 }, muted: { color: colors.muted }, error: { color: colors.red, marginBottom: 8 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }, input: { flex: 1, minHeight: 46, maxHeight: 100, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 9, color: colors.text }, send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.5 },
});
