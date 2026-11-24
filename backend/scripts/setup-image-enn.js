require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const { IMAGE_VECTOR_INDEX, IMAGE_VECTOR_PATHS, indexDefinition, imageVectorFields, searchImageVectors } = require('../services/imageVectorIndex');
const model = process.env.IMAGE_EMBEDDING_MODEL || 'Xenova/siglip-base-patch16-224';
async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI);
  try {
    const posts = mongoose.connection.collection('posts');
    if (process.argv.includes('--apply')) {
      const updates = [];
      for await (const row of posts.find({ imageEmbeddingModel: model }, { projection: { imageEmbeddings: 1, imageEmbedding: 1 } })) {
        const vectors = row.imageEmbeddings?.length ? row.imageEmbeddings : row.imageEmbedding?.length ? [row.imageEmbedding] : [];
        updates.push({ updateOne: { filter: { _id: row._id, imageEmbeddingModel: model }, update: { $set: imageVectorFields(vectors) } } });
      }
      if (updates.length) await posts.bulkWrite(updates);
      console.log(`Prepared ${updates.length} product vector records; existing embeddings preserved.`);
      const indexes = await posts.listSearchIndexes(IMAGE_VECTOR_INDEX).toArray();
      if (!indexes.length) await posts.createSearchIndex({ name: IMAGE_VECTOR_INDEX, type: 'vectorSearch', definition: indexDefinition });
      else {
        const existing = indexes[0].latestDefinition;
        const fields = [...existing.fields];
        for (const field of indexDefinition.fields) {
          const match = fields.find(item => item.path === field.path);
          if (match && (match.type !== field.type || (field.type === 'vector' && (match.numDimensions !== 768 || match.similarity !== 'cosine')))) throw new Error(`Conflicting index field ${field.path}`);
          if (!match) fields.push(field);
        }
        if (fields.length !== existing.fields.length) await posts.updateSearchIndex(IMAGE_VECTOR_INDEX, { ...existing, fields });
      }
    }
    console.log(JSON.stringify((await posts.listSearchIndexes(IMAGE_VECTOR_INDEX).toArray()).map(i => ({ name: i.name, status: i.status, queryable: i.queryable }))));
    const sample = await posts.findOne({ imageEmbeddingModel: model, 'imageVector0.0': { $exists: true } });
    if (!sample) throw new Error('No SigLIP vectors ready');
    const results = await searchImageVectors({ aggregate: pipeline => posts.aggregate(pipeline).toArray() }, sample.imageVector0, [sample], 0);
    if (!results.some(row => String(row._id) === String(sample._id) && row.score > 0.999)) throw new Error('Index not ready or self-match failed; rerun after index is READY.');
    const count = await posts.countDocuments({ imageEmbeddingModel: model, 'imageVector0.0': { $exists: true } });
    const total = await posts.countDocuments({});
    const catalog = await posts.find({ imageEmbeddingModel: model, status: { $in: ['active', 'APPROVED'] } },
      { projection: Object.fromEntries(IMAGE_VECTOR_PATHS.map(field => [field, 1])) }).toArray();
    const cosine = (a, b) => (1 + a.reduce((sum, value, i) => sum + value * b[i], 0)
      / (Math.hypot(...a) * Math.hypot(...b))) / 2;
    const query = sample.imageVector0;
    const expected = catalog.flatMap(row => {
      const vectors = IMAGE_VECTOR_PATHS.map(field => row[field]).filter(v => v?.length === 768);
      return vectors.length ? [{ id: String(row._id), score: Math.max(...vectors.map(v => cosine(query, v))) }] : [];
    }).sort((a, b) => b.score - a.score).slice(0, 20);
    const actual = await searchImageVectors({ aggregate: pipeline => posts.aggregate(pipeline).toArray() }, query, catalog, 0);
    if (actual.length !== expected.length || actual.some((row, i) => Math.abs(row.score - expected[i].score) > 1e-5)) {
      throw new Error('Atlas ENN ranking differs from exact cosine baseline');
    }
    console.log(`PASS: top ${actual.length} Atlas scores match local exact multi-image cosine within 1e-5.`);
    console.log(`PASS: Atlas ENN + cosine self-match; ${count}/${total} products have searchable SigLIP vectors, ${IMAGE_VECTOR_PATHS.length} image slots.`);
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
