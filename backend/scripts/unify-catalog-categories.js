const mongoose = require('mongoose');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const aliases = {
  'Thời trang': 'Thời trang & Phụ kiện',
  'Nhà cửa & Đời sống': 'Đồ gia dụng & Nội thất',
  'Mẹ & Bé': 'Đồ chơi, Mẹ & Bé',
  'Thể thao & Du lịch': 'Thể thao & Dã ngoại',
  'Điện tử & Phụ kiện': 'Điện tử & Công nghệ',
};
const groups = {
  'Xe cộ & Phụ tùng': ['69dccb35295b6e59ef3b0511', '69dcccdb295b6e59ef3b072d', '6af17dbc2e06332d9bb40e8a'],
  'Điện thoại & Phụ kiện': ['69dccaa8295b6e59ef3b043a'],
  'Đồ gia dụng & Nội thất': ['69dcca28295b6e59ef3b034e', '69d875b2a937bd538ab32315', '69dcb7d0e8f5f531d474e844', '69d87648a937bd538ab3237f', '69d876d9a937bd538ab323ed', '69d870f5a937bd538ab31eeb', '69dcc997295b6e59ef3b0272', '69de0fb63e4ad1438017e72f', '69d8750fa937bd538ab32274', '69dcc334295b6e59ef3afc9e'],
  'Điện tử & Công nghệ': ['69dcc199295b6e59ef3afa5c', '6af17dc02e06332d9bb40ea3'],
  'Sức khỏe & Làm đẹp': ['69de24957a871f2c9e8f5109'],
  'Sách & Văn phòng phẩm': ['69d87366a937bd538ab320db', '6af17dbe2e06332d9bb40e9b'],
  'Linh tinh': ['69dcc258295b6e59ef3afb4a'],
};
async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI);
  try {
    const posts = mongoose.connection.collection('posts');
    const rows = await posts.find({}, { projection: { title: 1, category: 1 } }).toArray();
    const overrides = new Map(Object.entries(groups).flatMap(([category, ids]) => ids.map(id => [id, category])));
    const changes = rows.flatMap(row => {
      let target = overrides.get(String(row._id)) || aliases[row.category] || row.category;
      if (row.category === 'Điện tử & Phụ kiện' && /^(Cáp Sạc|Sạc Dự Phòng|Củ Sạc)/iu.test(row.title || '')) target = 'Điện thoại & Phụ kiện';
      return target === row.category ? [] : [{ id: String(row._id), title: row.title, before: row.category, after: target }];
    });
    console.log(JSON.stringify({ changes: changes.length, destinations: changes.reduce((out, c) => { out[c.after] = (out[c.after] || 0) + 1; return out; }, {}) }));
    if (!process.argv.includes('--apply')) return;
    const dir = path.join(__dirname, '../../output/category-audit');
    fs.mkdirSync(dir, { recursive: true });
    const backup = path.join(dir, `changes-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify(changes, null, 2));
    console.log(`Backup: ${backup}`);
    for (const c of changes) {
      const result = await posts.updateOne({ _id: new mongoose.Types.ObjectId(c.id), category: c.before }, { $set: { category: c.after } });
      if (result.matchedCount !== 1) throw new Error(`Concurrent category change: ${c.id}`);
    }
    const after = await posts.find({}, { projection: { category: 1 } }).toArray();
    const lookup = new Map(after.map(row => [String(row._id), row.category]));
    if (after.length !== rows.length || changes.some(c => lookup.get(c.id) !== c.after)) throw new Error('Verification failed');
    console.log(`PASS: ${changes.length} category updates; ${after.length} products preserved.`);
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
