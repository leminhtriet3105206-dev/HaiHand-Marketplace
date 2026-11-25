// Read-only catalog audit. No product records are changed.
const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');

const normalize = value => String(value || '').normalize('NFC').trim().toLocaleLowerCase('vi').replace(/\s+/g, ' ');
function groups(rows, keys) {
  const map = new Map();
  for (const row of rows) for (const key of new Set(keys(row).filter(Boolean))) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map].filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({ key, count: items.length, items }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const raw = await mongoose.connection.db.collection('posts').find({}, { projection: {
    title: 1, name: 1, images: 1, price: 1, location: 1, status: 1, imageSourceHash: 1
  } }).toArray();
  const rows = raw.map(row => ({ id: String(row._id), title: row.title || row.name || '',
    price: row.price, location: row.location, status: row.status,
    images: Array.isArray(row.images) ? row.images.filter(url => typeof url === 'string' && url) : [],
    sourceHash: row.imageSourceHash || '' }));
  const byName = groups(rows, row => [normalize(row.title)]);
  const byImage = groups(rows, row => row.images);
  const byNameAndCover = groups(rows, row => row.images[0] && normalize(row.title)
    ? [JSON.stringify([normalize(row.title), row.images[0]])] : []);
  const bySourceHash = groups(rows, row => [row.sourceHash]);
  const summary = { total: rows.length, nameGroups: byName.length, imageGroups: byImage.length,
    nameAndCoverGroups: byNameAndCover.length,
    affectedByNameAndCover: new Set(byNameAndCover.flatMap(group => group.items.map(row => row.id))).size,
    affectedByImage: new Set(byImage.flatMap(group => group.items.map(row => row.id))).size };
  const report = { generatedAt: new Date().toISOString(), summary, byName, byImage, byNameAndCover, bySourceHash };
  const directory = path.join(__dirname, '../../output');
  fs.mkdirSync(directory, { recursive: true });
  const stem = `duplicate-listings-${Date.now()}`;
  fs.writeFileSync(path.join(directory, stem + '.json'), JSON.stringify(report, null, 2));
  const cell = value => String(value ?? '').replace(/\|/g, '/').replace(/[\r\n]/g, ' ');
  const lines = ['# Danh sách tin đăng trùng', '', `Thời điểm kiểm tra (UTC): ${report.generatedAt}`, '',
    'Chỉ đọc dữ liệu; không xóa hoặc sửa tin. Trùng tên/URL không tự chứng minh hai tin là cùng một giao dịch. Chưa tải ảnh để so sánh pixel.', '',
    '## Tổng hợp', '', '```json', JSON.stringify(summary, null, 2), '```', ''];
  for (const [label, entries] of [['Trùng tên và ảnh bìa', byNameAndCover], ['Trùng tên', byName], ['Trùng URL ảnh bất kỳ', byImage], ['Trùng hash nguồn đã lưu', bySourceHash]]) {
    lines.push(`## ${label}`, '');
    for (const [index, group] of entries.entries()) {
      lines.push(`### ${index + 1}. ${cell(group.items[0].title)} — ${group.count} tin`, '',
        '| ID / mở tin | Tên | Giá | Khu vực | Trạng thái |', '|---|---|---:|---|---|');
      for (const row of group.items) lines.push(`| [${row.id}](http://localhost:3000/post/${row.id}) | ${cell(row.title)} | ${cell(row.price)} | ${cell(row.location)} | ${cell(row.status)} |`);
      lines.push('');
    }
  }
  fs.writeFileSync(path.join(directory, stem + '.md'), lines.join('\n'));
  console.log(JSON.stringify({ summary, report: path.join(directory, stem + '.md'),
    groups: byNameAndCover.map(g => ({ title: g.items[0].title, count: g.count })),
    skirt: byName.filter(g => g.key.includes('chân váy xếp ly')).map(g => ({ count: g.count, items: g.items.map(({ images, sourceHash, ...row }) => row) })) }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
