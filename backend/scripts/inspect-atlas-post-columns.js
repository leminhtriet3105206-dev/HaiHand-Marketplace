const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20_000 });
  const posts = mongoose.connection.db.collection('posts');
  const total = await posts.countDocuments();
  const model = process.env.IMAGE_EMBEDDING_MODEL || 'Xenova/siglip-base-patch16-224';
  const validEmbedding = {
    'imageVector0.767': { $exists: true },
    imageEmbeddingModel: model
  };
  const embedded = await posts.countDocuments(validEmbedding);
  const missing = await posts.find(
    { $nor: [validEmbedding] },
    { projection: { title: 1, images: 1, imageEmbeddingModel: 1 } }
  ).toArray();
  const fields = await posts.aggregate([
    { $project: { kv: { $objectToArray: '$$ROOT' } } },
    { $unwind: '$kv' },
    { $group: { _id: '$kv.k', types: { $addToSet: { $type: '$kv.v' } }, present: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();
  const imageRows = await posts.find({}, {
    projection: {
      title: 1, images: 1, imageEmbeddingImages: 1,
      imageVector0: 1, imageVector1: 1, imageVector2: 1,
      imageVector3: 1, imageVector4: 1
    }
  }).toArray();
  const imageAudit = imageRows.map(row => {
    const expected = (row.images || []).filter(Boolean).slice(0, 5);
    const indexed = row.imageEmbeddingImages || [];
    const vectors = [0, 1, 2, 3, 4]
      .map(index => row[`imageVector${index}`])
      .filter(vector => Array.isArray(vector) && vector.length === 768 && vector.every(Number.isFinite));
    return {
      id: String(row._id), title: row.title,
      expected: expected.length, indexed: indexed.length, vectors: vectors.length,
      sourcesMatch: JSON.stringify(expected) === JSON.stringify(indexed)
    };
  });
  const fullyEmbedded = imageAudit.filter(row =>
    row.sourcesMatch && row.expected === row.vectors && row.expected > 0
  );
  const incompleteImages = imageAudit.filter(row =>
    !row.sourcesMatch || row.expected !== row.vectors || row.expected === 0
  );
  const sample = await posts.findOne(validEmbedding, {
    projection: {
      title: 1, name: 1, category: 1, images: 1,
      imageEmbeddingModel: 1, imageEmbeddingImages: 1,
      imageVector0: { $slice: 3 }
    }
  });
  const report = {
    database: mongoose.connection.db.databaseName,
    collection: 'posts',
    total,
    embedded,
    missingCount: missing.length,
    missing: missing.map(row => ({
      id: String(row._id), title: row.title,
      imageCount: row.images?.length || 0,
      model: row.imageEmbeddingModel || ''
    })),
    fields: fields.map(field => ({
      field: field._id, types: field.types,
      present: field.present,
      coverage: Number((field.present / total * 100).toFixed(1))
    })),
    imageCoverage: {
      expectedImageSlots: imageAudit.reduce((sum, row) => sum + row.expected, 0),
      indexedImageSources: imageAudit.reduce((sum, row) => sum + row.indexed, 0),
      validImageVectors: imageAudit.reduce((sum, row) => sum + row.vectors, 0),
      fullyEmbeddedProducts: fullyEmbedded.length,
      incompleteProducts: incompleteImages.length,
      incomplete: incompleteImages.slice(0, 20)
    },
    sample: {
      ...sample,
      _id: String(sample._id),
      imageVector0: {
        dimensions: 768,
        first3Values: sample.imageVector0
      }
    }
  };
  console.log(JSON.stringify(process.argv.includes('--summary') ? {
    database: report.database,
    collection: report.collection,
    total: report.total,
    embedded: report.embedded,
    missingCount: report.missingCount,
    imageCoverage: report.imageCoverage
  } : report, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
