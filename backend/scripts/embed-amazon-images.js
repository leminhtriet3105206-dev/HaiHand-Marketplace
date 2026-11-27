const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { embedProductImages, IMAGE_EMBEDDING_MODEL } = require('../services/imageEmbeddingService');
const { imageVectorFields } = require('../services/imageVectorIndex');
const root = path.join(__dirname, '../../output');
function complete(row) {
  const sources = (row.images || []).filter(Boolean).slice(0, 5);
  return sources.length && row.imageEmbeddingModel === IMAGE_EMBEDDING_MODEL
    && JSON.stringify(sources) === JSON.stringify(row.imageEmbeddingImages)
    && row.imageEmbeddings?.length === sources.length
    && sources.every((_, i) => row[`imageVector${i}`]?.length === 768 && row[`imageVector${i}`].every(Number.isFinite));
}
async function main() {
  if (!/siglip/i.test(IMAGE_EMBEDDING_MODEL)) throw new Error('Expected SigLIP model');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const posts = mongoose.connection.db.collection('posts');
  const ids = JSON.parse(fs.readFileSync(path.join(root, 'amazon-migration-result-1795496911550.json'))).insertedIds.map(id => new mongoose.Types.ObjectId(id));
  const rows = await posts.find({ _id: { $in: ids } }).toArray();
  if (rows.length !== 943) throw new Error(`Expected 943, got ${rows.length}`);
  const pending = rows.filter(row => !complete(row));
  console.log(JSON.stringify({model: IMAGE_EMBEDDING_MODEL, total: rows.length, pending: pending.length}));
  const failures = [];
  let done = rows.length - pending.length;
  for (const row of pending) {
    try {
      const embedded = await embedProductImages(row.images);
      if (!embedded || JSON.stringify(embedded.sources) !== JSON.stringify(row.images.filter(Boolean).slice(0,5))) throw new Error('Incomplete images');
      const result = await posts.updateOne({ _id: row._id, images: row.images }, { $set: {
        imageEmbedding: embedded.centroid, imageEmbeddings: embedded.vectors,
        imageEmbeddingImages: embedded.sources, imageEmbeddingModel: IMAGE_EMBEDDING_MODEL,
        ...imageVectorFields(embedded.vectors)
      } });
      if (result.matchedCount !== 1) throw new Error('Images changed during embedding');
      done++;
      if (done % 25 === 0) console.log(`Embedded ${done}/943`);
    } catch (error) {
      failures.push({ id: String(row._id), title: row.title, error: error.message });
      console.error(`${row._id}: ${error.message}`);
    }
  }
  const verified = await posts.find({ _id: { $in: ids } }).toArray();
  const report = { checkedAt: new Date().toISOString(), model: IMAGE_EMBEDDING_MODEL, total: verified.length, complete: verified.filter(complete).length, failures };
  fs.writeFileSync(path.join(root, 'amazon-image-embedding-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (report.complete !== 943) process.exitCode = 1;
}
main().catch(error => {console.error(error.message); process.exitCode = 1;}).finally(() => mongoose.disconnect());
