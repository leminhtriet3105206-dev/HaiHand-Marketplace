const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const { embedProductImages, IMAGE_EMBEDDING_MODEL } = require('../services/imageEmbeddingService');
const { imageVectorFields } = require('../services/imageVectorIndex');

const IDS = [
  '69de0fb63e4ad1438017e72f',
  '69de23497a871f2c9e8f503e'
].map(id => new mongoose.Types.ObjectId(id));

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20_000 });
  const posts = mongoose.connection.db.collection('posts');
  const rows = await posts.find({ _id: { $in: IDS } }).toArray();
  if (rows.length !== IDS.length) throw new Error(`Chỉ tìm thấy ${rows.length}/${IDS.length} sản phẩm`);

  const backup = path.join(__dirname, `../../output/incomplete-image-embeddings-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify(rows, null, 2));
  console.log(`Backup: ${backup}`);

  for (const row of rows) {
    const embedded = await embedProductImages(row.images);
    if (!embedded || embedded.sources.length !== row.images.filter(Boolean).slice(0, 5).length) {
      throw new Error(`Không embedding đủ ảnh cho ${row._id} (${row.title})`);
    }
    const result = await posts.updateOne(
      { _id: row._id, images: row.images },
      { $set: {
        imageEmbedding: embedded.centroid,
        imageEmbeddings: embedded.vectors,
        imageEmbeddingImages: embedded.sources,
        imageEmbeddingModel: IMAGE_EMBEDDING_MODEL,
        ...imageVectorFields(embedded.vectors),
        updatedAt: new Date()
      } }
    );
    if (result.modifiedCount !== 1) throw new Error(`Không cập nhật được ${row._id}`);
    console.log(`Updated: ${row._id} — ${row.title}`);
  }

  const repaired = await posts.find({ _id: { $in: IDS } }, {
    projection: { title: 1, images: 1, imageEmbeddingImages: 1, imageEmbeddings: 1, imageVector0: 1 }
  }).toArray();
  for (const row of repaired) {
    if (JSON.stringify(row.images.slice(0, 5)) !== JSON.stringify(row.imageEmbeddingImages)
      || row.imageEmbeddings.length !== row.imageEmbeddingImages.length
      || row.imageVector0.length !== 768
      || !row.imageVector0.every(Number.isFinite)) {
      throw new Error(`Xác minh thất bại cho ${row._id}`);
    }
  }
  console.log(`VERIFIED ${repaired.length}/${IDS.length}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
