require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const { processChatbot } = require('../services/chatbotService');

const cases = [
  ['Tìm bút bi Thiên Long', '69d86fcaa937bd538ab31df7'],
  ['Có máy lạnh Daikin không?', '69dcb7d0e8f5f531d474e844'],
  ['Tìm bộ định tuyến TP-Link Archer C50', '69dccbdd295b6e59ef3b0637'],
  ['Tìm vợt Yonex Astrox 88D Pro', '6af17dbb2e06332d9bb40e89'],
  ['Có Samsung Galaxy S23 Ultra 256GB không?', '6af17dbf2e06332d9bb40e9d'],
  ['Tìm màn hình Dell UltraSharp U2422H', '6af17dc12e06332d9bb40eaa'],
  ['Tìm máy hút bụi Electrolux màu đỏ', '69dcc997295b6e59ef3b0272'],
  ['Tôi muốn mua sofa cũ màu xám lông chuột', '69dcb5e5e8f5f531d474e535'],
  ['HaiHand có hỗ trợ thanh toán COD không?', null],
  ['Tôi có thể khiếu nại trong bao lâu sau khi nhận hàng?', null]
];

const output = path.resolve(process.argv[2] || '../output/image-search-all-products/chatbot-results.json');
const prior = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output)) : [];
const results = cases.map(([question, expectedId], index) => prior[index]?.question === question
  ? prior[index] : { question, expectedId, status: 'pending' });

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI;
  if (!uri) throw new Error('Thiếu MongoDB Atlas URI');
  await mongoose.connect(uri);
  try {
    for (const [index, row] of results.entries()) {
      if (row.status !== 'pending') continue;
      const started = Date.now();
      try {
        const response = await processChatbot(row.question);
        row.status = 'done';
        row.reply = response.reply;
        row.products = response.products.map((product) => ({ id: String(product._id), title: product.name }));
        row.targetHit = row.expectedId ? row.products.some((product) => product.id === row.expectedId) : null;
      } catch (error) {
        row.status = 'error';
        row.error = error.message;
      }
      row.elapsedSeconds = Math.round((Date.now() - started) / 1000);
      fs.writeFileSync(output, JSON.stringify(results, null, 2));
      console.log(`${index + 1}/${results.length} ${row.status} ${row.targetHit === null ? 'policy' : row.targetHit ? 'HIT' : '-'} ${row.elapsedSeconds}s`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
