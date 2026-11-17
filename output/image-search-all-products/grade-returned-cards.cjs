const fs = require('node:fs');
const path = require('node:path');

const directory = __dirname;
const review = new Map(JSON.parse(fs.readFileSync(path.join(directory, 'reviewed-sources.json')))
  .map((row) => [row.id, row]));
const results = JSON.parse(fs.readFileSync(path.join(directory, 'api-results-after.json')));
// Graded by comparing each external query and returned Atlas image in returned-card-sheets/.
// same_type means the main visible object matches. related means a different subtype/accessory.
const manualNonTargetGrades = [
  'wrong_type', 'same_type', 'same_type', 'related', 'related', 'same_type',
  'same_type', 'same_type', 'same_type', 'same_type', 'same_type', 'wrong_type',
  'same_type', 'wrong_type', 'related', 'wrong_type', 'wrong_type', 'wrong_type',
  'related', 'wrong_type', 'wrong_type', 'related', 'same_type', 'wrong_type',
  'wrong_type', 'wrong_type', 'wrong_type', 'same_type', 'wrong_type', 'same_type',
  'same_type', 'same_type', 'related', 'wrong_type', 'wrong_type', 'same_type'
];
const nonTarget = results.filter((row) => row.status === 'done')
  .flatMap((row) => row.products.filter((product) => product.id !== row.id).map((product) => ({ row, product })));
if (nonTarget.length !== manualNonTargetGrades.length) throw new Error('Số thẻ thay đổi; cần chấm lại bằng ảnh.');
const grades = results.filter((row) => row.status === 'done').flatMap((row) => row.products.map((product) => {
  const label = review.get(row.id);
  const nonTargetIndex = nonTarget.findIndex((item) => item.row.id === row.id && item.product.id === product.id);
  const grade = !label.evaluationEligible ? 'ungradable'
    : product.id === row.id ? (label.catalogPhotoReview === 'mismatch' ? 'wrong_catalog_photo' : 'same_type')
      : manualNonTargetGrades[nonTargetIndex];
  return { queryId: row.id, queryTitle: row.title, queryImage: row.image,
    returnedId: product.id, returnedTitle: product.title, returnedImage: product.image,
    exactId: product.id === row.id, grade, catalogPhotoReview: label.catalogPhotoReview };
}));
const counts = grades.reduce((acc, row) => (acc[row.grade] = (acc[row.grade] || 0) + 1, acc), {});
const summary = { totalCards: grades.length, ...counts,
  evaluatedCases: results.filter((row) => row.status === 'done' && review.get(row.id).evaluationEligible).length,
  correctTargetIds: results.filter((row) => row.status === 'done' && review.get(row.id).trainingEligible && row.targetHit).length,
  missedTargetIds: results.filter((row) => row.status === 'done' && review.get(row.id).trainingEligible && !row.targetHit).length };
const csv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const columns = ['queryId', 'queryTitle', 'queryImage', 'returnedId', 'returnedTitle', 'returnedImage', 'exactId', 'grade', 'catalogPhotoReview'];
fs.writeFileSync(path.join(directory, 'returned-card-grades.json'), JSON.stringify({ summary, grades }, null, 2));
fs.writeFileSync(path.join(directory, 'returned-card-grades.csv'), [columns, ...grades.map((row) => columns.map((key) => row[key]))]
  .map((row) => row.map(csv).join(',')).join('\r\n'));
console.log(JSON.stringify(summary));
