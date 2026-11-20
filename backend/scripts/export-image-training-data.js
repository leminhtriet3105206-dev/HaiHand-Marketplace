require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const { imageAsDataUrl } = require('../services/imageEmbeddingService');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI;
  if (!uri) throw new Error('Thiếu MongoDB URI trong backend/.env');

  const output = path.resolve(process.argv[2] || path.join(__dirname, '..', 'training-data', 'catalog'));
  const imagesDir = path.join(output, 'images');
  await fs.mkdir(imagesDir, { recursive: true });
  await mongoose.connect(uri);
  try {
    const products = await mongoose.connection.db.collection('posts')
      .find({ status: { $in: ['active', 'APPROVED'] }, 'images.0': { $exists: true } },
        { projection: { _id: 1, title: 1, name: 1, category: 1, images: 1 } })
      .sort({ _id: 1 }).toArray();
    const rows = [];
    let failed = 0;
    for (const [productIndex, product] of products.entries()) {
      const productId = String(product._id);
      for (const [imageIndex, source] of product.images.entries()) {
        const file = `${productId}-${imageIndex}.jpg`;
        const destination = path.join(imagesDir, file);
        try {
          try {
            await fs.access(destination);
          } catch {
            const dataUrl = await imageAsDataUrl(source);
            if (!dataUrl) throw new Error('Ảnh không hợp lệ');
            await fs.writeFile(destination, Buffer.from(dataUrl.split(',')[1], 'base64'));
          }
          rows.push({
            productId,
            image: `images/${file}`,
            title: String(product.title || product.name || '').slice(0, 200),
            category: String(product.category || '').slice(0, 100)
          });
        } catch (error) {
          failed++;
          console.warn(`Bỏ qua ảnh ${productId}/${imageIndex}: ${error.message}`);
        }
      }
      if ((productIndex + 1) % 20 === 0 || productIndex + 1 === products.length) {
        console.log(`Đã xuất ${productIndex + 1}/${products.length} tin, ${rows.length} ảnh`);
      }
    }
    await fs.writeFile(path.join(output, 'manifest.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
    console.log(`Hoàn tất: ${rows.length} ảnh, ${failed} ảnh lỗi. Thư mục: ${output}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
