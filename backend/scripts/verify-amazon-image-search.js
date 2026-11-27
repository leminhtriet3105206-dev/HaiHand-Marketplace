const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const posts = mongoose.connection.db.collection('posts');
  const root = path.join(__dirname, '../../output');
  const ids = JSON.parse(fs.readFileSync(path.join(root, 'amazon-migration-result-1795496911550.json'))).insertedIds.map(id => new mongoose.Types.ObjectId(id));
  const rows = await posts.find({ _id: { $in: ids } }).toArray();
  let vectorCount = 0;
  for (const row of rows) {
    if (JSON.stringify(row.images.filter(Boolean).slice(0,5)) !== JSON.stringify(row.imageEmbeddingImages)) throw new Error(`Source mismatch ${row._id}`);
    for (let i=0; i<row.imageEmbeddingImages.length; i++) {
      const v = row[`imageVector${i}`];
      if (!v || v.length !== 768 || !v.every(Number.isFinite) || Math.abs(Math.hypot(...v)-1) > 0.0001 || JSON.stringify(v) !== JSON.stringify(row.imageEmbeddings[i])) throw new Error(`Invalid vector ${row._id}/${i}`);
      vectorCount++;
    }
  }
  const samples = [];
  for (const row of [rows[0], rows[Math.floor(rows.length/2)], rows.at(-1)]) {
    const result = await posts.aggregate([
      {$vectorSearch: {index: 'product_image_vector_index', path: 'imageVector0', queryVector: row.imageVector0, exact: true, limit: 1, filter: {_id: row._id}}},
      {$project: {title: 1, score: {$meta: 'vectorSearchScore'}}}
    ]).toArray();
    if (result.length !== 1 || result[0].score < 0.999) throw new Error(`Search index not ready for ${row._id}`);
    samples.push(result[0]);
  }
  console.log(JSON.stringify({products: rows.length, vectorCount, samples}));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(()=>mongoose.disconnect());
