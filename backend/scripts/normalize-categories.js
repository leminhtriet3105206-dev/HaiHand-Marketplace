const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Post } = require('../models/Product');

async function checkAndNormalizeCategories() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('Connected to DB');

  const posts = await Post.find({}).select('title category price').lean();
  console.log(`Total posts in DB: ${posts.length}`);

  const catMap = {
    'thức ăn cho rùa': 'Thú cưng & Đồ dùng',
    'thức ăn': 'Thú cưng & Đồ dùng',
    'rùa': 'Thú cưng & Đồ dùng',
    'xe đạp địa hình': 'Xe cộ & Phụ tùng',
    'xe đạp điện': 'Xe cộ & Phụ tùng',
    'xe đạp': 'Xe cộ & Phụ tùng',
    'samsum': 'Điện thoại & Phụ kiện',
    'samsung': 'Điện thoại & Phụ kiện',
    'iphone': 'Điện thoại & Phụ kiện',
    'lababu': 'Đồ chơi, Mẹ & Bé',
    'tủ quần áo': 'Đồ gia dụng & Nội thất',
    'đồng hồ': 'Thời trang & Phụ kiện',
    'omaga': 'Thời trang & Phụ kiện'
  };

  let updatedCount = 0;
  for (const post of posts) {
    const titleLower = (post.title || '').toLowerCase();
    let newCat = null;

    for (const [key, targetCat] of Object.entries(catMap)) {
      if (titleLower.includes(key)) {
        newCat = targetCat;
        break;
      }
    }

    if (newCat && post.category !== newCat) {
      await Post.updateOne({ _id: post._id }, { $set: { category: newCat } });
      console.log(`Updated "${post.title}" (${post.category} -> ${newCat})`);
      updatedCount++;
    } else {
      console.log(`Post "${post.title}": Category = "${post.category}"`);
    }
  }

  console.log(`Done normalizing! Updated ${updatedCount} posts.`);
  await mongoose.disconnect();
}

checkAndNormalizeCategories().catch(console.error);

