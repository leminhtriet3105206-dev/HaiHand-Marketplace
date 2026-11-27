const IMAGE_VECTOR_INDEX = process.env.IMAGE_ENN_INDEX_NAME || process.env.IMAGE_VECTOR_INDEX_NAME || 'product_image_vector_index';
const IMAGE_DIMENSIONS = 768;
const IMAGE_VECTOR_PATHS = Array.from({ length: 5 }, (_, i) => `imageVector${i}`);
const indexDefinition = { fields: [
  ...IMAGE_VECTOR_PATHS.map(path => ({ type: 'vector', path, numDimensions: IMAGE_DIMENSIONS, similarity: 'cosine' })),
  { type: 'filter', path: '_id' }
] };

function imageVectorFields(vectors = []) {
  return Object.fromEntries(IMAGE_VECTOR_PATHS.map((path, i) => {
    const vector = vectors[i];
    if (vector && (vector.length !== IMAGE_DIMENSIONS || !vector.every(Number.isFinite))) {
      throw new Error(`Invalid SigLIP vector at ${path}: expected ${IMAGE_DIMENSIONS} finite numbers`);
    }
    return [path, vector || null];
  }));
}

async function searchImageVectors(Post, queryVector, eligible, minScore, index = IMAGE_VECTOR_INDEX) {
  imageVectorFields([queryVector]);
  if (!eligible.length) return [];
  const ids = eligible.map(product => product._id);
  // Five fixed image slots preserve max-per-image ranking without a second collection to synchronize.
  const idBatches = [];
  for (let offset = 0; offset < ids.length; offset += 500) idBatches.push(ids.slice(offset, offset + 500));
  const batches = [];
  for (const batchIds of idBatches) batches.push(...await Promise.all(IMAGE_VECTOR_PATHS.map((path, slot) => Post.aggregate([
    { $vectorSearch: { index, path, queryVector, exact: true, limit: 20, filter: { _id: { $in: batchIds } } } },
    { $project: { title: 1, name: 1, price: 1, category: 1, location: 1, images: 1,
      description: 1, condition: 1, ragText: 1,
      score: { $meta: 'vectorSearchScore' },
      matchedImage: { $ifNull: [{ $arrayElemAt: ['$imageEmbeddingImages', slot] }, { $arrayElemAt: ['$images', slot] }] } } }
  ]))));
  const best = new Map();
  for (const product of batches.flat()) {
    if (product.score < minScore) continue;
    const id = String(product._id);
    if (!best.has(id) || product.score > best.get(id).score) best.set(id, product);
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, 20);
}
module.exports = { IMAGE_VECTOR_INDEX, IMAGE_VECTOR_PATHS, indexDefinition, imageVectorFields, searchImageVectors };
