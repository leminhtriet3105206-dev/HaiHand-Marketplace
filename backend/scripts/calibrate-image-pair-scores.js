require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { embedImage } = require('../services/imageEmbeddingService');

const directory = path.resolve(process.argv[2] || '../output/image-search-all-products');
const reviewed = JSON.parse(fs.readFileSync(path.join(directory, 'reviewed-sources.json')))
  .filter((row) => row.sourceReview === 'object_type_verified');
const output = path.join(directory, 'pair-scores.json');
const existing = fs.existsSync(output) ? new Map(JSON.parse(fs.readFileSync(output)).map((row) => [row.id, row])) : new Map();

function similarity(a, b) {
  if (!Array.isArray(b) || a.length !== b.length) return -1;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  return normA && normB ? (1 + dot / Math.sqrt(normA * normB)) / 2 : -1;
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI;
  if (!uri) throw new Error('Thiếu MongoDB Atlas URI');
  await mongoose.connect(uri);
  try {
    const products = await mongoose.connection.db.collection('posts').find(
      { _id: { $in: reviewed.map((row) => new mongoose.Types.ObjectId(row.id)) } },
      { projection: { imageEmbedding: 1, imageEmbeddings: 1 } }
    ).toArray();
    const byId = new Map(products.map((product) => [String(product._id), product]));
    const results = reviewed.map((row) => existing.get(row.id) || {
      id: row.id, title: row.title, image: row.image,
      label: row.catalogPhotoReview === 'appears_match' ? 'match' : 'mismatch', score: null
    });
    for (const [index, row] of results.entries()) {
      if (row.score !== null) continue;
      try {
        const file = path.resolve(directory, row.image);
        const mime = file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        const image = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
        const vector = await embedImage(image);
        const product = byId.get(row.id);
        const candidates = product?.imageEmbeddings?.length ? product.imageEmbeddings : [product?.imageEmbedding];
        row.score = Math.max(...candidates.map((candidate) => similarity(vector, candidate)));
      } catch (error) { row.error = error.message; }
      fs.writeFileSync(output, JSON.stringify(results, null, 2));
      if ((index + 1) % 10 === 0 || index + 1 === results.length) console.log(`Đã đo ${index + 1}/${results.length} cặp ảnh`);
    }
    const valid = results.filter((row) => Number.isFinite(row.score));
    const metrics = (items, threshold) => {
      const tp = items.filter((row) => row.label === 'match' && row.score >= threshold).length;
      const fn = items.filter((row) => row.label === 'match' && row.score < threshold).length;
      const tn = items.filter((row) => row.label === 'mismatch' && row.score < threshold).length;
      const fp = items.filter((row) => row.label === 'mismatch' && row.score >= threshold).length;
      return { tp, fn, tn, fp, balancedAccuracy: ((tp / (tp + fn) || 0) + (tn / (tn + fp) || 0)) / 2 };
    };
    const train = valid.filter((row) => parseInt(row.id.slice(-1), 16) % 5 !== 0);
    const holdout = valid.filter((row) => parseInt(row.id.slice(-1), 16) % 5 === 0);
    const thresholds = Array.from({ length: 41 }, (_, index) => +(0.55 + index * 0.01).toFixed(2));
    const selected = thresholds.map((threshold) => ({ threshold, ...metrics(train, threshold) }))
      .sort((a, b) => b.balancedAccuracy - a.balancedAccuracy || b.threshold - a.threshold)[0];
    const report = {
      samples: valid.length, positives: valid.filter((row) => row.label === 'match').length,
      negatives: valid.filter((row) => row.label === 'mismatch').length,
      currentThreshold: { threshold: 0.72, train: metrics(train, 0.72), holdout: metrics(holdout, 0.72) },
      candidateThreshold: { threshold: selected.threshold, train: metrics(train, selected.threshold),
        holdout: metrics(holdout, selected.threshold) }
    };
    fs.writeFileSync(path.join(directory, 'threshold-calibration.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await mongoose.disconnect(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
