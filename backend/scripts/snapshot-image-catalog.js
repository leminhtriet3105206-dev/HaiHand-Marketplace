require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI;
  if (!uri) throw new Error('Thiếu MongoDB Atlas URI');
  const destination = path.resolve(process.argv[2] || '../output/image-search-all-products/catalog.json');
  await mongoose.connect(uri);
  try {
    const products = await mongoose.connection.db.collection('posts').find(
      { status: { $in: ['active', 'APPROVED'] } },
      { projection: { _id: 1, title: 1, name: 1, category: 1, description: 1, images: 1,
        imageEmbeddingModel: 1, imageEmbeddings: 1 } }
    ).sort({ _id: 1 }).toArray();
    const rows = products.map((product) => ({
      id: String(product._id),
      title: product.title || product.name || '',
      category: product.category || '',
      description: String(product.description || '').slice(0, 300),
      images: product.images || [],
      firstImage: product.images?.[0] || '',
      imageCount: product.images?.length || 0,
      embeddedImageCount: product.imageEmbeddings?.length || 0,
      imageEmbeddingModel: product.imageEmbeddingModel || ''
    }));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, JSON.stringify(rows, null, 2));
    console.log(`Đã xuất ${rows.length} sản phẩm; ${rows.filter((row) => row.embeddedImageCount).length} sản phẩm có vector ảnh.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
