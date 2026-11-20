const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getRelatedToRecent } = require('../services/recommendationService');

async function testQuery() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('Testing getRelatedToRecent for "thức ăn cho rùa"...');

  const results = await getRelatedToRecent({
    fallbackTitle: 'thức ăn cho rùa',
    fallbackCategory: 'Thú cưng & Đồ dùng',
    limit: 15
  });

  console.log(`Found ${results.length} related items:`);
  results.forEach((r, idx) => {
    console.log(` ${idx + 1}. [${r.category}] "${r.title || r.name}" - Lý do: ${r.recoReason}`);
  });

  await mongoose.disconnect();
}

testQuery().catch(console.error);

