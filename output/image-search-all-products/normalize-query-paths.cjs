const fs = require('node:fs');
const path = require('node:path');

const directory = __dirname;
const reviews = require('./reviewed-sources.json');
const replacements = reviews.filter((row) => row.image?.startsWith('../')).map((row) => {
  const next = `queries/${row.id}${path.extname(row.image)}`;
  fs.copyFileSync(path.resolve(directory, row.image), path.join(directory, next));
  return [row.image, next];
});
const files = [
  'source-picks.json', 'reviewed-sources.json', 'labels-reviewed.json',
  'api-results-before.json', 'api-results-after.json', 'api-results-final.json',
  'pair-scores.json', 'returned-card-grades.json', 'returned-card-grades-final.json',
  'manual-training-pairs.jsonl'
];
for (const name of files) {
  const filename = path.join(directory, name);
  if (!fs.existsSync(filename)) continue;
  let contents = fs.readFileSync(filename, 'utf8');
  for (const [oldPath, newPath] of replacements) contents = contents.replaceAll(oldPath, newPath);
  fs.writeFileSync(filename, contents);
}
console.log(`Đã sao chép và chuẩn hóa ${replacements.length} ảnh truy vấn trong thư mục báo cáo.`);
