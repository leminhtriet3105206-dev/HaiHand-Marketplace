const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Post } = require('../models/Product');

async function mapAllRemainingCategories() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const posts = await Post.find({}).select('title category').lean();

  const generalMap = {
    'Thú cưng': 'Thú cưng & Đồ dùng',
    'Xe cộ': 'Xe cộ & Phụ tùng',
    'Thời trang': 'Thời trang & Phụ kiện',
    'Đồ gia dụng': 'Đồ gia dụng & Nội thất',
    'Nội thất': 'Đồ gia dụng & Nội thất',
    'Đồ chơi': 'Đồ chơi, Mẹ & Bé',
    'Mẹ & Bé': 'Đồ chơi, Mẹ & Bé',
    'Đồ điện tử': 'Điện tử & Công nghệ',
    'Điện tử - Công nghệ': 'Điện tử & Công nghệ',
    'Thể thao': 'Thể thao & Dã ngoại',
    'Linh tinh': 'Đồ gia dụng & Nội thất',
    'Bất Động Sản': 'Đồ gia dụng & Nội thất'
  };

  let count = 0;
  for (const p of posts) {
    if (generalMap[p.category]) {
      const target = generalMap[p.category];
      await Post.updateOne({ _id: p._id }, { $set: { category: target } });
      count++;
    }
  }

  console.log(`Mapped ${count} posts to standard categories.`);
  await mongoose.disconnect();
}

mapAllRemainingCategories().catch(console.error);

