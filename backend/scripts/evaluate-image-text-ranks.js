require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { describeImage, vectorSearch } = require('../services/chatbotService');

const directory = path.resolve(process.argv[2] || '../output/image-search-all-products');
const results = JSON.parse(fs.readFileSync(path.join(directory, 'api-results-v3.json')))
  .filter((row) => row.status === 'done' && row.products.length);
const output = path.join(directory, 'image-text-ranks.json');
const prior = fs.existsSync(output) ? new Map(JSON.parse(fs.readFileSync(output)).map((row) => [row.id, row])) : new Map();
const rows = [];

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI;
  if (!uri) throw new Error('Thiếu MongoDB Atlas URI');
  await mongoose.connect(uri);
  try {
    for (const row of results) {
      if (prior.has(row.id)) { rows.push(prior.get(row.id)); continue; }
      const imagePath = path.join(directory, row.image);
      const mime = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const image = `data:${mime};base64,${fs.readFileSync(imagePath).toString('base64')}`;
      try {
        const description = await describeImage(image);
        const ranked = await vectorSearch(description, {});
        rows.push({ id: row.id, title: row.title, description,
          returned: row.products.map((product) => ({ id: product.id, title: product.title,
            textRank: ranked.findIndex((item) => String(item._id) === product.id) + 1 })),
          targetTextRank: ranked.findIndex((item) => String(item._id) === row.id) + 1 });
      } catch (error) {
        rows.push({ id: row.id, title: row.title, error: error.message });
      }
      fs.writeFileSync(output, JSON.stringify(rows, null, 2));
      console.log(`${rows.length}/${results.length} ${row.title}: ${rows.at(-1).returned?.map((item) => item.textRank).join(',') || 'lỗi'}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
