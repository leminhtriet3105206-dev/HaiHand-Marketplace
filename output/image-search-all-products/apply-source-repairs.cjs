const fs = require('node:fs');
const path = require('node:path');

const manifest = path.join(__dirname, 'source-picks.json');
const rows = JSON.parse(fs.readFileSync(manifest));
const candidates = JSON.parse(fs.readFileSync(path.join(__dirname, 'commons-search.json')));
const repairs = {
  '8ab31e7f': ['dog', 4],
  '8ab32650': ['high heels', 1],
  'd474dc87': ['shirt', 3],
  'd474e844': ['daikin air conditioner', 1],
  'ef3af603': ['textile roller machine', 0],
  'ef3b0637': ['Router', 3],
  '8017e838': ['lighter', 1],
  '9e8f5109': ['massage chair', 4],
  '16621efd': ['dog kibble food', 0],
  '16621f02': ['dog food bowl', 3],
  '16621f06': ['wireless earbuds', 1],
  '9bb40e91': ['fishing rod', 1],
  '9bb40e94': ['baby stroller', 5],
  '9bb40e95': ['Lego toys', 0],
  '9bb40e9e': ['wireless earbuds', 1],
  '9bb40eae': ['air fryer', 3],
  '9bb40eb0': ['computer desk', 0]
};
let changed = 0;
for (const row of rows) {
  const repair = repairs[row.id.slice(-8)];
  if (!repair) continue;
  const [query, index] = repair;
  const choice = candidates[query]?.[index];
  if (!choice) throw new Error(`Thiếu ảnh thay thế: ${row.id} ${query}/${index}`);
  row.image = '';
  row.imageUrl = choice.imageUrl;
  row.sourceUrl = choice.sourceUrl;
  row.sourceTitle = choice.title;
  row.sourceStatus = 'needs_visual_review';
  row.lookupQuery = query;
  changed++;
}
fs.writeFileSync(manifest, JSON.stringify(rows, null, 2));
console.log(`Đã chọn lại ${changed} ảnh nguồn.`);
