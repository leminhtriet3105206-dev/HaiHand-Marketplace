require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { imageVectorSearch } = require('../services/chatbotService');

const directory = path.resolve(process.argv[2] || '../output/image-search-all-products');
const output = path.join(directory, process.argv[3] || 'candidate-results.json');
const cases = JSON.parse(fs.readFileSync(path.join(directory, 'reviewed-sources.json')))
  .filter((row) => row.evaluationEligible);
const prior = fs.existsSync(output) ? new Map(JSON.parse(fs.readFileSync(output)).map((row) => [row.id, row])) : new Map();
const results = cases.map((row) => prior.get(row.id) || { id: row.id, title: row.title, status: 'pending' });

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI;
  if (!uri) throw new Error('Thiếu MongoDB Atlas URI');
  await mongoose.connect(uri);
  try {
    for (const [index, row] of results.entries()) {
      if (row.status !== 'pending') continue;
      const source = cases[index];
      const filename = path.resolve(directory, source.image);
      const mime = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const image = `data:${mime};base64,${fs.readFileSync(filename).toString('base64')}`;
      const started = Date.now();
      try {
        const products = await imageVectorSearch(image, {}, '');
        row.status = 'done';
        row.targetRank = products.findIndex((product) => String(product._id) === row.id) + 1;
        row.candidateIds = products.map((product) => String(product._id));
      } catch (error) {
        row.status = 'error';
        row.error = error.message;
      }
      row.elapsedMs = Date.now() - started;
      fs.writeFileSync(output, JSON.stringify(results, null, 2));
      console.log(`${index + 1}/${results.length} ${row.title}: #${row.targetRank || '-'} (${row.elapsedMs}ms)`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
