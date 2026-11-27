import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function AuthIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={s.intro}>
    <Image source={require('../../assets/brand.png')} style={s.logo} />
    <Text style={s.title}>{title}</Text>
    <Text style={s.subtitle}>{subtitle}</Text>
  </View>;
}

export const authStyles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, marginTop: 18, borderWidth: 1, borderColor: colors.border },
  link: { color: colors.orange, textAlign: 'center', fontWeight: '700', fontSize: 14, padding: 12 },
  foot: { color: colors.muted, textAlign: 'center', marginTop: 24, fontSize: 14 },
});

const s = StyleSheet.create({
  intro: { alignItems: 'center', paddingVertical: 27, gap: 8 }, logo: { width: 86, height: 86, borderRadius: 43, marginBottom: 10 },
  title: { color: colors.text, fontSize: 27, fontWeight: '700', textAlign: 'center' }, subtitle: { color: colors.muted, fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
