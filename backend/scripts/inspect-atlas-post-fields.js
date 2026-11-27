const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value?._bsontype) return value._bsontype;
  return typeof value;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20_000 });
  const posts = mongoose.connection.db.collection('posts');
  const rows = await posts.find({}).toArray();
  const fields = new Map();

  for (const row of rows) {
    for (const [name, value] of Object.entries(row)) {
      if (!fields.has(name)) fields.set(name, { present: 0, types: new Set() });
      const field = fields.get(name);
      field.present++;
      field.types.add(valueType(value));
    }
  }

  const withImages = rows.filter(row => Array.isArray(row.images) && row.images.some(Boolean));
  const withEmbedding = rows.filter(row => Array.isArray(row.imageEmbedding) && row.imageEmbedding.length === 768 && row.imageEmbedding.every(Number.isFinite));
  const withVector = rows.filter(row => Array.isArray(row.imageVector0) && row.imageVector0.length === 768 && row.imageVector0.every(Number.isFinite));
  const matchedSources = rows.filter(row => JSON.stringify(row.images || []) === JSON.stringify(row.imageEmbeddingImages || []));
  const missingEmbedding = withImages.filter(row => !withEmbedding.includes(row));
  const mismatchedSources = withImages.filter(row => !matchedSources.includes(row));

  const report = {
    generatedAt: new Date().toISOString(),
    database: mongoose.connection.db.databaseName,
    collection: 'posts',
    embeddingModel: [...new Set(rows.map(row => row.imageEmbeddingModel).filter(Boolean))],
    summary: {
      totalPosts: rows.length,
      postsWithImages: withImages.length,
      postsWithValid768Embedding: withEmbedding.length,
      postsWithValidAtlasVector0: withVector.length,
      imagesMatchingEmbeddingSources: matchedSources.length,
      postsWithImagesMissingEmbedding: missingEmbedding.length,
      postsWithImagesMismatchedEmbeddingSources: mismatchedSources.length
    },
    fields: [...fields.entries()].map(([name, info]) => ({
      name,
      present: info.present,
      coveragePercent: Number((info.present / rows.length * 100).toFixed(1)),
      types: [...info.types].sort()
    })).sort((a, b) => a.name.localeCompare(b.name)),
    missingEmbedding: missingEmbedding.map(row => ({ id: String(row._id), title: row.title || row.name || '', images: row.images })),
    mismatchedEmbeddingSources: mismatchedSources.map(row => ({ id: String(row._id), title: row.title || row.name || '', images: row.images, imageEmbeddingImages: row.imageEmbeddingImages }))
  };

  const output = path.join(__dirname, '../../output/atlas-post-fields.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ summary: report.summary, embeddingModel: report.embeddingModel, fields: report.fields }, null, 2));
  console.log(`Report: ${output}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
