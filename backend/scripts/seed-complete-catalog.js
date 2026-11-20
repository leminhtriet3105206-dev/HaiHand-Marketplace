/**
 * Seed Complete Catalog & Fix Categories
 * HaiHand Marketplace
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Post } = require('../models/Product');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('❌ Thiếu biến môi trường MONGO_URI!');
  process.exit(1);
}

const Category = mongoose.models.Category || mongoose.model('Category', new mongoose.Schema({
  name: { type: String, required: true },
  image: { type: String, required: true },
  description: { type: String, default: '' }
}));

const STANDARD_CATEGORIES = [
  {
    name: 'Thú cưng & Đồ dùng',
    image: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=300&auto=format&fit=crop',
    description: 'Chó, mèo, rùa cảnh, thức ăn hạt, pate, phụ kiện chăm sóc thú cưng'
  },
  {
    name: 'Điện thoại & Phụ kiện',
    image: 'https://images.unsplash.com/photo-1512054502232-10a0a035d672?w=300&auto=format&fit=crop',
    description: 'Smartphone, máy tính bảng, ốp lưng, tai nghe, củ sạc cáp'
  },
  {
    name: 'Điện tử & Công nghệ',
    image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=300&auto=format&fit=crop',
    description: 'Laptop, máy tính bàn, máy ảnh, loa bluetooth, màn hình'
  },
  {
    name: 'Xe cộ & Phụ tùng',
    image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=300&auto=format&fit=crop',
    description: 'Xe đạp địa hình, xe đạp điện, xe máy, phụ tùng và đồ bảo hộ'
  },
  {
    name: 'Thời trang & Phụ kiện',
    image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=300&auto=format&fit=crop',
    description: 'Quần áo nam nữ, giày dép sneaker, túi xách, đồng hồ'
  },
  {
    name: 'Đồ gia dụng & Nội thất',
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=300&auto=format&fit=crop',
    description: 'Tủ quần áo, bàn làm việc, thiết bị nhà bếp, đồ sinh hoạt'
  },
  {
    name: 'Đồ chơi, Mẹ & Bé',
    image: 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=300&auto=format&fit=crop',
    description: 'Labubu, đồ chơi mô hình, thú bông, xe đẩy em bé'
  },
  {
    name: 'Thể thao & Dã ngoại',
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=300&auto=format&fit=crop',
    description: 'Dụng cụ tập gym, đồ cắm trại leo núi, nhạc cụ, sách vở'
  }
];

const SAMPLE_PRODUCTS = [
  // ── THỂ THAO & DÃ NGOẠI (10 sản phẩm) ──
  {
    title: 'Vợt cầu lông Yonex Astrox 88D Pro chính hãng đan sẵn cước BG65',
    name: 'Vợt cầu lông Yonex Astrox 88D Pro',
    category: 'Thể thao & Dã ngoại',
    price: 1850000,
    originalPrice: 2450000,
    location: 'Hà Nội',
    condition: 'Mới 99%',
    stockQuantity: 5,
    soldCount: 34,
    images: ['https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=600&auto=format&fit=crop'],
    description: 'Vợt thân cứng đầm đầu, trợ lực đập cầu uy lực. Nước sơn không vết xước, tặng kèm bao vợt nhung.'
  },
  {
    title: 'Xe đạp địa hình thể thao Twitter Mantis khung nhôm phanh đĩa dầu',
    name: 'Xe đạp địa hình thể thao Twitter Mantis',
    category: 'Thể thao & Dã ngoại',
    price: 3600000,
    originalPrice: 5200000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Đã sử dụng (Tốt)',
    stockQuantity: 3,
    soldCount: 18,
    images: ['https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=600&auto=format&fit=crop'],
    description: 'Xe đạp địa hình 24 tốc độ Shimano, thụt dầu êm ái, lốp gai bám đường chống trơn trượt.'
  },
  {
    title: 'Giày chạy bộ Nike Air Zoom Pegasus 40 êm ái size 42 full box',
    name: 'Giày chạy bộ Nike Air Zoom Pegasus 40',
    category: 'Thể thao & Dã ngoại',
    price: 1450000,
    originalPrice: 2100000,
    location: 'Hà Nội',
    condition: 'Mới 99%',
    stockQuantity: 8,
    soldCount: 45,
    images: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop'],
    description: 'Giày chạy chính hãng Nike Pegasus 40, đệm khí Zoom kép phản hồi lực tốt, đi êm ái không mỏi chân.'
  },
  {
    title: 'Lều cắm trại dã ngoại tự bung 4-6 người chống mưa chống tia UV',
    name: 'Lều cắm trại dã ngoại tự bung 4-6 người',
    category: 'Thể thao & Dã ngoại',
    price: 680000,
    originalPrice: 950000,
    location: 'Đà Nẵng',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 12,
    soldCount: 52,
    images: ['https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&auto=format&fit=crop'],
    description: 'Lều mở tự động trong 3 giây, vải Oxford 210D chống nước 3000mm, lưới chống côn trùng thông thoáng.'
  },
  {
    title: 'Bộ tạ tay đa năng điều chỉnh Bowflex 24kg tập thể hình tại nhà',
    name: 'Bộ tạ tay đa năng điều chỉnh Bowflex 24kg',
    category: 'Thể thao & Dã ngoại',
    price: 1950000,
    originalPrice: 2800000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới',
    stockQuantity: 6,
    soldCount: 27,
    images: ['https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=600&auto=format&fit=crop'],
    description: 'Tạ xoay chỉnh từ 2.5kg đến 24kg tiện lợi, tiết kiệm không gian phòng tập gia đình.'
  },
  {
    title: 'Thảm tập Yoga định tuyến TPE chống trượt 8mm cao cấp kèm túi đựng',
    name: 'Thảm tập Yoga định tuyến TPE 8mm',
    category: 'Thể thao & Dã ngoại',
    price: 190000,
    originalPrice: 280000,
    location: 'Hà Nội',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 25,
    soldCount: 76,
    images: ['https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=600&auto=format&fit=crop'],
    description: 'Thảm dày 8mm bảo vệ khớp gối, có vạch định tuyến chuẩn tư thế, không bám mùi mồ hôi.'
  },
  {
    title: 'Đèn pin dã ngoại siêu sáng chiếu xa 500m chống nước IPX6 pin trâu',
    name: 'Đèn pin dã ngoại siêu sáng 500m',
    category: 'Thể thao & Dã ngoại',
    price: 240000,
    originalPrice: 350000,
    location: 'Đà Nẵng',
    condition: 'Mới',
    stockQuantity: 15,
    soldCount: 63,
    images: ['https://images.unsplash.com/photo-1510519138101-570d1dca3d66?w=600&auto=format&fit=crop'],
    description: 'Chip LED công suất cao, tích hợp cổng sạc USB-C và làm pin sạc dự phòng điện thoại khi khẩn cấp.'
  },
  {
    title: 'Bàn bóng bàn gấp gọn thi đấu Double Fish chuẩn ITTF kèm cọc lưới',
    name: 'Bàn bóng bàn thi đấu Double Fish',
    category: 'Thể thao & Dã ngoại',
    price: 4200000,
    originalPrice: 6500000,
    location: 'Hà Nội',
    condition: 'Đã sử dụng (Tốt)',
    stockQuantity: 2,
    soldCount: 8,
    images: ['https://images.unsplash.com/photo-1534158914592-062992fbe900?w=600&auto=format&fit=crop'],
    description: 'Mặt bàn gỗ MDF phủ sơn chống lóa nảy bóng cực chuẩn, chân bánh xe di chuyển xếp gọn nhẹ nhàng.'
  },
  {
    title: 'Bộ cần câu máy rút Shimano Cacbon 2m7 kèm máy câu kim loại và cước',
    name: 'Bộ cần câu máy rút Shimano Cacbon',
    category: 'Thể thao & Dã ngoại',
    price: 450000,
    originalPrice: 620000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 10,
    soldCount: 41,
    images: ['https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=600&auto=format&fit=crop'],
    description: 'Cần đọt đặc chịu tải kéo cá đến 8kg, máy câu êm mượt tặng kèm hộp lưỡi và mồi câu giả.'
  },
  {
    title: 'Bình nước thể thao giữ nhiệt Lock&Lock 1000ml Inox 316 có quai xách',
    name: 'Bình nước thể thao giữ nhiệt Lock&Lock',
    category: 'Thể thao & Dã ngoại',
    price: 290000,
    originalPrice: 420000,
    location: 'Hà Nội',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 20,
    soldCount: 89,
    images: ['https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&auto=format&fit=crop'],
    description: 'Giữ nóng lạnh 24 giờ, inox 316 y tế an toàn không gỉ, nắp bật tiện lợi khi tập luyện.'
  },

  // ── ĐỒ CHƠI, MẸ & BÉ (9 sản phẩm) ──
  {
    title: 'Labubu The Monsters Fall in Wild bản chính hãng Pop Mart nguyên seal',
    name: 'Labubu The Monsters Fall in Wild',
    category: 'Đồ chơi, Mẹ & Bé',
    price: 1350000,
    originalPrice: 1800000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 8,
    soldCount: 95,
    images: ['https://images.unsplash.com/photo-1558060370-d644479cb6f7?w=600&auto=format&fit=crop'],
    description: 'Labubu phiên bản cắm trại cực hot, cam kết chuẩn chính hãng Pop Mart quét mã QR kiểm tra.'
  },
  {
    title: 'Xe đẩy cho bé gấp gọn hai chiều du lịch Baobaohao V8 siêu nhẹ',
    name: 'Xe đẩy gấp gọn cho bé Baobaohao V8',
    category: 'Đồ chơi, Mẹ & Bé',
    price: 890000,
    originalPrice: 1250000,
    location: 'Hà Nội',
    condition: 'Mới 99%',
    stockQuantity: 5,
    soldCount: 32,
    images: ['https://images.unsplash.com/photo-1591088398332-8a7791972843?w=600&auto=format&fit=crop'],
    description: 'Ghế xoay 360 độ 2 chiều tiện quan sát bé, đai an toàn 5 điểm, gập gọn để vừa cốp ô tô và xách tay máy bay.'
  },
  {
    title: 'Bộ xếp hình Lego City Cảnh sát & Trực thăng đuổi bắt nguyên hộp',
    name: 'Bộ xếp hình Lego City Cảnh sát',
    category: 'Đồ chơi, Mẹ & Bé',
    price: 520000,
    originalPrice: 750000,
    location: 'Đà Nẵng',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 12,
    soldCount: 58,
    images: ['https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=600&auto=format&fit=crop'],
    description: 'Bộ lắp ráp 350 chi tiết giúp rèn luyện tư duy không gian và tính kiên nhẫn cho bé từ 5 tuổi.'
  },
  {
    title: 'Gấu bông Capybara ôm gà chảy nước mũi siêu mềm mịn cao 50cm',
    name: 'Gấu bông Capybara ôm gà 50cm',
    category: 'Đồ chơi, Mẹ & Bé',
    price: 155000,
    originalPrice: 220000,
    location: 'Hà Nội',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 30,
    soldCount: 140,
    images: ['https://images.unsplash.com/photo-1559454403-b8fb88521f11?w=600&auto=format&fit=crop'],
    description: 'Lông nhung co giãn 4 chiều mềm mịn không rụng lông, bông gòn PP 3D êm ái cho bé ôm ngủ.'
  },
  {
    title: 'Ghế ăn dặm cho bé điều chỉnh độ cao Chilux Grow S đệm da cao cấp',
    name: 'Ghế ăn dặm cho bé Chilux Grow S',
    category: 'Đồ chơi, Mẹ & Bé',
    price: 1100000,
    originalPrice: 1650000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 99%',
    stockQuantity: 4,
    soldCount: 22,
    images: ['https://images.unsplash.com/photo-1544126592-807ade215a0b?w=600&auto=format&fit=crop'],
    description: 'Khung thép chịu lực 50kg, ngả lưng 3 nấc nằm - ngả - ngồi, khay ăn đôi tháo rời dễ vệ sinh.'
  },
  {
    title: 'Máy hút sữa điện đôi không dây rảnh tay Fatzbaby Resonance 3',
    name: 'Máy hút sữa điện đôi Fatzbaby Resonance 3',
    category: 'Đồ chơi, Mẹ & Bé',
    price: 980000,
    originalPrice: 1450000,
    location: 'Hà Nội',
    condition: 'Mới 99%',
    stockQuantity: 6,
    soldCount: 39,
    images: ['https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=600&auto=format&fit=crop'],
    description: 'Máy hút sữa không dây ôm trọn bầu ngực, mẹ mặc trong áo ngực vừa hút vừa làm việc nhà thoải mái.'
  },
  {
    title: 'Quây cũi kiêm nhà bóng cho bé kèm 100 bóng nhựa cao cấp an toàn',
    name: 'Quây cũi kiêm nhà bóng cho bé',
    category: 'Đồ chơi, Mẹ & Bé',
    price: 490000,
    originalPrice: 690000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới',
    stockQuantity: 10,
    soldCount: 47,
    images: ['https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=600&auto=format&fit=crop'],
    description: 'Khung inox bọc vải lưới thông thoáng giúp mẹ yên tâm để bé tự lập vui chơi an toàn trong phòng.'
  },
  {
    title: 'Xe chòi chân 4 bánh tự cân bằng có đèn nhạc vui nhộn cho bé 1-3 tuổi',
    name: 'Xe chòi chân 4 bánh tự cân bằng',
    category: 'Đồ chơi, Mẹ & Bé',
    price: 260000,
    originalPrice: 380000,
    location: 'Đà Nẵng',
    condition: 'Mới',
    stockQuantity: 15,
    soldCount: 65,
    images: ['https://images.unsplash.com/photo-1517849845537-4d257902454a?w=600&auto=format&fit=crop'],
    description: 'Khung nhựa ABS dày dặn bo tròn góc cạnh, bánh xe cao su chống trượt chạy êm không xước sàn gỗ.'
  },
  {
    title: 'Bộ 10 cuốn truyện tranh thiếu nhi cổ tích song ngữ Việt Anh phát triển IQ',
    name: 'Bộ 10 cuốn truyện tranh song ngữ Việt Anh',
    category: 'Đồ chơi, Mẹ & Bé',
    price: 120000,
    originalPrice: 180000,
    location: 'Hà Nội',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 40,
    soldCount: 110,
    images: ['https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&auto=format&fit=crop'],
    description: 'Hình minh họa sống động sắc nét, giấy bóng chống lóa mắt, nuôi dưỡng tình yêu đọc sách từ nhỏ.'
  },

  // ── ĐIỆN THOẠI & PHỤ KIỆN (8 sản phẩm) ──
  {
    title: 'iPhone 13 Pro Max 128GB Quốc Tế Xanh Sierra pin 90% zin ốc nguyên bản',
    name: 'iPhone 13 Pro Max 128GB Xanh Sierra',
    category: 'Điện thoại & Phụ kiện',
    price: 13800000,
    originalPrice: 16500000,
    location: 'Hà Nội',
    condition: 'Mới 99%',
    stockQuantity: 3,
    soldCount: 28,
    images: ['https://images.unsplash.com/photo-1591337676887-a217a6970a8a?w=600&auto=format&fit=crop'],
    description: 'Máy đẹp keng không tì vết, màn hình 120Hz mượt mà, camera nét căng 3x zoom, bao test 15 ngày.'
  },
  {
    title: 'Samsung Galaxy S23 Ultra 256GB Đen Phantom chính hãng SSVN fullbox',
    name: 'Samsung Galaxy S23 Ultra 256GB',
    category: 'Điện thoại & Phụ kiện',
    price: 15900000,
    originalPrice: 19500000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 99%',
    stockQuantity: 2,
    soldCount: 19,
    images: ['https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=600&auto=format&fit=crop'],
    description: 'Bút S-Pen tiện dụng, camera mắt thần bóng đêm 200MP zoom 100x cực đỉnh, bảo hành dài hạn.'
  },
  {
    title: 'Tai nghe Bluetooth Apple AirPods Pro 2 Type-C chính hãng chống ồn chủ động',
    name: 'Tai nghe Apple AirPods Pro 2 Type-C',
    category: 'Điện thoại & Phụ kiện',
    price: 4200000,
    originalPrice: 5900000,
    location: 'Hà Nội',
    condition: 'Mới 99%',
    stockQuantity: 5,
    soldCount: 62,
    images: ['https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600&auto=format&fit=crop'],
    description: 'Chống ồn gấp 2 lần bản trước, âm thanh không gian sống động, hộp sạc tích hợp loa tìm kiếm Find My.'
  },
  {
    title: 'Sạc dự phòng Anker 20000mAh 65W Power Delivery sạc nhanh điện thoại và laptop',
    name: 'Sạc dự phòng Anker 20000mAh 65W',
    category: 'Điện thoại & Phụ kiện',
    price: 850000,
    originalPrice: 1200000,
    location: 'Đà Nẵng',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 12,
    soldCount: 84,
    images: ['https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&auto=format&fit=crop'],
    description: 'Dung lượng thực chuẩn sạc được 4-5 lần iPhone, hỗ trợ sạc cả MacBook và laptop Type-C.'
  },
  {
    title: 'Cáp sạc Baseus Type-C to Lightning 20W bọc dù chống đứt gãy sạc nhanh PD',
    name: 'Cáp sạc Baseus Type-C to Lightning 20W',
    category: 'Điện thoại & Phụ kiện',
    price: 75000,
    originalPrice: 120000,
    location: 'Hà Nội',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 50,
    soldCount: 190,
    images: ['https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop'],
    description: 'Dây dù bện bọc nhôm dày chịu uốn gập 10.000 lần, sạc 50% pin iPhone chỉ trong 30 phút.'
  },
  {
    title: 'Ốp lưng chống sốc UAG Pathfinder cho iPhone 14 Pro Max chuẩn quân đội',
    name: 'Ốp lưng UAG Pathfinder iPhone 14 Pro Max',
    category: 'Điện thoại & Phụ kiện',
    price: 320000,
    originalPrice: 550000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 99%',
    stockQuantity: 10,
    soldCount: 43,
    images: ['https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=600&auto=format&fit=crop'],
    description: 'Thiết kế hầm hố chịu lực rơi 4.8m, phím bấm nhẹ nảy, bảo vệ cụm camera nhô an toàn tuyệt đối.'
  },
  {
    title: 'Gimbal chống rung điện thoại DJI Osmo Mobile SE gập gọn quay vlog cực mượt',
    name: 'Gimbal chống rung DJI Osmo Mobile SE',
    category: 'Điện thoại & Phụ kiện',
    price: 1650000,
    originalPrice: 2200000,
    location: 'Hà Nội',
    condition: 'Mới 99%',
    stockQuantity: 4,
    soldCount: 26,
    images: ['https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop'],
    description: 'Chống rung 3 trục, ngàm kẹp nam châm tháo lắp siêu tốc, tính năng ActiveTrack 5.0 bám nét khuôn mặt.'
  },
  {
    title: 'Đồng hồ thông minh Apple Watch Series 8 45mm nhôm Midnight pin 98%',
    name: 'Apple Watch Series 8 45mm Midnight',
    category: 'Điện thoại & Phụ kiện',
    price: 5400000,
    originalPrice: 7900000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 99%',
    stockQuantity: 3,
    soldCount: 31,
    images: ['https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=600&auto=format&fit=crop'],
    description: 'Màn hình Always-on hiển thị liên tục, đo điện tâm đồ ECG và nồng độ oxy SpO2 theo dõi sức khỏe.'
  },

  // ── XE CỘ & PHỤ TÙNG (5 sản phẩm) ──
  {
    title: 'Xe máy Honda Wave Alpha 110cc đời 2021 màu trắng máy êm biển Hà Nội',
    name: 'Xe máy Honda Wave Alpha 110cc',
    category: 'Xe cộ & Phụ tùng',
    price: 12500000,
    originalPrice: 15000000,
    location: 'Hà Nội',
    condition: 'Đã sử dụng (Tốt)',
    stockQuantity: 1,
    soldCount: 5,
    images: ['https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=600&auto=format&fit=crop'],
    description: 'Xe đi làm văn phòng giữ gìn cẩn thận, bảo dưỡng định kỳ thay nhớt đều đặn, giấy tờ chính chủ.'
  },
  {
    title: 'Mũ bảo hiểm Fullface Royal M136 kính khói chống chói lót tháo giặt',
    name: 'Mũ bảo hiểm Fullface Royal M136',
    category: 'Xe cộ & Phụ tùng',
    price: 380000,
    originalPrice: 550000,
    location: 'Đà Nẵng',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 15,
    soldCount: 67,
    images: ['https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600&auto=format&fit=crop'],
    description: 'Vỏ nhựa ABS nguyên sinh chịu va đập chuẩn CR kiểm định, kính tráng gương chống tia UV ban ngày.'
  },
  {
    title: 'Camera hành trình ô tô 70mai Dash Cam Pro Plus A500S ghi hình trước sau 2K',
    name: 'Camera hành trình ô tô 70mai A500S',
    category: 'Xe cộ & Phụ tùng',
    price: 1550000,
    originalPrice: 2100000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 99%',
    stockQuantity: 6,
    soldCount: 44,
    images: ['https://images.unsplash.com/photo-1508974239320-0a029497e820?w=600&auto=format&fit=crop'],
    description: 'Góc quay rộng 140 độ bắt trọn làn đường, tích hợp GPS hiển thị tốc độ và cảnh báo làn đường ADAS.'
  },
  {
    title: 'Bơm lốp ô tô kiêm kích bình xe máy ô tô Baseus 12V nhỏ gọn bỏ cốp',
    name: 'Bơm lốp ô tô kiêm kích bình Baseus',
    category: 'Xe cộ & Phụ tùng',
    price: 790000,
    originalPrice: 1100000,
    location: 'Hà Nội',
    condition: 'Mới',
    stockQuantity: 8,
    soldCount: 53,
    images: ['https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&auto=format&fit=crop'],
    description: 'Tự ngắt khi đủ áp suất lốp, đèn LED cứu hộ ban đêm, kích nổ xe hơi dễ dàng khi hết ắc quy.'
  },
  {
    title: 'Nhớt Motul 7100 10W40 100% tổng hợp nhập khẩu Pháp cho xe số và côn tay',
    name: 'Nhớt xe máy Motul 7100 10W40',
    category: 'Xe cộ & Phụ tùng',
    price: 245000,
    originalPrice: 310000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 30,
    soldCount: 120,
    images: ['https://images.unsplash.com/photo-1563720223185-11003d516935?w=600&auto=format&fit=crop'],
    description: 'Nhớt màu đỏ Ester Core cao cấp bôi trơn tối ưu, bốc máy êm số, chu kỳ thay nhớt lên đến 3.000km.'
  },

  // ── ĐIỆN TỬ & CÔNG NGHỆ (5 sản phẩm) ──
  {
    title: 'MacBook Air M1 2020 8GB/256GB Silver chính hãng SA/A pin 95% sạc 45 lần',
    name: 'MacBook Air M1 2020 8GB/256GB',
    category: 'Điện tử & Công nghệ',
    price: 13500000,
    originalPrice: 17900000,
    location: 'Hà Nội',
    condition: 'Mới 99%',
    stockQuantity: 2,
    soldCount: 21,
    images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&auto=format&fit=crop'],
    description: 'Hiệu năng chip M1 mạnh mẽ mát máy, màn hình Retina sắc nét, pin xài cả ngày 10-12 tiếng liên tục.'
  },
  {
    title: 'Màn hình máy tính Dell UltraSharp U2422H 24 inch IPS tràn viền màu chuẩn đồ họa',
    name: 'Màn hình Dell UltraSharp U2422H 24 inch',
    category: 'Điện tử & Công nghệ',
    price: 4300000,
    originalPrice: 5800000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 99%',
    stockQuantity: 4,
    soldCount: 38,
    images: ['https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600&auto=format&fit=crop'],
    description: 'Độ phủ màu 100% sRGB, chân đế nâng hạ xoay dọc linh hoạt, cổng kết nối Type-C đa năng.'
  },
  {
    title: 'Chuột không dây công thái học Logitech MX Master 3S Silent cuộn vô cực MagSpeed',
    name: 'Chuột Logitech MX Master 3S',
    category: 'Điện tử & Công nghệ',
    price: 1650000,
    originalPrice: 2200000,
    location: 'Hà Nội',
    condition: 'Mới 99%',
    stockQuantity: 7,
    soldCount: 59,
    images: ['https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=600&auto=format&fit=crop'],
    description: 'Nút bấm êm giảm 90% tiếng ồn, cảm biến 8000 DPI di chuyển trên mọi mặt phẳng kính, pin sạc 70 ngày.'
  },
  {
    title: 'Loa Bluetooth di động Marshall Emberton II âm thanh nổi 360 độ chống nước IP67',
    name: 'Loa Bluetooth Marshall Emberton II',
    category: 'Điện tử & Công nghệ',
    price: 2900000,
    originalPrice: 4200000,
    location: 'Đà Nẵng',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 6,
    soldCount: 42,
    images: ['https://images.unsplash.com/photo-1545454675-3531b543be5d?w=600&auto=format&fit=crop'],
    description: 'Chất âm Marshall cổ điển mộc mạc âm trầm dày dặn, pin chơi nhạc hơn 30 giờ cho chuyến dã ngoại.'
  },
  {
    title: 'Bàn phím cơ không dây Keychron K2 V2 nhôm Led RGB switch Gateron Brown',
    name: 'Bàn phím cơ không dây Keychron K2 V2',
    category: 'Điện tử & Công nghệ',
    price: 1450000,
    originalPrice: 1950000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 99%',
    stockQuantity: 5,
    soldCount: 37,
    images: ['https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop'],
    description: 'Layout 75% gọn gàng hỗ trợ tốt cả Mac và Windows, switch gõ đầm tay không gây ồn văn phòng.'
  },

  // ── ĐỒ GIA DỤNG & NỘI THẤT (4 sản phẩm) ──
  {
    title: 'Nồi chiên không dầu điện tử Philips HD9280 dung tích 6.2L kết nối Wifi',
    name: 'Nồi chiên không dầu Philips HD9280',
    category: 'Đồ gia dụng & Nội thất',
    price: 2100000,
    originalPrice: 3200000,
    location: 'Hà Nội',
    condition: 'Mới 99%',
    stockQuantity: 5,
    soldCount: 48,
    images: ['https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&auto=format&fit=crop'],
    description: 'Công nghệ Rapid Air giảm 90% lượng dầu mỡ, lòng nồi chống dính tháo rời vệ sinh máy rửa chén.'
  },
  {
    title: 'Robot hút bụi lau nhà Xiaomi Dreame F9 lực hút mạnh 2500Pa điều hướng vSLAM',
    name: 'Robot hút bụi lau nhà Xiaomi Dreame F9',
    category: 'Đồ gia dụng & Nội thất',
    price: 2600000,
    originalPrice: 3900000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 99%',
    stockQuantity: 3,
    soldCount: 36,
    images: ['https://images.unsplash.com/photo-1558317374-067fb5f30001?w=600&auto=format&fit=crop'],
    description: 'Hút sạch bụi mịn và lông thú cưng, lau nhà sạch bóng, lập bản đồ nhà thông minh điều khiển qua app.'
  },
  {
    title: 'Bàn làm việc gaming chữ Z mặt gỗ MDF carbon khung thép chịu lực',
    name: 'Bàn làm việc gaming chữ Z',
    category: 'Đồ gia dụng & Nội thất',
    price: 550000,
    originalPrice: 850000,
    location: 'Hà Nội',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 12,
    soldCount: 68,
    images: ['https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&auto=format&fit=crop'],
    description: 'Kích thước 120x60cm rộng rãi có lỗ luồn dây điện và giá để cốc nước, khung thép hộp dày chắc chắn.'
  },
  {
    title: 'Ghế công thái học Ergonomic Sihoo M57 đệm lưới thoáng khí đỡ lưng 3D',
    name: 'Ghế công thái học Ergonomic Sihoo M57',
    category: 'Đồ gia dụng & Nội thất',
    price: 2850000,
    originalPrice: 4100000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 99%',
    stockQuantity: 4,
    soldCount: 41,
    images: ['https://images.unsplash.com/photo-1505843490538-5133c6c7d0e1?w=600&auto=format&fit=crop'],
    description: 'Lưới Dragon thoáng mát không bí nhiệt, tựa đầu điều chỉnh đa hướng chống đau mỏi vai gáy khi ngồi lâu.'
  },

  // ── THỜI TRANG & PHỤ KIỆN (4 sản phẩm) ──
  {
    title: 'Áo khoác gió thể thao nam nữ The North Face 2 lớp chống nước cản gió',
    name: 'Áo khoác gió The North Face 2 lớp',
    category: 'Thời trang & Phụ kiện',
    price: 350000,
    originalPrice: 520000,
    location: 'Hà Nội',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 20,
    soldCount: 115,
    images: ['https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=600&auto=format&fit=crop'],
    description: 'Chất liệu Gore-Tex chống thấm mưa phùn, lớp lót lưới thoáng khí, mũ trùm tháo rời tiện lợi khi đi phượt.'
  },
  {
    title: 'Giày sneaker Nike Air Jordan 1 Low Panda phối màu đen trắng hot trend size 41',
    name: 'Giày Nike Air Jordan 1 Low Panda',
    category: 'Thời trang & Phụ kiện',
    price: 1850000,
    originalPrice: 2800000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 99%',
    stockQuantity: 3,
    soldCount: 49,
    images: ['https://images.unsplash.com/photo-1552346154-21d32810aba3?w=600&auto=format&fit=crop'],
    description: 'Form giày ôm chân chất da cao cấp không gãy mũi, phối màu dễ phối mọi phong cách streetwear.'
  },
  {
    title: 'Đồng hồ nam dây thép không gỉ Casio Edifice Chronograph 6 kim chống nước 100m',
    name: 'Đồng hồ Casio Edifice Chronograph',
    category: 'Thời trang & Phụ kiện',
    price: 1450000,
    originalPrice: 2300000,
    location: 'Đà Nẵng',
    condition: 'Mới 99%',
    stockQuantity: 4,
    soldCount: 29,
    images: ['https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=600&auto=format&fit=crop'],
    description: 'Mặt kính khoáng cường lực chống xước, vỏ thép 316L sáng bóng nam tính, bấm giờ thể thao chính xác.'
  },
  {
    title: 'Balo laptop công sở Tomtoc Urban chống nước chống sốc đựng vừa máy 15.6 inch',
    name: 'Balo laptop Tomtoc Urban 15.6 inch',
    category: 'Thời trang & Phụ kiện',
    price: 780000,
    originalPrice: 1150000,
    location: 'Hà Nội',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 10,
    soldCount: 63,
    images: ['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop'],
    description: 'Công nghệ CornerArmor bảo vệ góc laptop khi va chạm, khóa kéo YKK Nhật Bản trơn mượt bền bỉ.'
  },

  // ── THÚ CƯNG & ĐỒ DÙNG (4 sản phẩm) ──
  {
    title: 'Chuồng nuôi mèo 3 tầng nan sắt sơn tĩnh điện có bánh xe di chuyển khay vệ sinh',
    name: 'Chuồng nuôi mèo 3 tầng nan sắt',
    category: 'Thú cưng & Đồ dùng',
    price: 650000,
    originalPrice: 920000,
    location: 'Hà Nội',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 6,
    soldCount: 38,
    images: ['https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop'],
    description: 'Chuồng rộng rãi có võng nằm êm ái cho mèo leo trèo, nan sắt dày dặn không rỉ sét, tháo lắp đơn giản.'
  },
  {
    title: 'Cát đậu nành hữu cơ Cature cho mèo khử mùi kháng khuẩn xả thẳng bồn cầu túi 6L',
    name: 'Cát đậu nành hữu cơ Cature 6L',
    category: 'Thú cưng & Đồ dùng',
    price: 115000,
    originalPrice: 160000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 40,
    soldCount: 175,
    images: ['https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&auto=format&fit=crop'],
    description: 'Vón cục siêu nhanh không bụi an toàn đường hô hấp cho mèo và trẻ nhỏ, tan nhanh trong nước dễ tiêu hủy.'
  },
  {
    title: 'Bể cá cảnh mini để bàn làm việc tích hợp thác nước lọc tuần hoàn và đèn LED',
    name: 'Bể cá cảnh mini để bàn thác nước',
    category: 'Thú cưng & Đồ dùng',
    price: 320000,
    originalPrice: 480000,
    location: 'Đà Nẵng',
    condition: 'Mới',
    stockQuantity: 12,
    soldCount: 57,
    images: ['https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?w=600&auto=format&fit=crop'],
    description: 'Bể thủy tinh siêu trong uốn cong 3 cạnh, máy bơm êm không tiếng ồn, tạo điểm nhấn thư giãn cho góc làm việc.'
  },
  {
    title: 'Thức ăn cá cảnh cá Koi AquaMaster tăng màu và cân đối thể trọng gói 1kg',
    name: 'Thức ăn cá Koi AquaMaster 1kg',
    category: 'Thú cưng & Đồ dùng',
    price: 140000,
    originalPrice: 190000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 25,
    soldCount: 88,
    images: ['https://images.unsplash.com/photo-1535591273668-578e31182c4f?w=600&auto=format&fit=crop'],
    description: 'Hạt thức ăn nổi lâu không làm đục nước, giàu đạm và Spirulina giúp cá lên màu tự nhiên rực rỡ.'
  }
];

async function seedCompleteCatalog() {
  console.log('📡 Đang kết nối tới MongoDB Atlas...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Đã kết nối MongoDB Atlas!');

  // 1. Dọn dẹp Category collection: Xóa các danh mục cũ không chuẩn
  console.log('\n🧹 Đang làm sạch Category collection...');
  const standardNames = STANDARD_CATEGORIES.map(c => c.name);
  const deleteResult = await Category.deleteMany({ name: { $nin: standardNames } });
  console.log(`   + Đã dọn dẹp ${deleteResult.deletedCount} danh mục cũ.`);

  // 2. Cập nhật / tạo đúng 8 danh mục chuẩn
  console.log('\n📦 Đang đồng bộ đúng 8 danh mục chuẩn:');
  for (const cat of STANDARD_CATEGORIES) {
    await Category.findOneAndUpdate(
      { name: cat.name },
      { $set: { image: cat.image, description: cat.description } },
      { upsert: true, new: true }
    );
    console.log(`   ✅ Danh mục: "${cat.name}"`);
  }

  // 3. Tìm seller mẫu
  const sampleSeller = await User.findOne({ isSeller: true }) || await User.findOne();
  const sellerId = sampleSeller ? sampleSeller._id : new mongoose.Types.ObjectId();
  console.log(`\n👤 Gán seller mẫu: ${sampleSeller ? sampleSeller.name : 'System Seller'} (${sellerId})`);

  // 4. Thêm các sản phẩm mẫu phong phú
  console.log(`\n🛍️ Đang bổ sung ${SAMPLE_PRODUCTS.length} sản phẩm mẫu phong phú cho các mục...`);
  let createdCount = 0;
  let updatedCount = 0;

  for (const item of SAMPLE_PRODUCTS) {
    const existing = await Post.findOne({ title: item.title });
    if (!existing) {
      const p = new Post({
        ...item,
        sellerId,
        author: sellerId,
        status: 'active'
      });
      await p.save();
      createdCount++;
      console.log(`   + Đã tạo mới: [${item.category}] "${item.title.slice(0, 45)}..."`);
    } else {
      await Post.updateOne(
        { _id: existing._id },
        {
          $set: {
            category: item.category,
            status: 'active',
            price: item.price,
            stockQuantity: item.stockQuantity || 10,
            quantity: item.stockQuantity || 10,
            images: item.images,
            condition: item.condition
          }
        }
      );
      updatedCount++;
    }
  }

  console.log(`\n🎉 Hoàn thành: Tạo mới ${createdCount} sản phẩm, Cập nhật ${updatedCount} sản phẩm.`);

  // 5. Thống kê lại số lượng sản phẩm mỗi danh mục
  const counts = await Post.aggregate([
    { $match: { status: { $in: ['active', 'APPROVED'] } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);

  console.log('\n📊 Phân bố sản phẩm thực tế theo danh mục (active/APPROVED):');
  counts.forEach(c => console.log(`   - ${c._id}: ${c.count} sản phẩm`));

  await mongoose.disconnect();
  console.log('\n✨ Đã ngắt kết nối DB thành công!');
}

seedCompleteCatalog().catch(err => {
  console.error('❌ Lỗi khi seed catalog:', err);
  process.exit(1);
});

