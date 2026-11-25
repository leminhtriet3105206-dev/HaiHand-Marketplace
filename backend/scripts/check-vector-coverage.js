const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const output = path.join(__dirname, '../../output');
const valid = x => Array.isArray(x) && x.length > 0 && x.every(Number.isFinite);
async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const posts = mongoose.connection.db.collection('posts');
  const ids = new Set(JSON.parse(fs.readFileSync(path.join(output, 'amazon-migration-result-1795496911550.json'))).insertedIds);
  const projection = { title: 1, images: 1, textEmbedding: 1, imageEmbedding: 1, imageEmbeddings: 1, imageEmbeddingImages: 1 };
  for (let i = 0; i < 5; i++) projection[`imageVector${i}`] = 1;
  const rows = await posts.find({}, { projection }).toArray();
  function summarize(items) {
    return { total: items.length, withTextVector: items.filter(x => valid(x.textEmbedding)).length,
      withImageVector0: items.filter(x => valid(x.imageVector0)).length,
      withImageEmbedding: items.filter(x => valid(x.imageEmbedding)).length,
      fullySyncedImages: items.filter(x => {
        const urls = (x.images || []).filter(Boolean).slice(0, 5);
        return urls.length > 0 && JSON.stringify(urls) === JSON.stringify(x.imageEmbeddingImages)
          && x.imageEmbeddings?.length === urls.length
          && urls.every((_,i) => valid(x.imageEmbeddings[i]) && valid(x[`imageVector${i}`]) && x[`imageVector${i}`].length === 768);
      }).length,
      textDimensions: [...new Set(items.filter(x => valid(x.textEmbedding)).map(x => x.textEmbedding.length))],
      imageDimensions: [...new Set(items.filter(x => valid(x.imageVector0)).map(x => x.imageVector0.length))] };
  }
  const report = { checkedAt: new Date().toISOString(), all: summarize(rows), amazon: summarize(rows.filter(x => ids.has(String(x._id)))), other: summarize(rows.filter(x => !ids.has(String(x._id)))) };
  try { report.searchIndexes = await posts.listSearchIndexes().toArray(); } catch (error) { report.indexCheckError = error.message; }
  fs.writeFileSync(path.join(output, 'vector-coverage.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
