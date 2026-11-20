#!/usr/bin/env node
'use strict';

/**
 * Idempotent B2C Dataset Seeding Script for HaiHand Marketplace
 *
 * Generates and seeds:
 *  - 200 Users (30 approved B2C sellers with shopInfo & pickupAddress + 170 buyers with addresses)
 *  - 1,500 Products in `posts` collection (linked to approved sellers, active & approved, with variants)
 *  - 300 Orders across Pending / Processing / Shipped / Delivered / Completed / Cancelled
 *  - 300 PaymentSessions + matching Transaction records (Thanh toán đơn hàng / Giải ngân / Hoàn tiền)
 *
 * Usage:
 *   node backend/scripts/seed-b2c-data.js --dry-run
 *   node backend/scripts/seed-b2c-data.js --apply
 */

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const User = require('../models/User');
const { Product } = require('../models/Product');
const Order = require('../models/Order');
const PaymentSession = require('../models/PaymentSession');
const Transaction = require('../models/Transaction');
const { formatAddress, isCompleteAddress } = require('../models/schemas/Address');
const {
  provinces,
  districtsByProvince,
  wardsByDistrict
} = require('../services/shipping/vnLocations');

// Category model (defined inline in backend/server.js)
const Category = mongoose.models.Category || mongoose.model('Category', new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String, required: true },
  description: { type: String, default: '' }
}));

// ============================================================================
// Deterministic PRNG & ObjectId Helpers
// ============================================================================
function createRng(seed = 20261119) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(20261119);

function randInt(min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function pickWeighted(items) {
  const total = items.reduce((s, it) => s + it.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.value;
  }
  return items[items.length - 1].value;
}

function roundToThousand(n) {
  return Math.max(1000, Math.round(n / 1000) * 1000);
}

function randomDateBetween(startIso, endIso) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return new Date(start + Math.floor(rng() * (end - start + 1)));
}

/**
 * Deterministic 24-hex MongoDB ObjectId:
 * prefix `6b2c` + 4-hex entity type + 16-hex zero-padded sequence
 */
function makeObjectId(typeHex, seq) {
  const hex = `6b2c${typeHex}${String(seq).padStart(16, '0')}`;
  return new mongoose.Types.ObjectId(hex);
}

const TYPE_HEX = {
  USER: '0001',
  PRODUCT: '0002',
  ORDER: '0003',
  SESSION: '0004',
  TXN: '0005'
};

// ============================================================================
// Vietnamese Master Dictionaries
// ============================================================================
const LAST_NAMES = [
  'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ',
  'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Đoàn', 'Trịnh', 'Lâm'
];

const MIDDLE_NAMES_MALE = ['Văn', 'Minh', 'Quốc', 'Đức', 'Gia', 'Hữu', 'Thanh', 'Tuấn', 'Quang', 'Bảo', 'Nhật', 'Hoàng'];
const FIRST_NAMES_MALE = ['Hùng', 'Dũng', 'Nam', 'Anh', 'Khang', 'Phúc', 'Long', 'Huy', 'Tuấn', 'Đạt', 'Khoa', 'Tài', 'Vinh', 'Thịnh', 'Sơn', 'Bình', 'Kiên', 'Trung'];

const MIDDLE_NAMES_FEMALE = ['Thị', 'Ngọc', 'Thu', 'Thanh', 'Minh', 'Khánh', 'Phương', 'Hoài', 'Bích', 'Thùy', 'Hồng', 'Kim'];
const FIRST_NAMES_FEMALE = ['Lan', 'Hương', 'Trang', 'Linh', 'Anh', 'Nhi', 'Vy', 'Thảo', 'Hà', 'Ngọc', 'Mai', 'Yến', 'Châu', 'My', 'Tâm', 'Quyên', 'Hân', 'Trâm'];

const STREET_NAMES = [
  'Nguyễn Trãi', 'Lê Lợi', 'Trần Hưng Đạo', 'Hai Bà Trưng', 'Lý Thường Kiệt',
  'Nguyễn Huệ', 'Điện Biên Phủ', 'Cách Mạng Tháng 8', 'Võ Văn Tần', 'Phan Xích Long',
  'Cầu Giấy', 'Xuân Thủy', 'Láng Hạ', 'Thái Hà', 'Phố Huế', 'Bà Triệu',
  'Nguyễn Văn Linh', 'Bạch Đằng', 'Hùng Vương', 'Quang Trung', 'Lê Duẩn',
  'Nguyễn Thị Minh Khai', 'Hoàng Diệu', 'Tôn Đức Thắng', 'Trường Chinh', 'Phạm Văn Đồng'
];

const PHONE_PREFIXES = ['090', '091', '093', '094', '096', '097', '098', '032', '034', '035', '036', '038', '039', '070', '076', '077', '078', '079', '081', '082', '083', '084', '085', '086', '088', '089'];

const BANKS = ['Vietcombank', 'Techcombank', 'MB Bank', 'ACB', 'BIDV', 'VietinBank', 'VPBank', 'TPBank'];

const SHOP_TEMPLATES = [
  { name: 'CoolWear Official Store', desc: 'Chuyên thời trang nam nữ thiết kế tối giản, chất liệu cotton cao cấp, đổi trả 7 ngày.' },
  { name: 'TechZone VN Mall', desc: 'Phân phối chính hãng phụ kiện công nghệ, tai nghe, sạc nhanh và thiết bị thông minh.' },
  { name: 'HomeCraft Living', desc: 'Đồ gia dụng thông minh và nội thất tiện ích cho căn hộ hiện đại.' },
  { name: 'GlowUp Beauty Lab', desc: 'Mỹ phẩm chăm sóc da chính hãng nhập khẩu Hàn Quốc, Nhật Bản và Châu Âu.' },
  { name: 'BabyCare Việt Nam', desc: 'Cửa hàng Mẹ & Bé uy tín — sản phẩm an toàn đạt chuẩn cho trẻ sơ sinh và trẻ nhỏ.' },
  { name: 'ActivePro Sports', desc: 'Dụng cụ thể thao, đồ tập gym, chạy bộ và phụ kiện dã ngoại chuyên nghiệp.' },
  { name: 'Saigon Urban Fashion', desc: 'Local brand thời trang đường phố và công sở trẻ trung tại TP.HCM.' },
  { name: 'Hanoi Digital Hub', desc: 'Thiết bị ngoại vi, bàn phím cơ, chuột gaming và phụ kiện laptop chính hãng.' },
  { name: 'Bếp Xinh Gia Dụng', desc: 'Nồi chiên không dầu, máy xay sinh tố và dụng cụ nhà bếp cao cấp.' },
  { name: 'Làn Da Việt Cosmetics', desc: 'Chăm sóc da thuần chay, serum dưỡng ẩm và chống nắng dịu nhẹ.' },
  { name: 'Mầm Non Store', desc: 'Đồ chơi giáo dục Montessori, bình sữa và thời trang cotton hữu cơ cho bé.' },
  { name: 'TrekVN Outdoor', desc: 'Lều trại, balo trekking và phụ kiện du lịch bền bỉ cho mọi hành trình.' },
  { name: 'Minimalist Wardrobe', desc: 'Thời trang cơ bản dễ phối đồ — áo sơ mi, quần âu, áo khoác thanh lịch.' },
  { name: 'SmartLife Electronics', desc: 'Thiết bị nhà thông minh, camera an ninh, đèn LED và ổ cắm WiFi.' },
  { name: 'An Nhiên Home Decor', desc: 'Chăn ga gối đệm, đèn ngủ và phụ kiện trang trí không gian sống.' },
  { name: 'PureSkin Official', desc: 'Dược mỹ phẩm chăm sóc da mụn, phục hồi hàng rào bảo vệ da.' },
  { name: 'Kiddo World VN', desc: 'Xe đẩy, ghế ăn dặm và đồ dùng thiết yếu chính hãng cho mẹ bầu và em bé.' },
  { name: 'FitZone Gear', desc: 'Thảm yoga, tạ tay, dây kháng lực và trang phục tập luyện thoáng khí.' },
  { name: 'Đông Dương Watch & Style', desc: 'Đồng hồ, kính mát, túi xách và phụ kiện thời trang tuyển chọn.' },
  { name: 'AudioLab Việt Nam', desc: 'Tai nghe Hi-Res, loa Bluetooth di động và micro thu âm chuyên nghiệp.' },
  { name: 'EcoKitchen Store', desc: 'Bình giữ nhiệt inox 304, hộp cơm thủy tinh và đồ dùng thân thiện môi trường.' },
  { name: 'Nữ Hoàng Sắc Đẹp', desc: 'Son môi, trang điểm nền và nước hoa chiết chính hãng.' },
  { name: 'Bé Khỏe Mẹ Vui', desc: 'Máy hâm sữa, máy tiệt trùng UV và thực phẩm bổ sung cho bé.' },
  { name: 'Runner Club Shop', desc: 'Giày chạy bộ, tất thể thao chuyên dụng và phụ kiện marathon.' },
  { name: 'Vải Sợi Tự Nhiên VN', desc: 'Áo linen, đầm lụa và trang phục mặc nhà thoáng mát chuẩn form Việt.' },
  { name: 'Gadget365 Store', desc: 'Cáp sạc bọc dù, pin dự phòng chuẩn PD và giá đỡ điện thoại hợp kim.' },
  { name: 'Tổ Ấm Việt Furniture', desc: 'Bàn làm việc công thái học, kệ sách lắp ghép và ghế văn phòng.' },
  { name: 'HerbalCare Studio', desc: 'Dầu gội thảo dược, sữa tắm thiên nhiên và tinh dầu thư giãn.' },
  { name: 'Little Star Baby Shop', desc: 'Quần áo sơ sinh, khăn sữa sợi tre và phụ kiện chăm sóc bé yêu.' },
  { name: 'Đà Nẵng Sport & Camp', desc: 'Vợt cầu lông, bóng đá, phụ kiện bơi lội và dã ngoại biển.' }
];

// ============================================================================
// 6 B2C Categories & Rich Vietnamese Product Catalog Definitions
// ============================================================================
const CATEGORIES = [
  {
    name: 'Thời trang',
    image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=600&q=80',
    description: 'Quần áo, giày dép, túi xách và phụ kiện thời trang nam nữ',
    priceRange: [95000, 2450000],
    weightRange: [200, 1200],
    brands: ['Coolmate', 'Yody', 'Routine', 'Owen', 'Canifa', 'Biti\'s Hunter', 'Juno', 'Vascara', 'Uniqlo', 'Levents'],
    items: [
      'Áo Thun Nam Cotton Compact', 'Áo Polo Thể Thao Khô Nhanh', 'Áo Sơ Mi Dài Tay Oxford',
      'Quần Jeans Nam Slim Fit', 'Quần Kaki Công Sở Co Giãn', 'Áo Khoác Gió 2 Lớp Chống Nước',
      'Váy Midi Hoa Nhí Thanh Lịch', 'Áo Len Cổ Lọ Dệt Kim Mềm Mịn', 'Quần Ống Suông Cạp Cao Nữ',
      'Giày Sneaker Đế Êm Thời Trang', 'Balo Laptop Công Sở Chống Thấm', 'Túi Đeo Chéo Da PU Cao Cấp',
      'Áo Hoodie Nỉ Bông Form Rộng', 'Chân Váy Xếp Ly Hàn Quốc', 'Thắt Lưng Da Bò Khóa Tự Động'
    ],
    qualifiers: [
      'Co Giãn 4 Chiều', 'Form Rộng Trẻ Trung', 'Chất Vải Thoáng Khí', 'Chống Nhăn Tối Ưu',
      'Phiên Bản Cao Cấp', 'Màu Trung Tính Dễ Phối', 'Thiết Kế Tối Giản', 'Đường May Tỉ Mỉ',
      'Chống Tia UV UPF50+', 'Siêu Nhẹ Mềm Mại'
    ],
    variantSets: [
      { label: 'Màu sắc / Size', options: ['Đen - M', 'Đen - L', 'Trắng - M', 'Xám - L', 'Be - XL'] },
      { label: 'Kích cỡ', options: ['Size S', 'Size M', 'Size L', 'Size XL'] }
    ],
    images: [
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=800&q=80'
    ]
  },
  {
    name: 'Điện tử & Phụ kiện',
    image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=600&q=80',
    description: 'Tai nghe, bàn phím, sạc dự phòng, loa Bluetooth và thiết bị thông minh',
    priceRange: [120000, 12500000],
    weightRange: [150, 2800],
    brands: ['Anker', 'Baseus', 'Logitech', 'Keychron', 'Sony', 'JBL', 'Xiaomi', 'Ugreen', 'Edifier', 'TP-Link'],
    items: [
      'Tai Nghe Bluetooth Chống Ồn Chủ Động ANC', 'Sạc Dự Phòng Sạc Nhanh PD 20000mAh',
      'Củ Sạc Nhanh GaN 65W 3 Cổng', 'Bàn Phím Cơ Không Dây Hot-Swap',
      'Chuột Không Dây Công Thái Học Silent', 'Loa Bluetooth Di Động Chống Nước IPX7',
      'Hub Chuyển Đổi Type-C 7 Trong 1', 'Camera An Ninh WiFi Xoay 360 Độ 2K',
      'Đồng Hồ Thông Minh Theo Dõi Sức Khỏe', 'Micro Thu Âm USB Condenser',
      'Đèn Treo Màn Hình Chống Cận Thị', 'Giá Đỡ Laptop Nhôm Nguyên Khối',
      'Ổ Cứng Di Động SSD Tốc Độ Cao 1TB', 'Bộ Phát WiFi 6 Băng Tần Kép',
      'Cáp Sạc Nhanh Type-C Bọc Dù 100W'
    ],
    qualifiers: [
      'Bluetooth 5.3 Ổn Định', 'Bảo Hành Chính Hãng 12 Tháng', 'Hỗ Trợ Sạc Nhanh PD/QC',
      'Pin Trâu 30 Giờ', 'Thiết Kế Nhôm Nguyên Khối', 'Độ Trễ Thấp Gaming',
      'Âm Thanh Hi-Res Sống Động', 'Nhỏ Gọn Tiện Lợi', 'Tương Thích Đa Thiết Bị', 'Bản Pro 2026'
    ],
    variantSets: [
      { label: 'Phiên bản', options: ['Bản Tiêu Chuẩn - Đen', 'Bản Pro - Đen', 'Bản Pro - Trắng'] },
      { label: 'Màu sắc', options: ['Đen Nhám', 'Trắng Ngọc Trai', 'Xám Không Gian'] }
    ],
    images: [
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=80'
    ]
  },
  {
    name: 'Nhà cửa & Đời sống',
    image: 'https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?auto=format&fit=crop&w=600&q=80',
    description: 'Đồ gia dụng, dụng cụ nhà bếp, nội thất văn phòng và trang trí nhà cửa',
    priceRange: [65000, 4800000],
    weightRange: [300, 5000],
    brands: ['Lock&Lock', 'Elmich', 'Sunhouse', 'Philips', 'Bear', 'Deerma', 'Sihoo', 'Inochi', 'Rapido', 'Kalite'],
    items: [
      'Nồi Chiên Không Dầu Điện Tử 6.5 Lít', 'Bình Giữ Nhiệt Inox 304 750ml',
      'Máy Hút Bụi Cầm Tay Không Dây', 'Ghế Công Thái Học Đệm Lưới Thoáng Khí',
      'Bộ Chăn Ga Gối Cotton Satin 4 Món', 'Máy Xay Sinh Tố Đa Năng Cối Thủy Tinh',
      'Ấm Siêu Tốc 2 Lớp Chống Bỏng 1.8L', 'Đèn Bàn Học Chống Cận Cảm Ứng',
      'Hộp Cơm Giữ Nhiệt Văn Phòng 3 Ngăn', 'Kệ Sách Gỗ Lắp Ghép 5 Tầng',
      'Bàn Làm Việc Gaming Mặt Gỗ MDF', 'Bộ Nồi Inox 3 Đáy Dùng Bếp Từ',
      'Máy Lọc Không Khí Phòng Ngủ HEPA', 'Cây Lau Nhà Tự Vắt Thông Minh',
      'Tủ Nhựa Đựng Đồ Đa Năng Có Bánh Xe'
    ],
    qualifiers: [
      'Tiết Kiệm Điện Năng', 'An Toàn Thực Phẩm', 'Thiết Kế Hiện Đại Bắc Âu',
      'Dễ Dàng Vệ Sinh', 'Chống Dính Cao Cấp', 'Vận Hành Êm Ái',
      'Khung Thép Sơn Tĩnh Điện', 'Chịu Lực Tốt', 'Tiện Ích Cho Gia Đình', 'Bảo Hành 24 Tháng'
    ],
    variantSets: [
      { label: 'Màu sắc', options: ['Trắng Kem', 'Xám Ghi', 'Đen Nhám'] },
      { label: 'Dung tích / Kích cỡ', options: ['Cỡ Tiêu Chuẩn', 'Cỡ Lớn Gia Đình'] }
    ],
    images: [
      'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1580480055273-228ff5388ef8?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&w=800&q=80'
    ]
  },
  {
    name: 'Sức khỏe & Làm đẹp',
    image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=600&q=80',
    description: 'Chăm sóc da, mỹ phẩm trang điểm, chăm sóc tóc và sức khỏe cá nhân',
    priceRange: [55000, 1850000],
    weightRange: [100, 900],
    brands: ['La Roche-Posay', 'Cocoon', 'L\'Oreal', 'Innisfree', 'Bioderma', 'CeraVe', 'Paula\'s Choice', 'Simple', 'Klairs', 'Anessa'],
    items: [
      'Kem Chống Nắng Kiềm Dầu SPF50+ PA++++', 'Nước Tẩy Trang Dịu Nhẹ Cho Da Nhạy Cảm',
      'Serum Vitamin C Làm Sáng Mờ Thâm', 'Sữa Rửa Mặt Tạo Bọt Cân Bằng pH',
      'Kem Dưỡng Ẩm Phục Hồi Hàng Rào Da B5', 'Toner Hoa Cúc Làm Dịu Da Không Cồn',
      'Mặt Nạ Đất Sét Làm Sạch Lỗ Chân Lông', 'Son Kem Lì Mịn Môi Lâu Trôi',
      'Tẩy Tế Bào Chết Cơ Thể Cà Phê Đắk Lắk', 'Dầu Gội Thảo Dược Ngăn Rụng Tóc',
      'Tinh Chất Dưỡng Tóc Suôn Mượt Argan', 'Nước Hoa Nữ Hương Hoa Nhẹ Nhàng 50ml',
      'Bàn Chải Điện Sóng Âm Làm Sạch Sâu', 'Máy Rửa Mặt Silicone Y Tế',
      'Sữa Tắm Dưỡng Ẩm Hương Thiên Nhiên'
    ],
    qualifiers: [
      'Thuần Chay Không Paraben', 'Dành Cho Da Dầu Mụn', 'Cấp Ẩm Chuyên Sâu 48H',
      'Nhập Khẩu Chính Ngạch', 'Thẩm Thấu Nhanh Không Nhờn Rít', 'Công Thức Bác Sĩ Da Liễu',
      'Chiết Xuất Thiên Nhiên', 'Hương Thơm Dịu Nhẹ', 'Tem Phụ Tiếng Việt Đầy Đủ', 'Chai Fullsize Tiết Kiệm'
    ],
    variantSets: [
      { label: 'Dung tích', options: ['50ml', '100ml', '200ml'] },
      { label: 'Phân loại', options: ['Da Dầu Mụn', 'Da Khô Nhạy Cảm', 'Mọi Loại Da'] }
    ],
    images: [
      'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80'
    ]
  },
  {
    name: 'Mẹ & Bé',
    image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=600&q=80',
    description: 'Đồ dùng sơ sinh, bình sữa, xe đẩy, đồ chơi giáo dục và chăm sóc mẹ bầu',
    priceRange: [45000, 3900000],
    weightRange: [150, 4500],
    brands: ['Pigeon', 'Moyuum', 'Fatzbaby', 'Huggies', 'Bobby', 'Chicco', 'Nous', 'Combi', 'Avent', 'Joie'],
    items: [
      'Bình Sữa PPSU Cổ Rộng Chống Sặc 240ml', 'Máy Hâm Sữa Tiệt Trùng Đa Năng',
      'Tã Quần Siêu Thấm Thoáng Khí Gói Đại', 'Set Quần Áo Sơ Sinh Cotton Hữu Cơ',
      'Xe Đẩy Gấp Gọn Hai Chiều Cho Bé', 'Ghế Ăn Dặm Đa Năng Có Khay Rời',
      'Đồ Chơi Xếp Hình Gỗ Montessori An Toàn', 'Khăn Sữa Sợi Tre 4 Lớp Siêu Mềm',
      'Sữa Tắm Gội Tạo Bọt Thảo Dược Cho Bé', 'Địu Ngồi Trợ Lực Thoáng Khí 4 Tư Thế',
      'Máy Hút Sữa Điện Đôi Êm Ái Không Đau', 'Nhiệt Kế Hồng Ngoại Đo Trán Điện Tử',
      'Balo Bỉm Sữa Đa Năng Giữ Nhiệt Bình', 'Thảm Chơi Xốp Gấp Gọn Chống Trượt',
      'Bộ Chén Muỗng Ăn Dặm Silicone Chống Đổ'
    ],
    qualifiers: [
      'Không Chứa BPA An Toàn Tuyệt Đối', 'Mềm Mại Cho Làn Da Bé', 'Đạt Chuẩn An Toàn Châu Âu',
      'Chống Đầy Hơi Nôn Trớ', 'Thiết Kế Nhỏ Gọn Mang Đi Du Lịch', 'Kháng Khuẩn Tự Nhiên',
      'Hàng Chính Hãng Có Hóa Đơn', 'Phù Hợp Bé 0–36 Tháng', 'Dễ Tháo Lắp Tiệt Trùng', 'Mẫu Mới 2026'
    ],
    variantSets: [
      { label: 'Phân loại', options: ['Màu Kem', 'Xanh Pastel', 'Hồng Phấn'] },
      { label: 'Độ tuổi / Size', options: ['0-6 Tháng', '6-12 Tháng', '1-3 Tuổi'] }
    ],
    images: [
      'https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1566004100631-35d015d6a491?auto=format&fit=crop&w=800&q=80'
    ]
  },
  {
    name: 'Thể thao & Du lịch',
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=600&q=80',
    description: 'Dụng cụ tập gym, yoga, cầu lông, chạy bộ và phụ kiện dã ngoại cắm trại',
    priceRange: [75000, 4200000],
    weightRange: [200, 4800],
    brands: ['Decathlon', 'Yonex', 'Lining', 'Nike', 'Adidas', 'Naturehike', 'Camel', 'Aolikes', 'Babolat', 'Mizuno'],
    items: [
      'Thảm Tập Yoga TPE 2 Lớp Chống Trượt 8mm', 'Vợt Cầu Lông Carbon Siêu Nhẹ 4U',
      'Giày Chạy Bộ Đệm Khí Giảm Chấn', 'Lều Cắm Trại Tự Bung 4 Người Chống Mưa',
      'Balo Trekking Leo Núi 45L Trợ Lực', 'Bộ Tạ Tay Bọc Cao Su Tháo Lắp 15kg',
      'Dây Nhảy Thể Lực Lõi Thép Có Đếm Vòng', 'Bình Nước Thể Thao Tritan 1 Lít',
      'Bộ Dây Kháng Lực Tập Gym 5 Mức Độ', 'Vali Kéo Du Lịch Nhựa PC Chống Vỡ Size 24',
      'Kính Bơi Chống Sương Mù Tia UV', 'Ghế Xếp Dã Ngoại Hợp Kim Nhôm Siêu Nhẹ',
      'Túi Trống Tập Gym Có Ngăn Đựng Giày', 'Đai Bảo Vệ Đầu Gối Thể Thao Chuyên Dụng',
      'Đèn Pin Đội Đầu Siêu Sáng Sạc USB'
    ],
    qualifiers: [
      'Chống Nước Bền Bỉ', 'Siêu Nhẹ Dễ Mang Theo', 'Hỗ Trợ Vận Động Cường Độ Cao',
      'Chống Trượt An Toàn', 'Thiết Kế Công Thái Học', 'Chịu Tải Trọng Lớn',
      'Thoáng Khí Khử Mùi', 'Gấp Gọn Tiện Lợi', 'Đạt Chuẩn Thi Đấu', 'Phiên Bản Pro'
    ],
    variantSets: [
      { label: 'Màu sắc', options: ['Đen Carbon', 'Xanh Navy', 'Xám Bạc', 'Cam Nổi Bật'] },
      { label: 'Kích thước', options: ['Size Tiêu Chuẩn', 'Size Lớn'] }
    ],
    images: [
      'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?auto=format&fit=crop&w=800&q=80'
    ]
  }
];

// ============================================================================
// Helper Generators
// ============================================================================
function generateVietnameseName() {
  const isMale = rng() < 0.5;
  const last = pick(LAST_NAMES);
  const mid = pick(isMale ? MIDDLE_NAMES_MALE : MIDDLE_NAMES_FEMALE);
  const first = pick(isMale ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE);
  return `${last} ${mid} ${first}`;
}

function generateUniquePhone(usedPhones) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const prefix = pick(PHONE_PREFIXES);
    const rest = String(randInt(1000000, 9999999));
    const phone = `${prefix}${rest}`;
    if (!usedPhones.has(phone)) {
      usedPhones.add(phone);
      return phone;
    }
  }
  throw new Error('Could not generate unique Vietnamese phone number');
}

function generateStructuredAddress(fullName, phone) {
  const province = pick(provinces);
  const district = pick(districtsByProvince[province.id]);
  const ward = pick(wardsByDistrict[district.id]);
  const houseNo = randInt(1, 480);
  const alley = rng() < 0.35 ? `/${randInt(1, 45)}` : '';
  const street = `${houseNo}${alley} ${pick(STREET_NAMES)}`;

  return {
    fullName,
    phone,
    street,
    provinceId: province.id,
    provinceName: province.name,
    districtId: district.id,
    districtName: district.name,
    wardCode: ward.code,
    wardName: ward.name
  };
}

function normalizeAsciiUpper(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase();
}

// ============================================================================
// Dataset Generation
// ============================================================================
async function generateDataset() {
  const passwordHash = await bcrypt.hash('HaiHand@2026', 10);
  const walletPinHash = await bcrypt.hash('123456', 10);

  const usedPhones = new Set();
  const usedEmails = new Set();

  // --------------------------------------------------------------------------
  // 1. Generate 200 Users (30 Approved B2C Sellers + 170 Buyers)
  // --------------------------------------------------------------------------
  const users = [];
  const sellers = [];
  const buyers = [];

  for (let i = 1; i <= 200; i++) {
    const isSeller = i <= 30;
    const seqStr = String(isSeller ? i : i - 30).padStart(3, '0');
    const fullName = generateVietnameseName();
    const phone = generateUniquePhone(usedPhones);
    const email = isSeller
      ? `b2c.seller.${seqStr}@haihand.vn`
      : `b2c.buyer.${seqStr}@haihand.vn`;
    const username = isSeller ? `b2c_seller_${seqStr}` : `b2c_buyer_${seqStr}`;

    if (usedEmails.has(email)) {
      throw new Error(`Duplicate email generated: ${email}`);
    }
    usedEmails.add(email);

    const primaryAddr = generateStructuredAddress(fullName, phone);
    const formattedAddr = formatAddress(primaryAddr);
    const addresses = [{ ...primaryAddr, isDefault: true }];

    // ~30% of buyers have a second address
    if (!isSeller && rng() < 0.3) {
      addresses.push({ ...generateStructuredAddress(fullName, phone), isDefault: false });
    }

    const createdAt = randomDateBetween('2025-01-10T00:00:00Z', '2025-11-30T23:59:59Z');
    const walletActive = isSeller ? true : rng() < 0.65;
    const bankName = pick(BANKS);

    const userDoc = {
      _id: makeObjectId(TYPE_HEX.USER, i),
      name: fullName,
      username,
      email,
      password: passwordHash,
      phone,
      address: formattedAddr,
      addresses,
      role: 'user',
      status: 'active',
      isSeller,
      sellerStatus: isSeller ? 'approved' : 'none',
      isWalletActive: walletActive,
      walletBalance: walletActive ? roundToThousand(randInt(isSeller ? 1500000 : 500000, isSeller ? 25000000 : 12000000)) : 0,
      pendingBalance: 0,
      walletPin: walletActive ? walletPinHash : undefined,
      walletPhone: walletActive ? phone : undefined,
      walletRegisteredAt: walletActive ? new Date(createdAt.getTime() + 86400000) : undefined,
      bankInfo: {
        name: bankName,
        accountNumber: `${randInt(1000, 9999)}${randInt(10000000, 99999999)}`,
        accountName: normalizeAsciiUpper(fullName)
      },
      createdAt,
      updatedAt: createdAt
    };

    if (isSeller) {
      const shopTpl = SHOP_TEMPLATES[i - 1];
      const appliedAt = new Date(createdAt.getTime() + 86400000 * randInt(1, 5));
      const approvedAt = new Date(appliedAt.getTime() + 86400000 * randInt(1, 3));
      userDoc.sellerAppliedAt = appliedAt;
      userDoc.sellerApprovedAt = approvedAt;
      userDoc.shopInfo = {
        shopName: shopTpl.name,
        description: shopTpl.desc,
        address: formattedAddr,
        avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(shopTpl.name)}`,
        banner: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1200&q=80',
        phone,
        taxCode: `031${String(randInt(1000000, 9999999))}`,
        pickupAddress: primaryAddr
      };
      sellers.push(userDoc);
    } else {
      buyers.push(userDoc);
    }

    users.push(userDoc);
  }

  // --------------------------------------------------------------------------
  // 2. Generate 1,500 Products in `posts` collection (250 per category)
  // --------------------------------------------------------------------------
  const products = [];
  const productsBySeller = new Map();
  sellers.forEach((s) => productsBySeller.set(String(s._id), []));

  const usedProductNames = new Set();
  const editions = ['2026', 'Plus', 'Pro', 'Max', 'Lite', 'Air', 'Ultra', 'Classic', 'Limited', 'Standard'];
  const colors = ['Đen', 'Trắng', 'Xám', 'Xanh Navy', 'Be', 'Nâu', 'Xanh Rêu', 'Bạc', 'Kem', 'Đỏ Đô'];

  for (let i = 1; i <= 1500; i++) {
    const catIdx = (i - 1) % CATEGORIES.length;
    const cat = CATEGORIES[catIdx];

    // Assign seller deterministically & evenly (each of 30 sellers gets 50 products)
    const seller = sellers[(i - 1) % sellers.length];

    // Build a unique, realistic Vietnamese product title
    let title = '';
    for (let attempt = 0; attempt < 50; attempt++) {
      const baseItem = pick(cat.items);
      const brand = pick(cat.brands);
      const qualifier = pick(cat.qualifiers);
      const color = pick(colors);
      const edition = pick(editions);
      const candidate = attempt < 15
        ? `${baseItem} ${brand} ${qualifier} (${color})`
        : `${baseItem} ${brand} ${edition} ${qualifier} - ${color} #${String(i).padStart(4, '0')}`;
      if (!usedProductNames.has(candidate)) {
        title = candidate;
        usedProductNames.add(candidate);
        break;
      }
    }

    const price = roundToThousand(randInt(cat.priceRange[0], cat.priceRange[1]));
    const markupFactor = 1 + (randInt(10, 40) / 100);
    const originalPrice = Math.max(price, roundToThousand(price * markupFactor));
    const stockQuantity = randInt(10, 300); // > 0 so pre('validate') keeps status: 'active'
    const soldCount = randInt(0, 1500);
    const weight = randInt(cat.weightRange[0], cat.weightRange[1]);

    const variantSet = pick(cat.variantSets);
    const variantCount = randInt(2, Math.min(3, variantSet.options.length));
    const variants = [];
    let variantStockSum = 0;
    for (let v = 0; v < variantCount; v++) {
      const optName = variantSet.options[v];
      const vPrice = v === 0 ? price : roundToThousand(price * (1 + v * 0.05));
      const vStock = Math.max(2, Math.floor(stockQuantity / variantCount));
      variantStockSum += vStock;
      variants.push({
        name: optName,
        price: vPrice,
        stock: vStock,
        sku: `SEED-PRD-${String(i).padStart(4, '0')}-V${v + 1}`,
        options: [variantSet.label, optName]
      });
    }

    const finalStock = Math.max(stockQuantity, variantStockSum);
    const createdAt = randomDateBetween('2026-01-05T00:00:00Z', '2026-06-25T23:59:59Z');
    const approvedAt = new Date(createdAt.getTime() + 3600000 * randInt(1, 24));
    const primaryImg = cat.images[i % cat.images.length];
    const secondaryImg = cat.images[(i + 1) % cat.images.length];

    const productDoc = {
      _id: makeObjectId(TYPE_HEX.PRODUCT, i),
      title,
      name: title,
      description: `${title} do ${seller.shopInfo.shopName} phân phối chính hãng trên HaiHand. ` +
        `Thuộc ngành hàng ${cat.name}, sản phẩm mới 100% nguyên hộp, kiểm tra kỹ trước khi giao. ` +
        `Hỗ trợ giao hàng nhanh toàn quốc từ ${seller.shopInfo.pickupAddress.provinceName} và đổi trả minh bạch trong 7 ngày.`,
      price,
      originalPrice,
      category: cat.name,
      images: [primaryImg, secondaryImg],
      author: seller._id,
      sellerId: seller._id,
      location: seller.shopInfo.pickupAddress.provinceName,
      condition: 'Mới 100% (Nguyên hộp)',
      status: 'active',
      moderationStatus: 'approved',
      moderationReason: '',
      approvedAt,
      quantity: finalStock,
      stockQuantity: finalStock,
      soldCount,
      weight,
      variants,
      views: randInt(25, 4500),
      isFeatured: i % 25 === 0,
      createdAt,
      updatedAt: approvedAt
    };

    products.push(productDoc);
    productsBySeller.get(String(seller._id)).push(productDoc);
  }

  // --------------------------------------------------------------------------
  // 3. Generate 300 Orders + 300 PaymentSessions + Matching Transactions
  // --------------------------------------------------------------------------
  // Status distribution across 300 orders:
  // Completed: 150 (50%), Delivered: 45 (15%), Shipped: 45 (15%),
  // Processing: 30 (10%), Pending: 12 (4%), Cancelled: 18 (6%)
  const STATUS_PLAN = [
    ...Array(150).fill('Completed'),
    ...Array(45).fill('Delivered'),
    ...Array(45).fill('Shipped'),
    ...Array(30).fill('Processing'),
    ...Array(12).fill('Pending'),
    ...Array(18).fill('Cancelled')
  ];

  // Deterministic Fisher-Yates shuffle on STATUS_PLAN
  for (let i = STATUS_PLAN.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [STATUS_PLAN[i], STATUS_PLAN[j]] = [STATUS_PLAN[j], STATUS_PLAN[i]];
  }

  const SHIPPING_FEES = [0, 15000, 22000, 30000, 35000];
  const CANCEL_REASONS = [
    'Người mua đổi ý trước khi giao hàng',
    'Cập nhật lại địa chỉ nhận hàng',
    'Muốn thay đổi phân loại sản phẩm',
    'Thời gian giao hàng dự kiến lâu hơn mong muốn'
  ];

  const orders = [];
  const paymentSessions = [];
  const transactions = [];
  const COMMISSION_RATE = 5;
  let txnSeq = 1;

  const activeWalletBuyers = buyers.filter((b) => b.isWalletActive);

  for (let i = 1; i <= 300; i++) {
    const status = STATUS_PLAN[i - 1];
    const paymentMethod = pickWeighted([
      { value: 'COD', weight: 45 },
      { value: 'VNPAY', weight: 30 },
      { value: 'HAIPAY', weight: 25 }
    ]);

    // Ensure HAIPAY buyers actually have an active HaiPay wallet
    const buyer = paymentMethod === 'HAIPAY'
      ? pick(activeWalletBuyers)
      : pick(buyers);

    const seller = pick(sellers);
    const sellerProducts = productsBySeller.get(String(seller._id));

    // Pick 1-4 distinct products from this seller
    const itemCount = randInt(1, 4);
    const pickedProducts = [];
    const pickedIds = new Set();
    while (pickedProducts.length < itemCount && pickedProducts.length < sellerProducts.length) {
      const p = pick(sellerProducts);
      if (!pickedIds.has(String(p._id))) {
        pickedIds.add(String(p._id));
        pickedProducts.push(p);
      }
    }

    const orderItems = [];
    const itemIds = [];
    const purchasedItems = [];
    let itemsSubtotal = 0;
    let latestProductCreatedAt = 0;

    for (const p of pickedProducts) {
      const qty = randInt(1, 3);
      itemsSubtotal += p.price * qty;
      itemIds.push(p._id);
      orderItems.push({
        productId: p._id,
        name: p.title,
        price: p.price,
        quantity: qty,
        weight: p.weight,
        image: p.images[0]
      });
      purchasedItems.push({
        productId: p._id,
        quantity: qty
      });
      if (p.createdAt.getTime() > latestProductCreatedAt) {
        latestProductCreatedAt = p.createdAt.getTime();
      }
    }

    const shippingFee = pick(SHIPPING_FEES);
    const totalPrice = itemsSubtotal + shippingFee;
    const platformFee = Math.round((itemsSubtotal * COMMISSION_RATE) / 100);
    const sellerReceive = itemsSubtotal - platformFee;

    // Order timestamp strictly after buyer.createdAt and all items' createdAt
    const minOrderTime = Math.max(
      new Date('2026-07-01T00:00:00Z').getTime(),
      buyer.createdAt.getTime() + 86400000,
      latestProductCreatedAt + 86400000
    );
    const maxOrderTime = new Date('2026-11-15T23:59:59Z').getTime();
    const orderCreatedAt = new Date(minOrderTime + Math.floor(rng() * Math.max(1, maxOrderTime - minOrderTime)));

    const parentOrderId = `SEED_HH_${String(i).padStart(4, '0')}`;
    const orderId = makeObjectId(TYPE_HEX.ORDER, i);
    const buyerAddr = buyer.addresses[0];
    const shippingAddressSnapshot = {
      fullName: buyerAddr.fullName,
      phone: buyerAddr.phone,
      street: buyerAddr.street,
      provinceId: buyerAddr.provinceId,
      provinceName: buyerAddr.provinceName,
      districtId: buyerAddr.districtId,
      districtName: buyerAddr.districtName,
      wardCode: buyerAddr.wardCode,
      wardName: buyerAddr.wardName
    };
    const formattedShippingAddr = formatAddress(shippingAddressSnapshot);

    const isPrepaid = paymentMethod === 'VNPAY' || paymentMethod === 'HAIPAY';
    const trackingCode = ['Processing', 'Shipped', 'Delivered', 'Completed'].includes(status)
      ? `GHN_SEED_${String(i).padStart(4, '0')}`
      : '';

    let paymentStatus = 'unpaid';
    let settled = false;
    let stockDeducted = true;
    let shippingStatus = 'ready_to_pick';
    let paidAt = isPrepaid ? new Date(orderCreatedAt.getTime() + 60000) : undefined;
    let deliveredAt;
    let completedAt;
    let cancelledAt;
    let cancelReason = '';

    const statusHistory = [
      {
        from: null,
        to: 'Pending',
        actor: 'buyer',
        actorId: buyer._id,
        reason: 'Đặt hàng thành công',
        changedAt: orderCreatedAt
      }
    ];

    const trackingLogs = [
      {
        status: 'ready_to_pick',
        description: 'Đơn hàng đã được tạo và chờ người bán xác nhận.',
        updated_at: orderCreatedAt
      }
    ];

    const tProc = new Date(orderCreatedAt.getTime() + 3600000 * randInt(2, 12));
    const tShip = new Date(tProc.getTime() + 3600000 * randInt(4, 24));
    const tDeliv = new Date(tShip.getTime() + 86400000 * randInt(1, 3));
    const tComp = new Date(tDeliv.getTime() + 86400000 * randInt(1, 2));

    if (status === 'Pending') {
      paymentStatus = isPrepaid ? 'escrow' : 'unpaid';
      shippingStatus = 'ready_to_pick';
    } else if (status === 'Processing') {
      paymentStatus = isPrepaid ? 'escrow' : 'unpaid';
      shippingStatus = 'picking';
      statusHistory.push({
        from: 'Pending',
        to: 'Processing',
        actor: 'seller',
        actorId: seller._id,
        reason: 'Người bán xác nhận và đang chuẩn bị hàng',
        changedAt: tProc
      });
      trackingLogs.push({
        status: 'picking',
        description: `Đơn vị vận chuyển đang lấy hàng (Mã vận đơn ${trackingCode}).`,
        updated_at: tProc
      });
    } else if (status === 'Shipped') {
      paymentStatus = isPrepaid ? 'escrow' : 'unpaid';
      shippingStatus = 'delivering';
      statusHistory.push(
        { from: 'Pending', to: 'Processing', actor: 'seller', actorId: seller._id, reason: 'Xác nhận đơn hàng', changedAt: tProc },
        { from: 'Processing', to: 'Shipped', actor: 'seller', actorId: seller._id, reason: 'Đã bàn giao cho đơn vị vận chuyển', changedAt: tShip }
      );
      trackingLogs.push(
        { status: 'picking', description: 'Đang lấy hàng tại kho người bán.', updated_at: tProc },
        { status: 'delivering', description: `Đang giao hàng tới ${shippingAddressSnapshot.districtName}, ${shippingAddressSnapshot.provinceName}.`, updated_at: tShip }
      );
    } else if (status === 'Delivered') {
      paymentStatus = 'escrow';
      shippingStatus = 'delivered';
      deliveredAt = tDeliv;
      if (!paidAt) paidAt = tDeliv;
      statusHistory.push(
        { from: 'Pending', to: 'Processing', actor: 'seller', actorId: seller._id, reason: 'Xác nhận đơn hàng', changedAt: tProc },
        { from: 'Processing', to: 'Shipped', actor: 'seller', actorId: seller._id, reason: 'Đã bàn giao vận chuyển', changedAt: tShip },
        { from: 'Shipped', to: 'Delivered', actor: 'system', reason: 'Giao hàng thành công', changedAt: tDeliv }
      );
      trackingLogs.push(
        { status: 'picking', description: 'Đã lấy hàng thành công.', updated_at: tProc },
        { status: 'delivering', description: 'Bưu tá đang giao hàng.', updated_at: tShip },
        { status: 'delivered', description: 'Người nhận đã nhận hàng thành công.', updated_at: tDeliv }
      );
    } else if (status === 'Completed') {
      paymentStatus = 'released';
      settled = true;
      shippingStatus = 'delivered';
      deliveredAt = tDeliv;
      completedAt = tComp;
      if (!paidAt) paidAt = tDeliv;
      statusHistory.push(
        { from: 'Pending', to: 'Processing', actor: 'seller', actorId: seller._id, reason: 'Xác nhận đơn hàng', changedAt: tProc },
        { from: 'Processing', to: 'Shipped', actor: 'seller', actorId: seller._id, reason: 'Đã bàn giao vận chuyển', changedAt: tShip },
        { from: 'Shipped', to: 'Delivered', actor: 'system', reason: 'Giao hàng thành công', changedAt: tDeliv },
        { from: 'Delivered', to: 'Completed', actor: 'buyer', actorId: buyer._id, reason: 'Người mua xác nhận hài lòng và giải ngân', changedAt: tComp }
      );
      trackingLogs.push(
        { status: 'picking', description: 'Đã lấy hàng thành công.', updated_at: tProc },
        { status: 'delivering', description: 'Bưu tá đang giao hàng.', updated_at: tShip },
        { status: 'delivered', description: 'Giao hàng thành công — đơn hàng đã hoàn tất.', updated_at: tDeliv }
      );
    } else if (status === 'Cancelled') {
      paymentStatus = isPrepaid ? 'refunded' : 'unpaid';
      settled = false;
      stockDeducted = false;
      shippingStatus = 'cancel';
      cancelledAt = new Date(orderCreatedAt.getTime() + 3600000 * randInt(1, 6));
      cancelReason = pick(CANCEL_REASONS);
      statusHistory.push({
        from: 'Pending',
        to: 'Cancelled',
        actor: 'buyer',
        actorId: buyer._id,
        reason: cancelReason,
        changedAt: cancelledAt
      });
      trackingLogs.push({
        status: 'cancel',
        description: `Đơn hàng đã bị hủy: ${cancelReason}`,
        updated_at: cancelledAt
      });
    }

    const expectedDeliveryTime = new Date(orderCreatedAt.getTime() + 86400000 * 3);
    const updatedAt = completedAt || deliveredAt || cancelledAt || (status === 'Shipped' ? tShip : status === 'Processing' ? tProc : orderCreatedAt);

    const orderDoc = {
      _id: orderId,
      buyerId: buyer._id,
      buyer: buyer._id,
      sellerId: seller._id,
      seller: seller._id,
      parentOrderId,
      items: itemIds,
      orderItems,
      itemsSubtotal,
      shippingFee,
      totalPrice,
      commissionRate: COMMISSION_RATE,
      sellerReceive,
      phone: shippingAddressSnapshot.phone,
      address: formattedShippingAddr,
      shippingAddress: shippingAddressSnapshot,
      shippingService: {
        provider: 'mock',
        serviceId: 53320,
        serviceTypeId: 2,
        expectedDeliveryTime
      },
      paymentMethod,
      paymentStatus,
      paidAt,
      status,
      shipment: trackingCode ? {
        provider: 'mock',
        trackingCode,
        fee: shippingFee,
        expectedDeliveryTime,
        createdAt: tProc
      } : undefined,
      trackingCode,
      shippingCode: trackingCode,
      shippingCarrier: 'HaiHand Express',
      shippingStatus,
      trackingLogs,
      deliveredAt,
      completedAt,
      cancelledAt,
      cancelReason,
      isReviewed: status === 'Completed' && rng() < 0.45,
      stockDeducted,
      settled,
      dispute: {
        isDisputed: false,
        reason: '',
        status: 'none'
      },
      statusHistory,
      createdAt: orderCreatedAt,
      updatedAt
    };

    orders.push(orderDoc);

    // Matching PaymentSession
    let sessionStatus = 'pending';
    if (isPrepaid || status === 'Delivered' || status === 'Completed') {
      sessionStatus = 'paid';
    } else if (status === 'Cancelled') {
      sessionStatus = 'failed';
    }

    paymentSessions.push({
      _id: makeObjectId(TYPE_HEX.SESSION, i),
      parentOrderId,
      buyer: buyer._id,
      orderIds: [orderId],
      purchasedItems,
      itemsSubtotal,
      shippingTotal: shippingFee,
      amount: totalPrice,
      method: paymentMethod,
      status: sessionStatus,
      paidAt: sessionStatus === 'paid' ? (paidAt || orderCreatedAt) : undefined,
      gatewayPayload: isPrepaid ? { provider: paymentMethod, responseCode: '00', seeded: true } : undefined,
      createdAt: orderCreatedAt,
      updatedAt
    });

    // Matching Transactions
    // 1. Prepaid buyer payment
    if (isPrepaid) {
      transactions.push({
        _id: makeObjectId(TYPE_HEX.TXN, txnSeq++),
        user: buyer._id,
        type: 'Thanh toán đơn hàng',
        amount: -totalPrice,
        status: 'Thành công',
        txnRef: `SEED_TXN_PAY_${String(i).padStart(4, '0')}`,
        description: `Thanh toán đơn hàng ${parentOrderId} qua ${paymentMethod}`,
        createdAt: paidAt || orderCreatedAt,
        updatedAt: paidAt || orderCreatedAt
      });
    }

    // 2. Seller payout on Completed (settled) orders
    if (status === 'Completed' && settled) {
      transactions.push({
        _id: makeObjectId(TYPE_HEX.TXN, txnSeq++),
        user: seller._id,
        type: 'Giải ngân',
        amount: sellerReceive,
        status: 'Thành công',
        txnRef: `SEED_TXN_REL_${String(i).padStart(4, '0')}`,
        description: `Giải ngân đơn hàng ${parentOrderId} (phí sàn ${COMMISSION_RATE}%)`,
        createdAt: completedAt,
        updatedAt: completedAt
      });
    }

    // 3. Buyer refund on Cancelled prepaid orders
    if (status === 'Cancelled' && isPrepaid) {
      transactions.push({
        _id: makeObjectId(TYPE_HEX.TXN, txnSeq++),
        user: buyer._id,
        type: 'Hoàn tiền',
        amount: totalPrice,
        status: 'Thành công',
        txnRef: `SEED_TXN_REF_${String(i).padStart(4, '0')}`,
        description: `Hoàn tiền đơn hàng bị hủy ${parentOrderId}`,
        createdAt: cancelledAt,
        updatedAt: cancelledAt
      });
    }
  }

  return { users, sellers, buyers, products, orders, paymentSessions, transactions };
}

// ============================================================================
// Validation & Referential Integrity Checks
// ============================================================================
async function validateDataset(dataset) {
  const { users, sellers, buyers, products, orders, paymentSessions, transactions } = dataset;
  const errors = [];

  // 1. Exact count assertions
  if (users.length !== 200) errors.push(`Expected 200 users, got ${users.length}`);
  if (sellers.length !== 30) errors.push(`Expected 30 sellers, got ${sellers.length}`);
  if (buyers.length !== 170) errors.push(`Expected 170 buyers, got ${buyers.length}`);
  if (products.length !== 1500) errors.push(`Expected 1500 products, got ${products.length}`);
  if (orders.length !== 300) errors.push(`Expected 300 orders, got ${orders.length}`);
  if (paymentSessions.length !== 300) errors.push(`Expected 300 paymentSessions, got ${paymentSessions.length}`);

  // 2. Uniqueness & Foreign-Key Lookup Maps
  const sellerMap = new Map();
  const buyerMap = new Map();
  const productMap = new Map();
  const emailSet = new Set();
  const phoneSet = new Set();
  const productTitleSet = new Set();

  for (const u of users) {
    if (emailSet.has(u.email)) errors.push(`Duplicate email: ${u.email}`);
    emailSet.add(u.email);
    if (phoneSet.has(u.phone)) errors.push(`Duplicate phone: ${u.phone}`);
    phoneSet.add(u.phone);

    if (u.isSeller) {
      sellerMap.set(String(u._id), u);
      if (!u.shopInfo || !isCompleteAddress(u.shopInfo.pickupAddress)) {
        errors.push(`Seller ${u.email} missing valid pickupAddress`);
      }
    } else {
      buyerMap.set(String(u._id), u);
      if (!u.addresses.length || !isCompleteAddress(u.addresses[0])) {
        errors.push(`Buyer ${u.email} missing valid default address`);
      }
    }
  }

  for (const p of products) {
    if (!sellerMap.has(String(p.sellerId)) || String(p.author) !== String(p.sellerId)) {
      errors.push(`Product ${p._id} has invalid sellerId/author`);
    }
    if (productTitleSet.has(p.title)) {
      errors.push(`Duplicate product title: ${p.title}`);
    }
    productTitleSet.add(p.title);
    if (p.originalPrice < p.price) {
      errors.push(`Product ${p._id} originalPrice < price`);
    }
    if (p.status !== 'active' || p.moderationStatus !== 'approved') {
      errors.push(`Product ${p._id} status/moderationStatus mismatch`);
    }
    productMap.set(String(p._id), p);
  }

  for (const o of orders) {
    const buyer = buyerMap.get(String(o.buyerId));
    const seller = sellerMap.get(String(o.sellerId));
    if (!buyer) errors.push(`Order ${o.parentOrderId} references non-existent buyer`);
    if (!seller) errors.push(`Order ${o.parentOrderId} references non-existent seller`);
    if (String(o.buyerId) === String(o.sellerId)) {
      errors.push(`Order ${o.parentOrderId} has buyerId === sellerId`);
    }

    let calcSubtotal = 0;
    for (const item of o.orderItems) {
      const prod = productMap.get(String(item.productId));
      if (!prod) {
        errors.push(`Order ${o.parentOrderId} references non-existent product ${item.productId}`);
        continue;
      }
      if (String(prod.sellerId) !== String(o.sellerId)) {
        errors.push(`Order ${o.parentOrderId} item ${item.productId} belongs to another seller`);
      }
      if (o.createdAt.getTime() < prod.createdAt.getTime()) {
        errors.push(`Order ${o.parentOrderId} createdAt precedes product ${prod._id} createdAt`);
      }
      calcSubtotal += item.price * item.quantity;
    }

    if (buyer && o.createdAt.getTime() < buyer.createdAt.getTime()) {
      errors.push(`Order ${o.parentOrderId} createdAt precedes buyer createdAt`);
    }
    if (calcSubtotal !== o.itemsSubtotal) {
      errors.push(`Order ${o.parentOrderId} itemsSubtotal mismatch: ${calcSubtotal} !== ${o.itemsSubtotal}`);
    }
    if (o.itemsSubtotal + o.shippingFee !== o.totalPrice) {
      errors.push(`Order ${o.parentOrderId} totalPrice mismatch`);
    }
    const expectedSellerReceive = o.itemsSubtotal - Math.round((o.itemsSubtotal * o.commissionRate) / 100);
    if (o.sellerReceive !== expectedSellerReceive) {
      errors.push(`Order ${o.parentOrderId} sellerReceive mismatch: ${o.sellerReceive} !== ${expectedSellerReceive}`);
    }
  }

  // 3. Full Mongoose schema validation on EVERY document
  const validateBatch = async (Model, docs, label) => {
    for (let idx = 0; idx < docs.length; idx++) {
      const instance = new Model(docs[idx]);
      try {
        await instance.validate();
      } catch (err) {
        errors.push(`${label}[${idx}] Mongoose validation failed: ${err.message}`);
        if (errors.length >= 25) return;
      }
    }
  };

  await validateBatch(User, users, 'User');
  await validateBatch(Product, products, 'Product');
  await validateBatch(Order, orders, 'Order');
  await validateBatch(PaymentSession, paymentSessions, 'PaymentSession');
  await validateBatch(Transaction, transactions, 'Transaction');

  return errors;
}

// ============================================================================
// Stats & Reporting
// ============================================================================
function printStats(dataset) {
  const { users, sellers, buyers, products, orders, paymentSessions, transactions } = dataset;

  const categoryCounts = {};
  for (const p of products) {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  }

  const statusCounts = {};
  const paymentMethodCounts = {};
  let totalGMV = 0;
  let totalItemsSubtotal = 0;
  let totalShipping = 0;
  let totalSellerReceive = 0;

  for (const o of orders) {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    paymentMethodCounts[o.paymentMethod] = (paymentMethodCounts[o.paymentMethod] || 0) + 1;
    totalGMV += o.totalPrice;
    totalItemsSubtotal += o.itemsSubtotal;
    totalShipping += o.shippingFee;
    totalSellerReceive += o.sellerReceive;
  }

  const txnTypeCounts = {};
  for (const t of transactions) {
    txnTypeCounts[t.type] = (txnTypeCounts[t.type] || 0) + 1;
  }

  console.log('\n================ B2C DATASET SUMMARY ================');
  console.log(`Users:           ${users.length} (${sellers.length} approved sellers, ${buyers.length} buyers)`);
  console.log(`Products:        ${products.length} (all status='active', moderationStatus='approved')`);
  console.log('  By Category:  ', JSON.stringify(categoryCounts));
  console.log(`Orders:          ${orders.length}`);
  console.log('  By Status:    ', JSON.stringify(statusCounts));
  console.log('  By Payment:   ', JSON.stringify(paymentMethodCounts));
  console.log(`  Items Subtotal:${totalItemsSubtotal.toLocaleString('vi-VN')} VND`);
  console.log(`  Shipping Fees: ${totalShipping.toLocaleString('vi-VN')} VND`);
  console.log(`  Total GMV:     ${totalGMV.toLocaleString('vi-VN')} VND`);
  console.log(`  Seller Payouts:${totalSellerReceive.toLocaleString('vi-VN')} VND`);
  console.log(`PaymentSessions: ${paymentSessions.length}`);
  console.log(`Transactions:    ${transactions.length}`, JSON.stringify(txnTypeCounts));
  console.log('=====================================================\n');
}

// ============================================================================
// Idempotent MongoDB Persistence
// ============================================================================
async function bulkUpsertById(Model, docs, batchSize = 250) {
  let inserted = 0;
  let modified = 0;
  let matched = 0;

  for (let i = 0; i < docs.length; i += batchSize) {
    const slice = docs.slice(i, i + batchSize);
    const ops = slice.map((doc) => ({
      replaceOne: {
        filter: { _id: doc._id },
        replacement: doc,
        upsert: true
      }
    }));
    const res = await Model.bulkWrite(ops, { ordered: false });
    inserted += res.upsertedCount || 0;
    modified += res.modifiedCount || 0;
    matched += res.matchedCount || 0;
  }

  return { total: docs.length, inserted, modified, matched };
}

async function applyToDatabase(dataset) {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('Missing MONGO_URI in backend/.env');
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  try {
    // Ensure the 6 B2C categories exist without duplicating existing ones
    let categoriesInserted = 0;
    for (const cat of CATEGORIES) {
      const existing = await Category.findOne({ name: cat.name }).lean();
      if (!existing) {
        await Category.create({
          name: cat.name,
          image: cat.image,
          description: cat.description
        });
        categoriesInserted++;
      }
    }

    const userStats = await bulkUpsertById(User, dataset.users);
    const productStats = await bulkUpsertById(Product, dataset.products);
    const orderStats = await bulkUpsertById(Order, dataset.orders);
    const sessionStats = await bulkUpsertById(PaymentSession, dataset.paymentSessions);

    // Clean stale seeded transactions (if any) before upserting current deterministic set
    const currentTxnIds = dataset.transactions.map((t) => t._id);
    await Transaction.deleteMany({
      txnRef: /^SEED_TXN_/,
      _id: { $nin: currentTxnIds }
    });
    const txnStats = await bulkUpsertById(Transaction, dataset.transactions);

    console.log('\n================ MONGODB APPLY REPORT ================');
    console.log(`Categories:      ${categoriesInserted} newly inserted (6 B2C categories ensured)`);
    console.log(`Users:           upserted=${userStats.inserted}, updated=${userStats.modified}, matched=${userStats.matched} (total=${userStats.total})`);
    console.log(`Products (posts):upserted=${productStats.inserted}, updated=${productStats.modified}, matched=${productStats.matched} (total=${productStats.total})`);
    console.log(`Orders:          upserted=${orderStats.inserted}, updated=${orderStats.modified}, matched=${orderStats.matched} (total=${orderStats.total})`);
    console.log(`PaymentSessions: upserted=${sessionStats.inserted}, updated=${sessionStats.modified}, matched=${sessionStats.matched} (total=${sessionStats.total})`);
    console.log(`Transactions:    upserted=${txnStats.inserted}, updated=${txnStats.modified}, matched=${txnStats.matched} (total=${txnStats.total})`);
    console.log('======================================================\n');
  } finally {
    await mongoose.disconnect();
  }
}

// ============================================================================
// Main CLI Entrypoint
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const isDryRun = args.includes('--dry-run') || !isApply;

  if (isApply && args.includes('--dry-run')) {
    console.error('Error: Cannot specify both --dry-run and --apply at the same time.');
    process.exit(1);
  }

  console.log(`Mode: ${isApply ? 'APPLY (writing to MongoDB)' : 'DRY-RUN (in-memory validation only)'}`);

  const startedAt = Date.now();
  const dataset = await generateDataset();
  const validationErrors = await validateDataset(dataset);

  if (validationErrors.length > 0) {
    console.error(`\n❌ Validation failed with ${validationErrors.length} error(s):`);
    validationErrors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log(`✅ All schema validations, foreign keys, timestamps, and financial totals passed (0 errors) in ${Date.now() - startedAt}ms.`);
  printStats(dataset);

  if (isDryRun) {
    console.log('Sample Seller:', JSON.stringify({
      _id: dataset.sellers[0]._id,
      name: dataset.sellers[0].name,
      email: dataset.sellers[0].email,
      shopName: dataset.sellers[0].shopInfo.shopName,
      pickupProvince: dataset.sellers[0].shopInfo.pickupAddress.provinceName
    }));
    console.log('Sample Product:', JSON.stringify({
      _id: dataset.products[0]._id,
      title: dataset.products[0].title,
      category: dataset.products[0].category,
      price: dataset.products[0].price,
      originalPrice: dataset.products[0].originalPrice,
      stockQuantity: dataset.products[0].stockQuantity,
      variantsCount: dataset.products[0].variants.length,
      status: dataset.products[0].status,
      moderationStatus: dataset.products[0].moderationStatus
    }));
    console.log('Sample Order:', JSON.stringify({
      _id: dataset.orders[0]._id,
      parentOrderId: dataset.orders[0].parentOrderId,
      status: dataset.orders[0].status,
      paymentMethod: dataset.orders[0].paymentMethod,
      paymentStatus: dataset.orders[0].paymentStatus,
      itemsSubtotal: dataset.orders[0].itemsSubtotal,
      shippingFee: dataset.orders[0].shippingFee,
      totalPrice: dataset.orders[0].totalPrice,
      commissionRate: dataset.orders[0].commissionRate,
      sellerReceive: dataset.orders[0].sellerReceive
    }));
    console.log('\nDry-run completed. No database writes were performed.');
    return;
  }

  await applyToDatabase(dataset);
  console.log('✅ Seeding completed successfully.');
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
