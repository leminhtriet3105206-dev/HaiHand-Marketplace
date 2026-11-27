const path = require('path');
const sharp = require('sharp');
const { imageVectorFields } = require('./imageVectorIndex');

const IMAGE_EMBEDDING_MODEL = process.env.IMAGE_EMBEDDING_MODEL || 'Xenova/siglip-base-patch16-224';
const IMAGE_EMBEDDING_DTYPE = process.env.IMAGE_EMBEDDING_DTYPE || 'q8';

let runtimePromise;

async function fetchImage(url) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function runtime() {
  if (!runtimePromise) {
    runtimePromise = import('@huggingface/transformers').then(async ({
      env,
      AutoProcessor,
      SiglipVisionModel,
      RawImage
    }) => {
      env.cacheDir = process.env.SIGLIP_CACHE_DIR || path.join(process.cwd(), '.cache', 'huggingface');
      const [processor, model] = await Promise.all([
        AutoProcessor.from_pretrained(IMAGE_EMBEDDING_MODEL),
        SiglipVisionModel.from_pretrained(IMAGE_EMBEDDING_MODEL, { dtype: IMAGE_EMBEDDING_DTYPE })
      ]);
      return { processor, model, RawImage };
    });
  }
  try {
    return await runtimePromise;
  } catch (error) {
    runtimePromise = undefined;
    throw error;
  }
}

function normalize(values) {
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!norm) throw new Error('SigLIP trả về vector rỗng');
  return values.map((value) => value / norm);
}

async function imageAsDataUrl(source) {
  if (!source) return '';
  const dataUrl = typeof source === 'string' && source.match(/^data:image\/[\w.+-]+;base64,(.+)$/s);
  let bytes;
  if (dataUrl) {
    bytes = Buffer.from(dataUrl[1], 'base64');
  } else if (typeof source === 'string' && /^https:\/\//i.test(source)) {
    const response = await fetchImage(source);
    if (!response.ok) throw new Error(`Không tải được ảnh: HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > 5 * 1024 * 1024) throw new Error('Ảnh vượt quá 5 MB');
    bytes = Buffer.from(await response.arrayBuffer());
  } else {
    return '';
  }
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Ảnh vượt quá 5 MB');
  const jpeg = await sharp(bytes).rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

async function embedImage(source) {
  if (!source) throw new Error('Thiếu ảnh để tạo image embedding');
  const { processor, model, RawImage } = await runtime();
  const dataUrl = typeof source === 'string'
    ? source.match(/^data:(image\/[\w.+-]+);base64,(.+)$/s)
    : null;
  let imageSource = source;
  if (dataUrl) {
    imageSource = new Blob([Buffer.from(dataUrl[2], 'base64')], { type: dataUrl[1] });
  } else if (typeof source === 'string' && /^https?:\/\//i.test(source)) {
    const response = await fetchImage(source);
    if (!response.ok) throw new Error(`Không tải được ảnh: HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('Ảnh vượt quá 5 MB');
    const responseType = response.headers.get('content-type') || '';
    imageSource = new Blob([bytes], { type: responseType.startsWith('image/') ? responseType : 'image/jpeg' });
  }
  const image = await RawImage.read(imageSource);
  const inputs = await processor(image);
  const { pooler_output: output } = await model(inputs);
  return normalize(Array.from(output.data, Number));
}

async function indexProductImage(product) {
  const images = await embedProductImages(product?.images);
  product.imageEmbedding = images?.centroid;
  product.imageEmbeddings = images?.vectors;
  product.imageEmbeddingImages = images?.sources;
  product.imageEmbeddingModel = images ? IMAGE_EMBEDDING_MODEL : '';
  Object.assign(product, imageVectorFields(images?.vectors));
  await product.save();
  return Boolean(images);
}

async function embedProductImages(sources = [], embed = embedImage) {
  const vectors = [];
  const indexedSources = [];
  // ponytail: Index five images per listing; raise this only if measurements justify slower uploads.
  for (const source of sources.filter(Boolean).slice(0, 5)) {
    try {
      const vector = await embed(source);
      if (vectors.length && vector.length !== vectors[0].length) continue;
      vectors.push(vector);
      indexedSources.push(source);
    } catch (error) {
      console.warn(`Không nhúng được ảnh sản phẩm: ${error.message}`);
    }
  }
  if (!vectors.length) return null;
  const average = vectors[0].map((_, i) => vectors.reduce((sum, vector) => sum + vector[i], 0));
  const centroid = average.some((value) => value !== 0) ? normalize(average) : vectors[0];
  return { centroid, vectors, sources: indexedSources };
}

module.exports = {
  embedImage,
  imageAsDataUrl,
  embedProductImages,
  indexProductImage,
  IMAGE_EMBEDDING_MODEL
};
