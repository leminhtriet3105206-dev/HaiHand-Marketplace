require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const { describeImage, imageVectorSearch, processImageSearch } = require('../services/chatbotService');

const mimeTypes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function main() {
  const labelsPath = process.argv[2];
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI;
  if (!labelsPath) throw new Error('Dùng: npm run image:eval -- labels.json');
  if (!uri) throw new Error('Thiếu MONGO_URI, MONGODB_URI hoặc MONGODB_ATLAS_URI trong backend/.env');
  const cases = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  if (!Array.isArray(cases) || !cases.length) throw new Error('labels.json phải là mảng không rỗng');

  await mongoose.connect(uri);
  try {
    const results = [];
    for (const entry of cases) {
      if (!entry.image || !Array.isArray(entry.expectedIds)) {
        throw new Error('Mỗi case cần image và expectedIds (mảng rỗng nếu không có sản phẩm đúng)');
      }
      const imagePath = path.resolve(path.dirname(labelsPath), entry.image);
      const mime = mimeTypes[path.extname(imagePath).toLowerCase()];
      if (!mime) throw new Error(`Định dạng ảnh chưa hỗ trợ: ${imagePath}`);
      const image = `data:${mime};base64,${fs.readFileSync(imagePath).toString('base64')}`;
      const description = entry.description || await describeImage(image);
      const products = await imageVectorSearch(image, {}, [entry.message, description].filter(Boolean).join('. '), 0);
      const final = await processImageSearch(image, entry.message || '');
      results.push({
        image: entry.image,
        message: entry.message || '',
        sourceUrl: entry.sourceUrl || '',
        reviewNote: entry.reviewNote || '',
        expectedIds: entry.expectedIds.map(String),
        products: products.map((product) => ({ id: String(product._id), title: product.title || product.name, score: product.score })),
        finalIds: final.products.map((product) => String(product._id)),
        finalProducts: final.products.map((product) => ({ id: String(product._id), title: product.name, image: product.image }))
      });
      console.log(`${entry.image}: ứng viên ${products.slice(0, 5).map((p) => `${p._id} (${p.score.toFixed(3)})`).join(', ') || 'không có'}; cuối cùng ${final.products.map((p) => p._id).join(', ') || 'không có'}`);
    }

    const positives = results.filter((item) => item.expectedIds.length);
    const negatives = results.filter((item) => !item.expectedIds.length);
    const candidateHit = positives.filter((item) => item.products.some((product) => item.expectedIds.includes(product.id))).length;
    const finalHit = positives.filter((item) => item.finalIds.some((id) => item.expectedIds.includes(id))).length;
    const finalFalsePositive = negatives.filter((item) => item.finalIds.length).length;
    const correctCards = results.reduce((total, item) => total + item.finalIds.filter((id) => item.expectedIds.includes(id)).length, 0);
    const wrongCards = results.reduce((total, item) => total + item.finalIds.filter((id) => !item.expectedIds.includes(id)).length, 0);
    const outputPath = path.join(path.dirname(labelsPath), 'image-results.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      summary: { queries: results.length, positiveQueries: positives.length, negativeQueries: negatives.length,
        candidateHit, finalHit, finalFalsePositive, correctCards, wrongCards },
      results
    }, null, 2));
    console.log(`Đã xuất ${outputPath}`);
    console.log(`\nỨng viên: có hàng đúng ${candidateHit}/${positives.length}`);
    console.log(`Kết quả cuối: đúng trong top 5 ${finalHit}/${positives.length}; trả sai khi không có hàng ${finalFalsePositive}/${negatives.length}`);
    console.log(`Thẻ sản phẩm: đúng ${correctCards}, sai ${wrongCards}`);
    for (const item of results) {
      const retrieved = item.products.some((product) => item.expectedIds.includes(product.id));
      const selected = item.finalIds.some((id) => item.expectedIds.includes(id));
      if (item.expectedIds.length && !retrieved) console.log(`Cần cải thiện lấy ứng viên (SigLIP / chỉ mục): ${item.image}`);
      else if (item.expectedIds.length && !selected) console.log(`Cần cải thiện lọc ứng viên (Qwen / rerank): ${item.image}`);
      else if (!item.expectedIds.length && item.finalIds.length) console.log(`Trả sai khi không có hàng: ${item.image}`);
    }
    console.log('\nNgưỡng | Đúng trong top 5 | Trả sai khi không có hàng');
    for (const cutoff of [0.60, 0.65, 0.70, 0.72, 0.75, 0.80, 0.85, 0.90]) {
      const hit = positives.filter((item) => item.products
        .filter((p) => p.score >= cutoff).slice(0, 5)
        .some((p) => item.expectedIds.includes(p.id))).length;
      const falsePositive = negatives.filter((item) => item.products.some((p) => p.score >= cutoff)).length;
      console.log(`${cutoff.toFixed(2)}   | ${hit}/${positives.length}                | ${falsePositive}/${negatives.length}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
