require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { describeImage, imageVectorSearch, vectorSearch } = require('../services/chatbotService');

const directory = path.resolve(process.argv[2] || '../output/image-search-all-products');
const cases = JSON.parse(fs.readFileSync(path.join(directory, 'candidate-after.json')))
  .filter((row) => row.targetRank > 5 && row.targetRank <= 20);
const sources = JSON.parse(fs.readFileSync(path.join(directory, 'reviewed-sources.json')));
const output = path.join(directory, 'image-rank-analysis.json');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI;
  if (!uri) throw new Error('Thiếu MongoDB Atlas URI');
  await mongoose.connect(uri);
  const rows = [];
  try {
    for (const row of cases) {
      const source = sources.find((item) => item.id === row.id);
      const imagePath = path.join(directory, source.image);
      const mime = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const image = `data:${mime};base64,${fs.readFileSync(imagePath).toString('base64')}`;
      const description = await describeImage(image);
      const textCandidates = await vectorSearch(description, {});
      const imageCandidates = await imageVectorSearch(image, {});
      rows.push({ id: row.id, title: row.title, description,
        textRank: textCandidates.findIndex((item) => String(item._id) === row.id) + 1,
        imageRank: imageCandidates.findIndex((item) => String(item._id) === row.id) + 1,
        textTop: textCandidates.slice(0, 5).map((item) => ({ id: String(item._id), title: item.title,
          score: item.score, lexical: item.lexical })) });
      fs.writeFileSync(output, JSON.stringify(rows, null, 2));
      console.log(`${rows.length}/${cases.length} ${row.title}: text #${rows.at(-1).textRank}, image #${rows.at(-1).imageRank}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
