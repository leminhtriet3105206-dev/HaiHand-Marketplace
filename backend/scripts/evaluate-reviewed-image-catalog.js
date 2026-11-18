require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { processImageSearch } = require('../services/chatbotService');

const directory = path.resolve(process.argv[2] || '../output/image-search-all-products');
const limit = Number(process.argv[3] || 0);
const selectedIds = new Set((process.argv[5] || '').split(',').filter(Boolean));
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'reviewed-sources.json')));
const output = path.join(directory, process.argv[4] || 'api-results.json');
const prior = fs.existsSync(output) ? new Map(JSON.parse(fs.readFileSync(output)).map((row) => [row.id, row])) : new Map();
const results = manifest.map((row) => prior.get(row.id) || {
  id: row.id, title: row.title, query: row.query, image: row.image, sourceUrl: row.sourceUrl,
  catalogPhotoReview: row.catalogPhotoReview, catalogReviewNote: row.catalogReviewNote,
  status: row.evaluationEligible ? 'pending' : 'skipped', products: []
});

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI;
  if (!uri) throw new Error('Thiếu MongoDB Atlas URI');
  await mongoose.connect(uri);
  try {
    let attempted = 0;
    for (const [index, row] of results.entries()) {
      if (row.status !== 'pending' || (selectedIds.size && !selectedIds.has(row.id))
        || (limit && attempted >= limit)) continue;
      attempted++;
      const started = Date.now();
      try {
        const imagePath = path.resolve(directory, row.image);
        const mime = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        const image = `data:${mime};base64,${fs.readFileSync(imagePath).toString('base64')}`;
        const response = await processImageSearch(image);
        row.status = 'done';
        row.reply = response.reply;
        row.products = response.products.map((product) => ({
          id: String(product._id), title: product.name, category: product.category,
          image: product.image, similarity: product.similarity
        }));
        row.targetHit = row.products.some((product) => product.id === row.id);
      } catch (error) {
        row.status = 'error';
        row.error = error.message;
      }
      row.elapsedSeconds = Math.round((Date.now() - started) / 1000);
      fs.writeFileSync(output, JSON.stringify(results, null, 2));
      console.log(`${index + 1}/${results.length} ${row.id} ${row.status} ${row.targetHit ? 'HIT' : '-'} ${row.products.length} thẻ ${row.elapsedSeconds}s`);
    }
    console.log(JSON.stringify({ done: results.filter((row) => row.status === 'done').length,
      errors: results.filter((row) => row.status === 'error').length,
      remaining: results.filter((row) => row.status === 'pending').length,
      targetHits: results.filter((row) => row.targetHit).length }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
