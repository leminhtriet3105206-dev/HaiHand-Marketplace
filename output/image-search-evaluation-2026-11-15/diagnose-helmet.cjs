const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('../../backend/node_modules/mongoose');
require('../../backend/node_modules/dotenv').config({ path: path.resolve(__dirname, '../../backend/.env') });
const { Post } = require('../../backend/models/Product');
const { embedImage } = require('../../backend/services/imageEmbeddingService');

function similarity(a, b) {
  if (!Array.isArray(b) || a.length !== b.length) return -1;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return (1 + dot / Math.sqrt(normA * normB)) / 2;
}

async function main() {
  const image = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, 'images/bicycle-helmet.png')).toString('base64')}`;
  const vector = await embedImage(image);
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI);
  try {
    const products = await Post.find({ status: { $in: ['active', 'APPROVED'] } })
      .select('title imageEmbedding imageEmbeddings').lean();
    const ranked = products.map((product) => ({
      id: String(product._id),
      title: product.title,
      score: Math.max(...(product.imageEmbeddings?.length ? product.imageEmbeddings : [product.imageEmbedding]).map((item) => similarity(vector, item)))
    })).sort((a, b) => b.score - a.score);
    const target = ranked.findIndex((item) => item.id === '6af173a0c91caafe16621f03');
    console.log(JSON.stringify({ targetRank: target + 1, target: ranked[target], top: ranked.slice(0, 10) }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
