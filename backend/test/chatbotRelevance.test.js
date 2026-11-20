const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('chatbot only returns products accepted as relevant', async () => {
  const book = { _id: 'book', title: 'Sách thiếu nhi', category: 'Sách & Văn phòng phẩm', score: 0.91 };
  const pen = { _id: 'pen', title: 'Bút bi', category: 'Sách & Văn phòng phẩm', score: 0.89 };
  let call = 0;
  class ChatOpenAI {
    async invoke() {
      return { content: [
        '{"intent":"search_product","semanticQuery":"sách"}',
        '{"indices":[0]}',
        'Mình đã tìm thấy sách phù hợp.'
      ][call++] };
    }
  }
  class OpenAIEmbeddings {
    async embedQuery() { return Array(1024).fill(0); }
  }
  class Message {
    constructor(content) { this.content = content; }
  }
  const Post = { aggregate: async () => [book, pen] };
  const dependencies = {
    '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings },
    '@langchain/core/messages': { HumanMessage: Message, SystemMessage: Message, AIMessage: Message },
    '../models/Product': { Post },
    './imageEmbeddingService': {
      embedImage: async () => { throw new Error('Chatbot không được nhúng ảnh'); },
      imageAsDataUrl: async () => { throw new Error('Chatbot không được đọc ảnh'); }
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  const load = vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`);
  load((name) => dependencies[name], module, { env: {} }, console);

  const result = await module.exports.processChatbot('Tìm sách');
  assert.deepEqual(Array.from(result.products, (product) => product._id), ['book']);
  assert.equal(call, 3);
});

test('vehicle inventory lists complete vehicles and excludes accessories', async () => {
  let modelCalls = 0;
  class ChatOpenAI { async invoke() { modelCalls++; return { content: '' }; } }
  class Model {}
  const rows = [
    { _id: 'wave', title: 'Xe máy Honda Wave Alpha', category: 'Xe cộ & Phụ tùng' },
    { _id: 'bike', title: 'Xe đạp địa hình', category: 'Xe cộ & Phụ tùng' },
    { _id: 'pump', title: 'Bơm lốp ô tô kiêm kích bình xe máy', category: 'Xe cộ & Phụ tùng' },
    { _id: 'helmet', title: 'Mũ bảo hiểm Fullface', category: 'Xe cộ & Phụ tùng' }
  ];
  const query = { select() { return this; }, limit() { return this; }, async lean() { return rows; } };
  const Post = { find: () => query };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => ({
      '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings: Model },
      '@langchain/core/messages': {}, '../models/Product': { Post },
      './imageEmbeddingService': {}
    })[name], module, { env: {} }, console
  );

  const result = await module.exports.processChatbot('Liệt kê các loại xe có tại cửa hàng');
  assert.deepEqual(Array.from(result.products, (product) => product._id), ['wave', 'bike']);
  assert.match(result.reply, /2 tin xe nguyên chiếc/);
  assert.doesNotMatch(result.reply, /Bơm lốp|Mũ bảo hiểm/);
  assert.equal(modelCalls, 0);
});

test('chatbot answer cannot deny a product already selected from Atlas', async () => {
  let call = 0;
  class ChatOpenAI { async invoke() { return { content: [
    '{"intent":"search_product","semanticQuery":"bút bi"}',
    '{"indices":[0]}',
    'Hiện tại không có sản phẩm bút bi.'
  ][call++] }; } }
  class OpenAIEmbeddings { async embedQuery() { return [1, 0]; } }
  class Message { constructor(content) { this.content = content; } }
  const Post = { aggregate: async () => [{ _id: 'pen', title: 'Bút bi Thiên Long',
    price: 20000, location: 'Hà Nội', textEmbedding: [1, 0], embeddingModel: 'bge-m3' }] };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => ({ '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings },
      '@langchain/core/messages': { HumanMessage: Message, SystemMessage: Message, AIMessage: Message },
      '../models/Product': { Post }, './imageEmbeddingService': {} })[name],
    module, { env: {} }, console
  );
  const result = await module.exports.processChatbot('Tìm bút bi');
  assert.deepEqual(Array.from(result.products, (product) => product._id), ['pen']);
  assert.match(result.reply, /Mình tìm thấy Bút bi Thiên Long/);
  assert.doesNotMatch(result.reply, /không có sản phẩm/);
});

test('policy answers use the published support hours', async () => {
  let calls = 0;
  class ChatOpenAI { async invoke() {
    calls++;
    return { content: '{"intent":"policy"}' };
  } }
  class Model {}
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => ({ '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings: Model },
      '@langchain/core/messages': {}, '../models/Product': { Post: {} },
      './imageEmbeddingService': {} })[name], module, { env: {} }, console
  );
  const result = await module.exports.processChatbot('CSKH làm việc mấy giờ?');
  assert.match(result.reply, /8h00 đến 21h00/);
  assert.equal(result.products.length, 0);
  assert.equal(calls, 1);
});

test('image search reranks every product image and rejects weak matches', async () => {
  let pipeline;
  const Post = { aggregate: async (stages) => {
    pipeline = stages;
    return [
      { _id: 'wrong', images: ['wrong.jpg'], imageEmbedding: [0, 1], score: 0.9 },
      { _id: 'right', images: ['cover.jpg', 'match.jpg'], imageEmbedding: [0.7, 0.7],
        imageEmbeddings: [[0, 1], [1, 0]], imageEmbeddingImages: ['cover.jpg', 'match.jpg'], score: 0.8 }
    ];
  } };
  class Model {}
  const dependencies = {
    '@langchain/openai': { ChatOpenAI: Model, OpenAIEmbeddings: Model },
    '@langchain/core/messages': {},
    '../models/Product': { Post },
    './imageEmbeddingService': { embedImage: async () => [1, 0], IMAGE_EMBEDDING_MODEL: 'siglip-test' }
  };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => dependencies[name], module, { env: { IMAGE_SEARCH_MIN_SCORE: '0.72' } }, console
  );

  const products = await module.exports.imageVectorSearch('image', {});
  assert.deepEqual(Array.from(products, (product) => product._id), ['right']);
  assert.equal(products[0].matchedImage, 'match.jpg');
  assert.equal(products[0].score, 1);
  assert.equal(pipeline[0].$match.imageEmbeddingModel, 'siglip-test');
  assert.deepEqual(Array.from(pipeline[0].$match.status.$in), ['active', 'APPROVED']);
});

test('product image index keeps successful images and their sources aligned', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/imageEmbeddingService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    require, module, { env: {} }, { warn() {} }
  );
  const indexed = await module.exports.embedProductImages(['bad', 'a.jpg', 'b.jpg'], async (source) => {
    if (source === 'bad') throw new Error('bad image');
    return source === 'a.jpg' ? [1, 0] : [0, 1];
  });
  assert.deepEqual(Array.from(indexed.sources), ['a.jpg', 'b.jpg']);
  assert.equal(indexed.vectors.length, 2);
  assert.ok(Math.abs(indexed.centroid[0] - Math.SQRT1_2) < 1e-9);
});

test('candidate image URLs are converted to base64 for the local vision model', async () => {
  const webp = await require('sharp')({ create: { width: 2, height: 2, channels: 3, background: '#ff0000' } })
    .webp().toBuffer();
  const source = fs.readFileSync(path.join(__dirname, '../services/imageEmbeddingService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console, fetch, AbortSignal, Buffer) { ${source}\n })`)(
    require, module, { env: {} }, console,
    async () => ({ ok: true, headers: { get: () => null },
      arrayBuffer: async () => webp.buffer.slice(webp.byteOffset, webp.byteOffset + webp.byteLength) }),
    { timeout: () => undefined }, Buffer
  );
  const result = await module.exports.imageAsDataUrl('https://res.cloudinary.com/example.jpg');
  assert.match(result, /^data:image\/jpeg;base64,\/9j\//);
});

test('image search failure does not return unverified text matches', async () => {
  let aggregateCalls = 0;
  class ChatOpenAI {
    async invoke() { return { content: '{"intent":"search_product","semanticQuery":"áo"}' }; }
  }
  class OpenAIEmbeddings {}
  class Message { constructor(content) { this.content = content; } }
  const dependencies = {
    '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings },
    '@langchain/core/messages': { HumanMessage: Message, SystemMessage: Message, AIMessage: Message },
    '../models/Product': { Post: { aggregate: async () => { aggregateCalls++; return []; } } },
    './imageEmbeddingService': { embedImage: async () => { throw new Error('index unavailable'); },
      imageAsDataUrl: async (source) => source, IMAGE_EMBEDDING_MODEL: 'siglip-test' }
  };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => dependencies[name], module, { env: {} }, { warn() {} }
  );
  const result = await module.exports.processImageSearch('data:image/png;base64,AAAA', 'Tìm áo');
  assert.equal(result.products.length, 0);
  assert.match(result.reply, /chưa thể tìm kiếm bằng ảnh/);
  assert.equal(aggregateCalls, 0);
});

test('exact image scan rescues a product with a weak image centroid', async () => {
  let pipeline;
  const Post = { aggregate: async (stages) => {
    pipeline = stages;
    return [
      { _id: 'bird', imageEmbedding: [0, 1], images: ['bird.jpg'] },
      { _id: 'chicken', imageEmbedding: [0.7, 0.7], imageEmbeddings: [[0, 1], [1, 0]],
        imageEmbeddingImages: ['cover.jpg', 'chicken.jpg'], images: ['cover.jpg', 'chicken.jpg'] }
    ];
  } };
  class ChatOpenAI {}
  class OpenAIEmbeddings { async embedQuery() { return [0, 1]; } }
  const dependencies = {
    '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings },
    '@langchain/core/messages': {},
    '../models/Product': { Post },
    './imageEmbeddingService': { embedImage: async () => [1, 0],
      imageAsDataUrl: async (source) => source, IMAGE_EMBEDDING_MODEL: 'siglip-test' }
  };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => dependencies[name], module, { env: { IMAGE_SEARCH_MIN_SCORE: '0.72' } }, console
  );

  const products = await module.exports.imageVectorSearch('image', {}, 'gà trống');
  assert.ok(pipeline[0].$match);
  assert.deepEqual(Array.from(products, (product) => product._id), ['chicken']);
  assert.equal(products[0].matchedImage, 'chicken.jpg');
});

test('reviewed bad catalog photos stay out of image search until replaced', async () => {
  class Model {}
  const bad = { _id: 'bad', title: 'Giày thể thao', images: ['wrong.jpg'], imageEmbedding: [1, 0] };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  let products = [bad];
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => ({ '@langchain/openai': { ChatOpenAI: Model, OpenAIEmbeddings: Model },
      '@langchain/core/messages': {}, '../models/Product': { Post: { aggregate: async () => products } },
      '../data/image-search-bad-photos.json': [{ id: 'bad', firstImage: 'wrong.jpg' }],
      './imageEmbeddingService': { embedImage: async () => [1, 0], IMAGE_EMBEDDING_MODEL: 'siglip-test' }
    })[name], module, { env: {} }, console
  );
  assert.equal((await module.exports.imageVectorSearch('query.jpg', {})).length, 0);
  products = [{ ...bad, images: ['replacement.jpg'] }];
  assert.equal((await module.exports.imageVectorSearch('query.jpg', {})).length, 1);
});

test('explicit object in text and image excludes a wrong-category product', async () => {
  const calls = [];
  class ChatOpenAI {
    async invoke(messages) {
      calls.push(messages);
      return { content: ['gà trống', '{"intent":"search_product","semanticQuery":"gà giống"}', '{"indices":[0]}'][calls.length - 1] };
    }
  }
  class OpenAIEmbeddings { async embedQuery() { return [1, 0]; } }
  class Message { constructor(content) { this.content = content; } }
  const dependencies = {
    '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings },
    '@langchain/core/messages': { HumanMessage: Message, SystemMessage: Message, AIMessage: Message },
    '../models/Product': { Post: { aggregate: async () => [{ _id: 'bird', title: 'Chào mào đại bàng',
      imageEmbedding: [1, 0], images: ['bird.jpg'] }] } },
    './imageEmbeddingService': { embedImage: async () => [1, 0],
      imageAsDataUrl: async (source) => source, IMAGE_EMBEDDING_MODEL: 'siglip-test' }
  };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => dependencies[name], module, { env: {} }, console
  );

  const image = 'data:image/png;base64,AAAA';
  const result = await module.exports.processImageSearch(image, 'tìm gà giống v');
  assert.equal(result.products.length, 0);
  assert.match(result.reply, /chưa tìm thấy/);
  assert.equal(calls.length, 2);
});

test('image search keeps user wording and shows candidate images to the visual reviewer', async () => {
  const calls = [];
  class ChatOpenAI {
    async invoke(messages) {
      calls.push(messages);
      return { content: ['gà trống màu vàng', '{"intent":"search_product","semanticQuery":"gà giống"}', '{"indices":[0,1,2]}'][calls.length - 1] };
    }
  }
  class OpenAIEmbeddings { async embedQuery() { throw new Error('Image search should not need text embeddings'); } }
  class Message { constructor(content) { this.content = content; } }
  const candidateImage = 'https://res.cloudinary.com/test/image/upload/chicken.jpg';
  const dependencies = {
    '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings },
    '@langchain/core/messages': { HumanMessage: Message, SystemMessage: Message, AIMessage: Message },
    '../models/Product': { Post: { aggregate: async () => [
      { _id: 'chicken', title: 'Gà giống', imageEmbedding: [1, 0], images: [candidateImage] },
      { _id: 'junk', title: 'qwfqfq', imageEmbedding: [1, 0], images: ['junk.jpg'] },
      { _id: 'junk2', title: 'd ạdaoidkapdla', imageEmbedding: [1, 0], images: ['junk2.jpg'] }
    ] } },
    './imageEmbeddingService': { embedImage: async () => [1, 0],
      imageAsDataUrl: async (source) => source === candidateImage ? 'data:image/jpeg;base64,BBBB' : source,
      IMAGE_EMBEDDING_MODEL: 'siglip-test' }
  };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => dependencies[name], module, { env: {} }, console
  );

  const image = 'data:image/png;base64,AAAA';
  const result = await module.exports.processImageSearch(image, 'tìm gà giống v');
  assert.deepEqual(Array.from(result.products, (product) => product._id), ['chicken']);
  assert.match(calls[2][1].content.content[0].text, /tìm gà giống v.*gà trống màu vàng/);
  const reviewImages = calls[2][1].content.content.filter((part) => part.type === 'image_url');
  assert.deepEqual(Array.from(reviewImages, (part) => part.image_url.url), [image, 'data:image/jpeg;base64,BBBB']);
});

test('image-only search uses the visual description without a second intent call', async () => {
  let modelCalls = 0;
  class ChatOpenAI {
    async invoke() { modelCalls++; return { content: 'đèn bàn' }; }
  }
  class OpenAIEmbeddings { async embedQuery() { return [1, 0]; } }
  class Message { constructor(content) { this.content = content; } }
  const dependencies = {
    '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings },
    '@langchain/core/messages': { HumanMessage: Message, SystemMessage: Message, AIMessage: Message },
    '../models/Product': { Post: { aggregate: async () => [] } },
    './imageEmbeddingService': { embedImage: async () => [1, 0],
      imageAsDataUrl: async (source) => source, IMAGE_EMBEDDING_MODEL: 'siglip-test' }
  };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => dependencies[name], module, { env: {} }, console
  );

  const result = await module.exports.processImageSearch('data:image/png;base64,AAAA');
  assert.equal(modelCalls, 1);
  assert.equal(result.products.length, 0);
});

test('image search applies the calibrated return score after visual review', async () => {
  let calls = 0;
  class ChatOpenAI {
    async invoke() { return { content: ++calls === 1 ? 'chuột máy tính' : '{"indices":[0,1]}' }; }
  }
  class OpenAIEmbeddings { async embedQuery() { return [1, 0]; } }
  class Message { constructor(content) { this.content = content; } }
  const Post = { aggregate: async () => [
    { _id: 'strong', title: 'Chuột không dây', imageEmbedding: [0.6, 0.8], images: ['strong.jpg'] },
    { _id: 'weak', title: 'Chuột có dây', imageEmbedding: [0.5, 0.866], images: ['weak.jpg'] }
  ] };
  const dependencies = {
    '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings },
    '@langchain/core/messages': { HumanMessage: Message, SystemMessage: Message, AIMessage: Message },
    '../models/Product': { Post },
    './imageEmbeddingService': { embedImage: async () => [1, 0],
      imageAsDataUrl: async (source) => source, IMAGE_EMBEDDING_MODEL: 'siglip-test' }
  };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => dependencies[name], module,
    { env: { IMAGE_SEARCH_MIN_SCORE: '0.72', IMAGE_SEARCH_RETURN_MIN_SCORE: '0.78' } }, console
  );
  const result = await module.exports.processImageSearch('data:image/png;base64,AAAA');
  assert.deepEqual(Array.from(result.products, (product) => product._id), ['strong']);
});

test('chatbot ranks exact product words and filters price before scoring', async () => {
  let pipeline;
  class Model {}
  class OpenAIEmbeddings { async embedQuery() { return [1, 0]; } }
  const Post = { aggregate: async (stages) => {
    pipeline = stages;
    return [
      { _id: 'wrong', title: 'Máy ảnh Canon', textEmbedding: [1, 0], embeddingModel: 'bge-m3' },
      { _id: 'right', title: 'Máy lạnh Daikin', textEmbedding: [0, 1], embeddingModel: 'bge-m3' }
    ];
  } };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => ({
      '@langchain/openai': { ChatOpenAI: Model, OpenAIEmbeddings },
      '@langchain/core/messages': {}, '../models/Product': { Post },
      './imageEmbeddingService': {}
    })[name], module, { env: {} }, console
  );
  const products = await module.exports.vectorSearch('máy lạnh Daikin', { maxPrice: 5000000, location: 'Hà Nội' });
  assert.deepEqual(Array.from(products, (product) => product._id), ['right', 'wrong']);
  assert.equal(pipeline[0].$match.price.$lte, 5000000);
  assert.equal(pipeline[0].$match.location.$regex, 'Hà Nội');
  assert.deepEqual(Array.from(pipeline[0].$match.status.$in), ['active', 'APPROVED']);
});

test('image reviewer cannot select a product whose photo failed to load', async () => {
  let review;
  class ChatOpenAI { async invoke(messages) {
    review = messages;
    return { content: '{"indices":[0,1]}' };
  } }
  class Model {}
  class Message { constructor(content) { this.content = content; } }
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => ({
      '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings: Model },
      '@langchain/core/messages': { HumanMessage: Message, SystemMessage: Message, AIMessage: Message },
      '../models/Product': { Post: {} },
      './imageEmbeddingService': { imageAsDataUrl: async (image) => {
        if (image === 'broken.jpg') throw new Error('404');
        return image;
      } }
    })[name], module, { env: {} }, { warn() {} }
  );
  const products = await module.exports.filterRelevantProducts([
    { _id: 'missing', title: 'Ảnh hỏng', matchedImage: 'broken.jpg' },
    { _id: 'visible', title: 'Ảnh thật', matchedImage: 'visible.jpg' }
  ], 'tìm sản phẩm', 'query.jpg');
  assert.deepEqual(Array.from(products, (product) => product._id), ['visible']);
  const names = JSON.parse(review[1].content.content[0].text).candidates.map((item) => item.name);
  assert.deepEqual(Array.from(names), ['Ảnh thật']);
});

test('editing a product refreshes its text vector and preserves the image description', async () => {
  let saved = 0;
  class Model {}
  class OpenAIEmbeddings { async embedDocuments(texts) {
    assert.match(texts[0], /Đặc điểm từ hình ảnh: màu đỏ/);
    assert.match(texts[0], /Tên: Áo mới/);
    return [[1, 0]];
  } }
  const product = { _id: 'shirt', title: 'Áo mới', ragText: 'Tên: Áo cũ\nĐặc điểm từ hình ảnh: màu đỏ',
    async save() { saved++; } };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => ({
      '@langchain/openai': { ChatOpenAI: Model, OpenAIEmbeddings },
      '@langchain/core/messages': {}, '../models/Product': { Post: {} },
      './imageEmbeddingService': {}
    })[name], module, { env: {} }, console
  );
  await module.exports.refreshProductSearch(product, false);
  assert.equal(saved, 1);
  assert.equal(product.embeddingModel, 'bge-m3');
  assert.match(product.ragText, /Áo mới/);
});

test('new product text vector describes its current photo', async () => {
  class ChatOpenAI { async invoke() { return { content: 'giày màu xanh' }; } }
  class OpenAIEmbeddings { async embedDocuments(texts) {
    assert.match(texts[0], /Đặc điểm từ hình ảnh: giày màu xanh/);
    return [[1, 0]];
  } }
  const product = { _id: 'shoe', title: 'Giày thể thao', images: ['new.jpg'],
    async save() {} };
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => ({
      '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings },
      '@langchain/core/messages': { HumanMessage: class { constructor(content) { this.content = content; } },
        SystemMessage: class { constructor(content) { this.content = content; } } },
      '../models/Product': { Post: {} },
      './imageEmbeddingService': { indexProductImage: async () => {},
        imageAsDataUrl: async (image) => image }
    })[name], module, { env: {} }, console
  );
  await module.exports.refreshProductSearch(product);
  assert.match(product.ragText, /giày màu xanh/);
});

test('failed refresh clears stale search vectors', async () => {
  const cleared = [];
  class Model {}
  class OpenAIEmbeddings { async embedDocuments() { throw new Error('offline'); } }
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => ({
      '@langchain/openai': { ChatOpenAI: Model, OpenAIEmbeddings },
      '@langchain/core/messages': {},
      '../models/Product': { Post: { updateOne: async (_filter, change) => { cleared.push(change.$unset); } } },
      './imageEmbeddingService': { indexProductImage: async () => { throw new Error('offline'); } }
    })[name], module, { env: {} }, { warn() {} }
  );
  await module.exports.refreshProductSearch({ _id: 'shoe', images: [] });
  assert.equal(cleared.length, 2);
  assert.ok('imageEmbedding' in cleared[0]);
  assert.ok('textEmbedding' in cleared[1]);
});

test('image search removes a visual match outside the text top ten', async () => {
  let calls = 0;
  class ChatOpenAI { async invoke() {
    return { content: ++calls === 1 ? 'đèn pin' : '{"indices":[0,1]}' };
  } }
  class OpenAIEmbeddings { async embedQuery() { return [1, 0]; } }
  class Message { constructor(content) { this.content = content; } }
  const imageCandidates = [
    { _id: 'flashlight', title: 'Đèn pin', imageEmbedding: [1, 0], images: ['flashlight.jpg'] },
    { _id: 'pan', title: 'Chảo chống dính', imageEmbedding: [1, 0], images: ['pan.jpg'] }
  ];
  const textCandidates = [
    { _id: 'flashlight', title: 'Đèn pin', textEmbedding: [1, 0], embeddingModel: 'bge-m3' },
    ...Array.from({ length: 10 }, (_, index) => ({ _id: `other${index}`, title: 'Đèn pin',
      textEmbedding: [1, 0], embeddingModel: 'bge-m3' }))
  ];
  const source = fs.readFileSync(path.join(__dirname, '../services/chatbotService.js'), 'utf8');
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, process, console) { ${source}\n })`)(
    (name) => ({
      '@langchain/openai': { ChatOpenAI, OpenAIEmbeddings },
      '@langchain/core/messages': { HumanMessage: Message, SystemMessage: Message, AIMessage: Message },
      '../models/Product': { Post: { aggregate: async (pipeline) =>
        pipeline[0].$match.imageEmbeddingModel ? imageCandidates : textCandidates } },
      './imageEmbeddingService': { embedImage: async () => [1, 0],
        imageAsDataUrl: async (image) => image, IMAGE_EMBEDDING_MODEL: 'siglip-test' }
    })[name], module, { env: {} }, console
  );
  const result = await module.exports.processImageSearch('query.jpg');
  assert.deepEqual(Array.from(result.products, (product) => product._id), ['flashlight']);
});
