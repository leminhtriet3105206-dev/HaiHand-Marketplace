const fs = require('node:fs');
const path = require('node:path');

const directory = __dirname;
const threshold = 0.78;
const results = JSON.parse(fs.readFileSync(path.join(directory, 'api-results-after.json')));
const filtered = results.map((row) => {
  if (row.status !== 'done') return row;
  const products = row.products.filter((product) => product.similarity >= threshold);
  return { ...row, products, targetHit: products.some((product) => product.id === row.id),
    reply: products.length
      ? `Mình tìm thấy ${products.length} sản phẩm có hình ảnh tương tự. Bạn xem các thẻ bên dưới để kiểm tra chi tiết nhé.`
      : 'Mình chưa tìm thấy sản phẩm cùng loại phù hợp với ảnh bạn gửi trong kho hiện tại.' };
});
fs.writeFileSync(path.join(directory, 'api-results-final.json'), JSON.stringify(filtered, null, 2));
const original = JSON.parse(fs.readFileSync(path.join(directory, 'returned-card-grades.json')));
const retained = new Set(filtered.flatMap((row) => row.products.map((product) => `${row.id}:${product.id}`)));
const grades = original.grades.filter((row) => retained.has(`${row.queryId}:${row.returnedId}`));
const counts = grades.reduce((acc, row) => (acc[row.grade] = (acc[row.grade] || 0) + 1, acc), {});
const review = new Map(JSON.parse(fs.readFileSync(path.join(directory, 'reviewed-sources.json')))
  .map((row) => [row.id, row]));
const summary = { threshold, totalCards: grades.length, ...counts,
  evaluatedCases: filtered.filter((row) => row.status === 'done' && review.get(row.id).evaluationEligible).length,
  correctTargetIds: filtered.filter((row) => row.status === 'done' && review.get(row.id).trainingEligible && row.targetHit).length,
  missedTargetIds: filtered.filter((row) => row.status === 'done' && review.get(row.id).trainingEligible && !row.targetHit).length };
fs.writeFileSync(path.join(directory, 'returned-card-grades-final.json'), JSON.stringify({ summary, grades }, null, 2));
const columns = ['queryId', 'queryTitle', 'queryImage', 'returnedId', 'returnedTitle', 'returnedImage', 'exactId', 'grade', 'catalogPhotoReview'];
const csv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(directory, 'returned-card-grades-final.csv'), [columns, ...grades.map((row) => columns.map((key) => row[key]))]
  .map((row) => row.map(csv).join(',')).join('\r\n'));
console.log(JSON.stringify(summary));
