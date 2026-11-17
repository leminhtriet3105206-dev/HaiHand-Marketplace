const fs = require('node:fs');
const path = require('node:path');

const directory = __dirname;
const reviews = require('./reviewed-sources.json');
const catalog = new Map(require('./catalog.json').map((row) => [row.id, row]));
const grades = require('./returned-card-grades.json').grades;
const localImage = (id, imageUrl) => {
  const index = Math.max(0, catalog.get(id)?.images?.indexOf(imageUrl) ?? -1);
  return `catalog-images/${id}-${index}.jpg`;
};
const pairs = [];
for (const row of reviews) {
  if (!row.evaluationEligible) continue;
  pairs.push({ queryImage: row.image, candidateImage: localImage(row.id, catalog.get(row.id)?.firstImage),
    queryId: row.id, candidateId: row.id, label: row.catalogPhotoReview === 'mismatch' ? 'negative' : 'positive',
    labelLevel: 'object_type', source: 'manual_catalog_review', sourceUrl: row.sourceUrl,
    note: row.catalogReviewNote || 'Cùng loại vật thể, chưa xác nhận đúng mẫu hoặc món hàng.' });
}
for (const row of grades) {
  if (row.exactId || row.grade !== 'wrong_type') continue;
  pairs.push({ queryImage: row.queryImage, candidateImage: localImage(row.returnedId, row.returnedImage),
    queryId: row.queryId, candidateId: row.returnedId, label: 'negative', labelLevel: 'object_type',
    source: 'manual_returned_card_review', note: `${row.queryTitle} → ${row.returnedTitle}` });
}
const missing = pairs.filter((row) => !fs.existsSync(path.resolve(directory, row.queryImage))
  || !fs.existsSync(path.resolve(directory, row.candidateImage)));
if (missing.length) throw new Error(`${missing.length} cặp thiếu ảnh; không xuất dữ liệu huấn luyện.`);
fs.writeFileSync(path.join(directory, 'manual-training-pairs.jsonl'), pairs.map((row) => JSON.stringify(row)).join('\n') + '\n');
console.log(JSON.stringify({ pairs: pairs.length, positives: pairs.filter((row) => row.label === 'positive').length,
  negatives: pairs.filter((row) => row.label === 'negative').length }));
