require('dotenv').config();

const mongoose = require('mongoose');
const { imageVectorFields } = require('../services/imageVectorIndex');
const { Post } = require('../models/Product');
const { buildProductText, describeImage, embeddings, EMBEDDING_MODEL } = require('../services/chatbotService');
const { embedProductImages, imageAsDataUrl, IMAGE_EMBEDDING_MODEL } = require('../services/imageEmbeddingService');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGO_URI hoặc MONGODB_URI trong backend/.env');

  await mongoose.connect(uri);
  const filter = { status: { $in: ['active', 'APPROVED'] } };
  if (process.env.RAG_IMAGE_MISSING_ONLY === 'true') {
    filter.imageEmbedding = { $exists: false };
  }
  if (process.argv.includes('--missing-multi') || process.env.RAG_MULTI_IMAGE_MISSING_ONLY === 'true') {
    filter['imageEmbeddings.0'] = { $exists: false };
  }
  const products = await Post.find(filter)
    .select('+textEmbedding +embeddingModel +imageEmbedding +imageEmbeddings +imageEmbeddingImages +imageEmbeddingModel title name category condition location description details images')
    .lean();

  const batchSize = 4;
  for (let start = 0; start < products.length; start += batchSize) {
    const prepared = [];
    for (const product of products.slice(start, start + batchSize)) {
      const needsText = !product.textEmbedding?.length || product.embeddingModel !== EMBEDDING_MODEL;
      let imageDescription = '';
      let indexedImages;
      if (needsText && process.env.RAG_INDEX_IMAGES !== 'false') {
        try {
          const image = await imageAsDataUrl(product.images?.[0]);
          if (image) imageDescription = await describeImage(image);
        } catch (error) {
          console.warn(`Không mô tả được ảnh ${product._id}: ${error.message}`);
        }
      }
      if (process.env.RAG_INDEX_IMAGES !== 'false') {
        indexedImages = await embedProductImages(product.images);
      }
      prepared.push({ product, text: needsText ? buildProductText(product, imageDescription) : '', needsText, indexedImages });
    }
    const textItems = prepared.filter((item) => item.needsText);
    let vectors = [];
    if (textItems.length) {
      try {
        vectors = await embeddings.embedDocuments(textItems.map((item) => item.text));
      } catch (error) {
        console.warn(`Không lập được vector văn bản cho nhóm ${start + 1}: ${error.message}`);
      }
    }
    const textVectors = new Map(textItems.map((item, index) => [String(item.product._id), vectors[index]]));
    const updates = prepared.flatMap(({ product, text, needsText, indexedImages }) => {
      const textVector = textVectors.get(String(product._id));
      const fields = needsText && textVector?.length
        ? { ragText: text, textEmbedding: textVector, embeddingModel: EMBEDDING_MODEL }
        : {};
      if (indexedImages) {
        fields.imageEmbedding = indexedImages.centroid;
        fields.imageEmbeddings = indexedImages.vectors;
        fields.imageEmbeddingImages = indexedImages.sources;
        fields.imageEmbeddingModel = IMAGE_EMBEDDING_MODEL;
        Object.assign(fields, imageVectorFields(indexedImages.vectors));
      }
      if (!Object.keys(fields).length) return [];
      return [{ updateOne: { filter: { _id: product._id }, update: { $set: fields } } }];
    });
    if (updates.length) await Post.bulkWrite(updates);
    console.log(`Đã lập embedding ${Math.min(start + prepared.length, products.length)}/${products.length} sản phẩm`);
  }

  console.log(`Hoàn tất text=${EMBEDDING_MODEL}, image=${IMAGE_EMBEDDING_MODEL}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
