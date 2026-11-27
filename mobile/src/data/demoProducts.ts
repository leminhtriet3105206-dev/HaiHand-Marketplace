import type { ImageSourcePropType } from 'react-native';

export type DemoProduct = {
  id: string;
  title: string;
  price: number;
  district: string;
  condition: string;
  category: string;
  image: ImageSourcePropType;
};

// Mẫu nội dung từ màn Stitch. Thay bằng dữ liệu API khi kết nối backend.
export const demoProducts: DemoProduct[] = [
  {
    id: 'iphone',
    title: 'iPhone 14 Pro Max 256GB Vàng Gold',
    price: 19500000,
    district: 'Cầu Giấy',
    condition: 'Như mới 99%',
    category: 'Điện thoại & Tablet',
    image: require('../../assets/stitch-home/iphone.jpg'),
  },
  {
    id: 'headphones',
    title: 'Tai nghe Sony WH-1000XM4 chính hãng',
    price: 3850000,
    district: 'Đống Đa',
    condition: 'Mới 95%',
    category: 'Âm thanh',
    image: require('../../assets/stitch-home/headphones.jpg'),
  },
  {
    id: 'desk',
    title: 'Bàn làm việc gỗ sồi 1m2 còn rất đẹp',
    price: 850000,
    district: 'Thanh Xuân',
    condition: 'Đã dùng',
    category: 'Nội thất',
    image: require('../../assets/stitch-home/desk.jpg'),
  },
  {
    id: 'motorbike',
    title: 'Xe Wave Alpha 2021 chính chủ biển HN',
    price: 12200000,
    district: 'Nam Từ Liêm',
    condition: 'Như mới 90%',
    category: 'Xe máy cũ',
    image: require('../../assets/stitch-home/motorbike.jpg'),
  },
  {
    id: 'camera',
    title: 'Fujifilm X-T30 kèm lens 18-55mm',
    price: 14800000,
    district: 'Hai Bà Trưng',
    condition: 'Mới 98%',
    category: 'Máy ảnh',
    image: require('../../assets/stitch-home/camera.jpg'),
  },
  {
    id: 'jacket',
    title: 'Áo khoác da thật dáng Bomber size L',
    price: 590000,
    district: 'Hoàn Kiếm',
    condition: 'Đã dùng',
    category: 'Thời trang 2hand',
    image: require('../../assets/stitch-home/jacket.jpg'),
  },
];
