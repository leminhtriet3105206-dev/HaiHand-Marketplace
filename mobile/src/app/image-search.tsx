import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { request, type Product } from '../api/client';
import { Button, ProductGrid, Screen, Status } from '../components/ui';
import { colors } from '../theme';

export default function ImageSearchScreen() {
  const camera = useRef<CameraView>(null);
  const askedCamera = useRef(false);
  const [permission, requestCameraPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState(false);
  const [gallery, setGallery] = useState<MediaLibrary.Asset[]>([]);
  const [galleryAllowed, setGalleryAllowed] = useState(false);
  const [galleryError, setGalleryError] = useState('');
  const [selectedUri, setSelectedUri] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    setCameraActive(true);
    return () => setCameraActive(false);
  }, []));
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain && !askedCamera.current) {
      askedCamera.current = true;
      void requestCameraPermission();
    }
  }, [permission, requestCameraPermission]);

  const connectGallery = async () => {
    setGalleryError('');
    try {
      const access = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      if (!access.granted) { setGalleryError('Chưa được cấp quyền truy cập thư viện ảnh.'); return; }
      setGalleryAllowed(true);
      const recent = await MediaLibrary.getAssetsAsync({ mediaType: 'photo', first: 8, sortBy: [['creationTime', false]] });
      setGallery(recent.assets);
    } catch { setGalleryError('Không kết nối được thư viện ảnh. Hãy chọn “Xem tất cả”.'); }
  };

  const searchImage = async (uri: string) => {
    setSelectedUri(uri); setProducts([]); setSearched(true); setLoading(true); setError('');
    try {
      const context = ImageManipulator.manipulate(uri, { maxWidth: 1280, maxHeight: 1280 });
      const image = await context.renderAsync();
      const prepared = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
      if (!prepared.base64) throw new Error('Không đọc được ảnh đã chọn.');
      setSelectedUri(prepared.uri);
      const result = await request<{ products: Product[] }>('/api/image-search/search', {
        method: 'POST', body: { image: 'data:image/jpeg;base64,' + prepared.base64, message: '' }, timeoutMs: 120000,
      });
      setProducts(result.products || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tìm được sản phẩm từ ảnh.'); }
    finally { setLoading(false); }
  };

  const pickFromGallery = async () => {
    try {
      const access = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!access.granted) { setGalleryError('Chưa được cấp quyền truy cập thư viện ảnh.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (!result.canceled) void searchImage(result.assets[0].uri);
    } catch { setGalleryError('Không mở được thư viện ảnh.'); }
  };

  const selectRecent = async (asset: MediaLibrary.Asset) => {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      void searchImage(info.localUri || asset.uri);
    } catch { setGalleryError('Không đọc được ảnh này. Hãy chọn ảnh khác.'); }
  };

  const capture = async () => {
    if (!cameraReady || loading) return;
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.7 });
      if (photo?.uri) void searchImage(photo.uri);
      else setCameraError(true);
    } catch { setCameraError(true); }
  };

  if (searched) return <Screen title="Tìm bằng hình ảnh">
    {!!selectedUri && <Image source={{ uri: selectedUri }} style={s.selectedImage} resizeMode="contain" />}
    <Button title="Chụp hoặc chọn ảnh khác" secondary icon="camera-outline" disabled={loading} onPress={() => { setSearched(false); setSelectedUri(''); setProducts([]); setError(''); }} />
    <Status loading={loading} error={error} empty={!loading && !error && !products.length ? 'Không tìm thấy sản phẩm phù hợp.' : undefined} onRetry={error && selectedUri ? () => void searchImage(selectedUri) : undefined} />
    {!!products.length && <><Text style={s.resultsTitle}>Sản phẩm phù hợp</Text><ProductGrid products={products} /></>}
  </Screen>;

  const cameraConnected = permission?.granted && !cameraError;
  return <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
    <View style={s.frame}>
      <View style={s.preview}>
        {cameraConnected && cameraActive && <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} flash={flash ? 'on' : 'off'} onCameraReady={() => setCameraReady(true)} onMountError={() => setCameraError(true)} />}
        {!cameraConnected && <View style={s.cameraFallback}><Ionicons name="camera-outline" size={55} color="#FFFFFF" /><Text style={s.cameraFallbackText}>Chưa kết nối đến máy ảnh</Text><Text style={s.cameraHint}>Bạn vẫn có thể tìm sản phẩm bằng ảnh trong thư viện.</Text>{permission && !permission.granted && permission.canAskAgain && <Pressable onPress={() => void requestCameraPermission()} style={s.permissionButton}><Text style={s.permissionText}>Cho phép dùng máy ảnh</Text></Pressable>}</View>}
        <View style={s.topControls}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Đóng tìm kiếm bằng ảnh" style={s.iconButton}><Ionicons name="close" size={31} color="#FFFFFF" /></Pressable>
          {cameraConnected && <View style={s.rightControls}><Pressable onPress={() => setFlash((value) => !value)} accessibilityLabel={flash ? 'Tắt đèn flash' : 'Bật đèn flash'} style={s.iconButton}><Ionicons name={flash ? 'flash' : 'flash-outline'} size={27} color="#FFFFFF" /></Pressable><Pressable onPress={() => { setCameraReady(false); setFacing((value) => value === 'back' ? 'front' : 'back'); }} accessibilityLabel="Đổi camera" style={s.iconButton}><Ionicons name="camera-reverse-outline" size={29} color="#FFFFFF" /></Pressable></View>}
        </View>
        {cameraConnected && <View style={s.captureArea}><Text style={s.captureHint}>Nhấn vào nút để tìm kiếm</Text><Pressable onPress={() => void capture()} disabled={!cameraReady || loading} accessibilityLabel="Chụp ảnh để tìm sản phẩm" style={[s.shutter, !cameraReady && s.disabled]}><View style={s.shutterInner} /></Pressable></View>}
      </View>
      <View style={s.library}>
        <View style={s.libraryHeader}><Text style={s.libraryTitle}>Tìm trong thư viện</Text><Pressable onPress={() => void pickFromGallery()} accessibilityLabel="Xem tất cả ảnh" style={s.seeAll}><Text style={s.seeAllText}>Xem tất cả</Text><Ionicons name="chevron-forward" size={21} color={colors.text} /></Pressable></View>
        {Constants.expoGoConfig ? <Text style={s.galleryMessage}>Trong Expo Go, chọn “Xem tất cả” để mở thư viện ảnh. Ảnh gần đây sẽ hiện ở bản build HaiHand.</Text> : galleryAllowed ? gallery.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.galleryRow}>{gallery.map((item) => <Pressable key={item.id} onPress={() => void selectRecent(item)} accessibilityLabel="Tìm bằng ảnh gần đây"><Image source={{ uri: item.uri }} style={s.thumbnail} /></Pressable>)}</ScrollView> : <Text style={s.galleryMessage}>Thư viện chưa có ảnh. Chọn “Xem tất cả” để tìm ảnh.</Text> : <Pressable onPress={() => void connectGallery()} style={s.connectGallery}><Ionicons name="images-outline" size={23} color={colors.orange} /><Text style={s.connectText}>Cho phép xem ảnh gần đây</Text></Pressable>}
        {!!galleryError && <Text style={s.galleryError}>{galleryError}</Text>}
      </View>
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#141414' }, frame: { flex: 1, maxWidth: 480, width: '100%', alignSelf: 'center' }, preview: { flex: 1, backgroundColor: '#282624', overflow: 'hidden' },
  cameraFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25, gap: 10 }, cameraFallbackText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', textAlign: 'center' }, cameraHint: { color: '#D8D3CE', textAlign: 'center', lineHeight: 20 }, permissionButton: { marginTop: 8, backgroundColor: colors.yellow, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }, permissionText: { color: colors.text, fontWeight: '700' },
  topControls: { position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' }, rightControls: { flexDirection: 'row', gap: 12 }, iconButton: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#00000055' },
  captureArea: { position: 'absolute', bottom: 26, alignSelf: 'center', alignItems: 'center', gap: 25 }, captureHint: { color: '#FFFFFF', fontSize: 16, backgroundColor: '#00000088', overflow: 'hidden', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 }, shutter: { width: 84, height: 84, borderRadius: 42, borderWidth: 6, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF44' }, shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#FFFFFF' }, disabled: { opacity: 0.5 },
  library: { minHeight: 195, maxHeight: 245, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, marginTop: -20, paddingTop: 18, paddingBottom: 18 }, libraryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 14 }, libraryTitle: { color: colors.text, fontSize: 20, fontWeight: '700' }, seeAll: { flexDirection: 'row', alignItems: 'center' }, seeAllText: { color: colors.text, fontSize: 14 }, galleryRow: { gap: 3, paddingHorizontal: 14 }, thumbnail: { width: 82, height: 82, backgroundColor: colors.border }, connectGallery: { marginHorizontal: 16, minHeight: 84, borderRadius: 10, backgroundColor: '#FFF8E2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, connectText: { color: colors.orange, fontWeight: '700' }, galleryMessage: { color: colors.muted, marginHorizontal: 16 }, galleryError: { color: colors.red, marginHorizontal: 16, marginTop: 6 },
  selectedImage: { width: '100%', height: 230, backgroundColor: colors.surface, borderRadius: 12 }, resultsTitle: { color: colors.text, fontWeight: '700', fontSize: 17, marginVertical: 14 },
});
