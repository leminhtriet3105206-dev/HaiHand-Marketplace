// Targeted repair of records inspected in the catalog; run without --apply to preview.
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Post } = require('../models/Product');
const groups = {
  'Bất Động Sản': ['69dcc0c7295b6e59ef3af97d', '69d86b92a937bd538ab31a30', '69d86af9a937bd538ab319b2', '69d86a68a937bd538ab3192b'],
  'Sách & Văn phòng phẩm': ['69de25647a871f2c9e8f51ec', '69d86fcaa937bd538ab31df7'],
  'Thực phẩm & Đồ uống': ['69de0869e0f64faf1ab9f632'],
  'Thể thao & Dã ngoại': ['69de275c7a871f2c9e8f54b6'],
  'Linh tinh': ['69de10ec3e4ad1438017e838', '69de058fe0f64faf1ab9ef18', '69d4c326612f527c57572c56', '69dcccdb295b6e59ef3b072d', '69dcbe50295b6e59ef3af603'],
};
async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI);
  try {
    for (const [category, ids] of Object.entries(groups)) {
      const filter = { _id: { $in: ids }, category: 'Đồ gia dụng & Nội thất' };
      const posts = await Post.find(filter).select('title category').lean();
      console.log(JSON.stringify({ category, posts }));
      if (process.argv.includes('--apply')) {
        await Post.updateMany(filter, { $set: { category } });
        if (await Post.countDocuments(filter)) throw new Error('Category repair verification failed');
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
