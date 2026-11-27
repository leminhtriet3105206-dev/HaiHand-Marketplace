import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatPrice, productImage, productTitle, type Product } from '../api/client';
import { colors } from '../theme';
import { Footer } from './Footer';
import { Header } from './Header';

export function Screen({ children, title, tab, scroll = true, right }: { children: ReactNode; title?: string; tab?: string; scroll?: boolean; right?: ReactNode }) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.frame}>
        {title && <Header title={title} right={right} />}
        {scroll ? <ScrollView style={s.flex} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView> : <View style={[s.flex, s.content]}>{children}</View>}
        {tab && <Footer active={tab} />}
      </View>
    </SafeAreaView>
  );
}

export function Button({ title, onPress, secondary = false, disabled = false, icon }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[s.button, secondary && s.buttonSecondary, disabled && s.buttonDisabled]}>
    {icon && <Ionicons name={icon} size={19} color={colors.text} />}
    <Text style={s.buttonText}>{title}</Text>
  </Pressable>;
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry, showPasswordToggle, keyboardType, multiline, error }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; secureTextEntry?: boolean; showPasswordToggle?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric'; multiline?: boolean; error?: string;
}) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  return <View style={s.fieldWrap}>
    <Text style={s.fieldLabel}>{label}</Text>
    <View style={[s.inputBox, error && s.inputError]}>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry && !passwordVisible} keyboardType={keyboardType} multiline={multiline}
        autoCapitalize={secureTextEntry || keyboardType === 'email-address' ? 'none' : 'sentences'} autoCorrect={!secureTextEntry}
        style={[s.input, multiline && s.multiline, showPasswordToggle && s.inputWithToggle]} />
      {secureTextEntry && showPasswordToggle && <Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        onPress={() => setPasswordVisible((visible) => !visible)} style={s.passwordToggle}>
        <Ionicons name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
      </Pressable>}
    </View>
    {!!error && <Text style={s.fieldError} accessibilityRole="alert">{error}</Text>}
  </View>;
}

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <Text style={[s.notice, error && s.noticeError]}>{children}</Text>;
}

export function Status({ loading, error, empty, onRetry }: { loading?: boolean; error?: string; empty?: string; onRetry?: () => void }) {
  if (loading) return <View style={s.status}><ActivityIndicator color={colors.orange} /><Text style={s.statusText}>Đang tải...</Text></View>;
  if (error) return <View style={s.status}><Text style={s.statusText}>{error}</Text>{onRetry && <Button title="Thử lại" onPress={onRetry} secondary />}</View>;
  if (empty) return <View style={s.status}><Ionicons name="file-tray-outline" size={38} color={colors.muted} /><Text style={s.statusText}>{empty}</Text></View>;
  return null;
}

export function ProductTile({ product, onFavorite, favorite, style }: { product: Product; onFavorite?: () => void; favorite?: boolean; style?: StyleProp<ViewStyle> }) {
  const uri = productImage(product);
  return <Pressable style={[s.productCard, style]} onPress={() => router.push({ pathname: '/product/[id]', params: { id: product._id } })}>
    <View style={s.productImageBox}>{uri ? <Image source={{ uri }} style={s.productImage} resizeMode="cover" /> : <Ionicons name="image-outline" size={36} color={colors.muted} />}
      {!!product.condition && <Text style={s.condition} numberOfLines={1}>{product.condition}</Text>}
      {onFavorite && <Pressable onPress={onFavorite} accessibilityLabel={favorite ? 'Bỏ yêu thích' : 'Thêm yêu thích'} style={s.heart}><Ionicons name={favorite ? 'heart' : 'heart-outline'} size={21} color={favorite ? colors.red : colors.muted} /></Pressable>}
    </View>
    <View style={s.productBody}>
      <Text style={s.productTitle} numberOfLines={2}>{productTitle(product)}</Text>
      <Text style={s.price}>{formatPrice(product.price)}</Text>
      <Text style={s.location} numberOfLines={1}>{product.location || 'Việt Nam'}</Text>
    </View>
  </Pressable>;
}

export function ProductGrid({ products, favorites, onFavorite }: { products: Product[]; favorites?: string[]; onFavorite?: (id: string) => void }) {
  return <View style={s.grid}>{products.map((product) => <ProductTile key={product._id} product={product} favorite={favorites?.includes(product._id)} onFavorite={onFavorite ? () => onFavorite(product._id) : undefined} />)}</View>;
}

export function ProductList({ products, favorites, onFavorite, header, footer, onEndReached, contentContainerStyle }: {
  products: Product[]; favorites?: string[]; onFavorite?: (id: string) => void; header?: ReactNode; footer?: ReactNode;
  onEndReached?: () => void; contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  return <FlatList
    data={products} numColumns={2} keyExtractor={(item) => item._id}
    ListHeaderComponent={header ? <>{header}</> : undefined} ListFooterComponent={footer ? <>{footer}</> : undefined}
    contentContainerStyle={[s.listContent, contentContainerStyle]}
    renderItem={({ item }) => <View style={s.listCell}><ProductTile product={item} style={s.listTile} favorite={favorites?.includes(item._id)} onFavorite={onFavorite ? () => onFavorite(item._id) : undefined} /></View>}
    onEndReached={onEndReached} onEndReachedThreshold={0.35}
    initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7}
    keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
  />;
}

export function RowLink({ label, icon, href, detail }: { label: string; icon: keyof typeof Ionicons.glyphMap; href: Href; detail?: string }) {
  return <Pressable onPress={() => router.push(href)} style={s.rowLink}><Ionicons name={icon} size={22} color={colors.orange} /><Text style={s.rowLabel}>{label}</Text>{detail && <Text style={s.rowDetail}>{detail}</Text>}<Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, frame: { flex: 1, backgroundColor: colors.background, maxWidth: 480, width: '100%', alignSelf: 'center' }, flex: { flex: 1 },
  content: { padding: 14, paddingBottom: 24 },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: colors.yellow, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginVertical: 5 },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, buttonDisabled: { opacity: 0.55 }, buttonText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  fieldWrap: { marginBottom: 14 }, fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 6 },
  inputBox: { position: 'relative' }, inputWithToggle: { paddingRight: 50 }, passwordToggle: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, alignItems: 'center', justifyContent: 'center' },
  inputError: { borderRadius: 10, borderWidth: 1, borderColor: colors.red }, fieldError: { color: colors.red, fontSize: 12, marginTop: 4 },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 13, fontSize: 15, color: colors.text }, multiline: { minHeight: 100, textAlignVertical: 'top', paddingTop: 11 },
  notice: { color: colors.muted, fontSize: 13, lineHeight: 19, marginVertical: 8 }, noticeError: { color: colors.red },
  status: { minHeight: 180, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 25 }, statusText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 9 }, productCard: { width: '49%', backgroundColor: colors.surface, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  listContent: { paddingBottom: 24 }, listCell: { width: '50%', paddingHorizontal: 4, marginBottom: 9 }, listTile: { width: '100%' },
  productImageBox: { width: '100%', aspectRatio: 1, backgroundColor: '#F4ECE8', alignItems: 'center', justifyContent: 'center' }, productImage: { width: '100%', height: '100%' },
  condition: { position: 'absolute', top: 8, left: 8, maxWidth: '68%', backgroundColor: '#FFFCF1', overflow: 'hidden', borderRadius: 12, paddingHorizontal: 7, paddingVertical: 4, color: colors.orange, fontSize: 10, fontWeight: '700' },
  heart: { position: 'absolute', top: 7, right: 7, width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFDF2DD', alignItems: 'center', justifyContent: 'center' },
  productBody: { minHeight: 106, padding: 10 }, productTitle: { color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 18, minHeight: 36 },
  price: { color: colors.orange, fontWeight: '700', fontSize: 18, marginTop: 4 }, location: { color: colors.muted, fontSize: 11, marginTop: 8 },
  rowLink: { minHeight: 56, paddingHorizontal: 13, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }, rowDetail: { color: colors.muted, fontSize: 12 },
});
