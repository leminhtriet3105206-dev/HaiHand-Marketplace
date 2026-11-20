/**
 * Seed Rich Catalog & Related Products
 * HaiHand Marketplace
 * Run: node scripts/seed-rich-catalog.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Post } = require('../models/Product');
const User = require('../models/User');
const ProductCoView = require('../models/ProductCoView');

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
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff025a7?w=300&auto=format&fit=crop',
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
    image: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=300&auto=format&fit=crop',
    description: 'Dụng cụ tập gym, đồ cắm trại leo núi, nhạc cụ, sách vở'
  }
];

const RICH_PRODUCTS = [
  // ── NHÓM THÚ CƯNG & THỨC ĂN (Đặc biệt liên quan đến "thức ăn cho rùa" & "chó mèo") ──
  {
    title: 'Thức ăn cho chó mèo Royal Canin dinh dưỡng cao 1.5kg',
    name: 'Thức ăn cho chó mèo Royal Canin',
    category: 'Thú cưng & Đồ dùng',
    price: 185000,
    originalPrice: 220000,
    location: 'Hà Nội',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 15,
    soldCount: 42,
    images: ['https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=600&auto=format&fit=crop'],
    description: 'Thức ăn hạt dinh dưỡng cân bằng cho chó mèo mọi lứa tuổi, giàu protein, giúp mượt lông và tăng cường tiêu hóa.'
  },
  {
    title: 'Pate dinh dưỡng cho mèo Whiskas vị cá ngừ thơm ngon',
    name: 'Pate Whiskas cho mèo',
    category: 'Thú cưng & Đồ dùng',
    price: 35000,
    originalPrice: 45000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 50,
    soldCount: 88,
    images: ['https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=600&auto=format&fit=crop'],
    description: 'Pate cao cấp cung cấp nước và khoáng chất thiết yếu cho mèo cưng, hỗ trợ hệ tiết niệu.'
  },
  {
    title: 'Bể nuôi rùa cảnh mini có cầu thang & cây xanh ngắm cảnh',
    name: 'Bể nuôi rùa cảnh mini',
    category: 'Thú cưng & Đồ dùng',
    price: 150000,
    originalPrice: 190000,
    location: 'Hà Nội',
    condition: 'Mới',
    stockQuantity: 8,
    soldCount: 29,
    images: ['https://images.unsplash.com/photo-1508817628294-5a453fa0b8fb?w=600&auto=format&fit=crop'],
    description: 'Bể nhựa acrylic cao cấp có ban công phơi nắng cho rùa cảnh, tích hợp máng ăn và cầu thang tập bò.'
  },
  {
    title: 'Thức ăn hỗn hợp tăng trưởng cho rùa cảnh và bò sát cảnh',
    name: 'Thức ăn hỗn hợp rùa cảnh',
    category: 'Thú cưng & Đồ dùng',
    price: 95000,
    originalPrice: 120000,
    location: 'Đà Nẵng',
    condition: 'Mới',
    stockQuantity: 20,
    soldCount: 53,
    images: ['https://images.unsplash.com/photo-1437622368342-7a3d73a34c8f?w=600&auto=format&fit=crop'],
    description: 'Hạt dinh dưỡng bổ sung canxi và vitamin D3 giúp mai rùa cứng cáp, ngừa mềm mai ở rùa nhỏ.'
  },
  {
    title: 'Đèn sưởi UVB 3.0 cho rùa và bò sát hỗ trợ hấp thụ canxi',
    name: 'Đèn sưởi UVB cho rùa',
    category: 'Thú cưng & Đồ dùng',
    price: 125000,
    originalPrice: 160000,
    location: 'Hà Nội',
    condition: 'Mới 100% (Nguyên hộp)',
    stockQuantity: 12,
    soldCount: 31,
    images: ['https://images.unsplash.com/photo-1548802673-380ab8ebc7b7?w=600&auto=format&fit=crop'],
    description: 'Bóng đèn sưởi mô phỏng ánh nắng mặt trời, giúp rùa tiêu hóa thức ăn và tổng hợp vitamin D3.'
  },
  {
    title: 'Bát ăn đôi tự động cấp nước cho chó mèo và thú cưng',
    name: 'Bát ăn tự động thú cưng',
    category: 'Thú cưng & Đồ dùng',
    price: 85000,
    originalPrice: 110000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới',
    stockQuantity: 25,
    soldCount: 64,
    images: ['https://images.unsplash.com/photo-1535930891776-0c2dfb7fda1a?w=600&auto=format&fit=crop'],
    description: 'Bộ khay đựng thức ăn kèm bình nước tự động chống tràn, tiện lợi khi bạn vắng nhà.'
  },

  // ── NHÓM XE CỘ (Liên quan đến xe đạp địa hình, xe đạp điện) ──
  {
    title: 'Mũ bảo hiểm xe đạp thể thao thoáng khí siêu nhẹ',
    name: 'Mũ bảo hiểm xe đạp thể thao',
    category: 'Xe cộ & Phụ tùng',
    price: 190000,
    originalPrice: 250000,
    location: 'Hà Nội',
    condition: 'Mới',
    stockQuantity: 10,
    soldCount: 38,
    images: ['https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=600&auto=format&fit=crop'],
    description: 'Mũ bảo hiểm thể thao có khe tản nhiệt, đệm lót êm ái, đạt chuẩn an toàn đi xe đạp địa hình.'
  },
  {
    title: 'Khóa dây số chống trộm xe đạp và xe máy thông minh 5 số',
    name: 'Khóa dây chống trộm xe đạp',
    category: 'Xe cộ & Phụ tùng',
    price: 75000,
    originalPrice: 95000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới',
    stockQuantity: 30,
    soldCount: 77,
    images: ['https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=600&auto=format&fit=crop'],
    description: 'Dây cáp thép bọc nhựa dẻo chống cắt, mật mã 5 số dễ dàng thay đổi an toàn tuyệt đối.'
  },

  // ── NHÓM ĐIỆN TỬ / ĐIỆN THOẠI (Liên quan đến samsum, iphone) ──
  {
    title: 'Củ sạc nhanh Samsung 25W Type-C chính hãng',
    name: 'Củ sạc nhanh Samsung 25W',
    category: 'Điện thoại & Phụ kiện',
    price: 180000,
    originalPrice: 290000,
    location: 'Hà Nội',
    condition: 'Mới',
    stockQuantity: 18,
    soldCount: 92,
    images: ['https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&auto=format&fit=crop'],
    description: 'Củ sạc chuẩn PD hỗ trợ sạc siêu nhanh 25W cho các dòng Samsung Galaxy, iPhone và iPad.'
  },
  {
    title: 'Tai nghe Bluetooth không dây chống ồn TWS cao cấp',
    name: 'Tai nghe Bluetooth TWS',
    category: 'Điện thoại & Phụ kiện',
    price: 299000,
    originalPrice: 450000,
    location: 'TP. Hồ Chí Minh',
    condition: 'Mới',
    stockQuantity: 15,
    soldCount: 110,
    images: ['https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop'],
    description: 'Âm bass mạnh mẽ, pin trâu 6 tiếng liên tục, dock sạc dự phòng thông minh.'
  }
];

async function seedRichCatalog() {
  console.log('📡 Đang kết nối tới MongoDB Atlas...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Đã kết nối MongoDB Atlas!');

  // 1. Cập nhật và chia lại danh mục chuẩn
  console.log('\n📦 Đang đồng bộ danh mục chuẩn (Categories)...');
  for (const cat of STANDARD_CATEGORIES) {
    await Category.findOneAndUpdate(
      { name: cat.name },
      { $set: { image: cat.image, description: cat.description } },
      { upsert: true, new: true }
    );
    console.log(`   + Danh mục: ${cat.name}`);
  }

  // 2. Tìm một seller mẫu để gán sản phẩm
  const sampleSeller = await User.findOne({ isSeller: true }) || await User.findOne();
  const sellerId = sampleSeller ? sampleSeller._id : new mongoose.Types.ObjectId();

  // 3. Thêm các sản phẩm liên quan phong phú
  console.log('\n🛍️ Đang bổ sung sản phẩm liên quan phong phú...');
  const createdProducts = [];
  for (const item of RICH_PRODUCTS) {
    const existing = await Post.findOne({ title: item.title });
    if (!existing) {
      const p = new Post({
        ...item,
        sellerId,
        author: sellerId,
        status: 'active'
      });
      await p.save();
      createdProducts.push(p);
      console.log(`   + Đã tạo sản phẩm: "${p.title}" (${p.category})`);
    } else {
      createdProducts.push(existing);
      console.log(`   * Đã có sẵn: "${existing.title}"`);
    }
  }

  // 4. Tìm sản phẩm "thức ăn cho rùa" nếu có và tạo ma trận đồng xem với "thức ăn cho chó mèo"
  console.log('\n🔗 Đang thiết lập liên kết ma trận Co-View cho nhóm thức ăn & thú cưng...');
  const turtleFood = await Post.findOne({ title: { $regex: /rùa/i } });
  const dogCatFood = await Post.findOne({ title: { $regex: /chó mèo/i } });

  if (turtleFood && dogCatFood) {
    await ProductCoView.findOneAndUpdate(
      { productId: turtleFood._id, coViewedProductId: dogCatFood._id },
      { $inc: { count: 8 }, $set: { lastCoViewedAt: new Date() } },
      { upsert: true }
    );
    await ProductCoView.findOneAndUpdate(
      { productId: dogCatFood._id, coViewedProductId: turtleFood._id },
      { $inc: { count: 8 }, $set: { lastCoViewedAt: new Date() } },
      { upsert: true }
    );
    console.log(`   ✅ Đã liên kết Co-View: "${turtleFood.title}" ↔ "${dogCatFood.title}"`);
  }

  console.log('\n✨ Hoàn tất seed danh mục và dữ liệu liên quan thành công!');
  process.exit(0);
}

seedRichCatalog().catch((err) => {
  console.error('❌ Lỗi khi seed:', err);
  process.exit(1);
});

