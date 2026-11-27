const fs = require('node:fs');
const path = require('node:path');

const directory = path.resolve(process.argv[2] || '../output/image-search-all-products');
const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name)));
const sources = read('reviewed-sources.json');
const catalog = new Map(read('catalog.json').map((row) => [row.id, row]));
const baseline = read('api-results-final.json');
const improved = read(process.argv[3] || 'api-results-v4.json');
const extra = fs.existsSync(path.join(directory, 'returned-card-grades-v3-extra.json'))
  ? read('returned-card-grades-v3-extra.json') : [];
const grades = new Map([...read('returned-card-grades-final.json').grades, ...extra]
  .map((row) => [`${row.queryId}:${row.returnedId}`, row]));
const gradeFor = (queryId, product) => {
  const previous = grades.get(`${queryId}:${product.id}`);
  return previous?.returnedImage === product.image ? previous.grade : 'unreviewed';
};
const byId = new Map(sources.map((row) => [row.id, row]));
const oldById = new Map(baseline.map((row) => [row.id, row]));
const done = improved.filter((row) => row.status === 'done');
const positive = done.filter((row) => byId.get(row.id)?.trainingEligible);
const cards = done.flatMap((row) => row.products.map((product) => ({
  queryId: row.id, product, grade: gradeFor(row.id, product)
})));
const oldCards = done.flatMap((row) => (oldById.get(row.id)?.products || [])
  .map((product) => `${row.id}:${product.id}`));
const newCards = cards.map((row) => `${row.queryId}:${row.product.id}`);
const newSet = new Set(newCards);
const oldSet = new Set(oldCards);
const summary = {
  evaluated: done.length,
  remaining: improved.filter((row) => row.status === 'pending').length,
  errors: improved.filter((row) => row.status === 'error').length,
  positiveCases: positive.length,
  baselinePositiveHits: positive.filter((row) => oldById.get(row.id)?.targetHit).length,
  improvedPositiveHits: positive.filter((row) => row.targetHit).length,
  baselineCards: oldCards.length,
  baselineSameType: oldCards.filter((key) => grades.get(key)?.grade === 'same_type').length,
  baselineRelated: oldCards.filter((key) => grades.get(key)?.grade === 'related').length,
  baselineWrongType: oldCards.filter((key) => ['wrong_type', 'wrong_catalog_photo'].includes(grades.get(key)?.grade)).length,
  improvedCards: cards.length,
  addedCards: newCards.filter((key) => !oldSet.has(key)).length,
  removedCards: oldCards.filter((key) => !newSet.has(key)).length,
  gradedSameType: cards.filter((row) => row.grade === 'same_type').length,
  gradedRelated: cards.filter((row) => row.grade === 'related').length,
  gradedWrongType: cards.filter((row) => row.grade === 'wrong_type' || row.grade === 'wrong_catalog_photo').length,
  unreviewedCards: cards.filter((row) => row.grade === 'unreviewed').length
};
fs.writeFileSync(path.join(directory, 'improvement-summary.json'), JSON.stringify(summary, null, 2));

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const localPhoto = (product) => {
  const index = catalog.get(product.id)?.images?.indexOf(product.image) ?? -1;
  return index >= 0 ? `catalog-images/${product.id}-${index}.jpg` : product.image;
};
const cardHtml = (row, queryId) => {
  const grade = gradeFor(queryId, row);
  return `<div class="card ${escape(grade)}"><img src="${escape(localPhoto(row))}" alt=""><div><b>${escape(row.title)}</b><small>${escape(row.id)} · ${escape(grade)} · ${Number(row.similarity || 0).toFixed(3)}</small></div></div>`;
};
const cases = done.map((row) => {
  const source = byId.get(row.id);
  const old = oldById.get(row.id);
  return `<section><h2>${escape(row.title)} <small>${row.targetHit ? '✓ đúng ID' : '— chưa thấy ID'}</small></h2>
    <div class="images"><figure><img src="${escape(source.image)}" alt=""><figcaption>Ảnh truy vấn${source.sourceUrl ? ` · <a href="${escape(source.sourceUrl)}">Nguồn</a>` : ''}</figcaption></figure>
    <figure><img src="catalog-images/${escape(row.id)}-0.jpg" alt=""><figcaption>Ảnh tin trong Atlas</figcaption></figure></div>
    <div class="results"><div><h3>Trước (${old?.products?.length || 0})</h3>${(old?.products || []).map((product) => cardHtml(product, row.id)).join('') || '<p>Không có thẻ</p>'}</div>
    <div><h3>Sau (${row.products.length})</h3>${row.products.map((product) => cardHtml(product, row.id)).join('') || '<p>Không có thẻ</p>'}</div></div></section>`;
}).join('\n');
const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HaiHand: so sánh tìm kiếm ảnh</title><style>
*{box-sizing:border-box}body{margin:0;background:#faf8ef;color:#202020;font:15px/1.45 system-ui,sans-serif}header{background:#ffd21b;padding:22px max(20px,calc((100vw - 1200px)/2))}main{max-width:1200px;margin:auto;padding:20px}h1{margin:0 0 6px}h2{font-size:19px;margin:0 0 14px}h2 small{font-size:13px;color:#555}h3{font-size:14px;margin:0 0 10px}section{background:white;border:1px solid #ddd;border-radius:10px;padding:20px;margin:18px 0}.summary{display:flex;gap:12px;flex-wrap:wrap}.summary div{background:white;border:1px solid #ddd;padding:10px 14px;border-radius:6px}.images{display:flex;gap:14px}.images figure{margin:0;width:160px}.images img{width:160px;height:130px;object-fit:contain;background:#eee}.images figcaption{font-size:12px;color:#666}.results{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}.card{display:flex;gap:9px;padding:7px;margin:7px 0;border:1px solid #ddd;border-left:4px solid #aaa;border-radius:5px}.card.same_type{border-left-color:#16a34a}.card.related{border-left-color:#d48b00}.card.wrong_type,.card.wrong_catalog_photo{border-left-color:#dc2626}.card img{width:70px;height:64px;object-fit:cover}.card div{min-width:0}.card small{display:block;color:#666;font-size:11px}p{color:#666}@media(max-width:650px){.results{grid-template-columns:1fr}.images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.images figure{width:auto;min-width:0}.images img{width:100%}}
</style></head><body><header><h1>So sánh tìm kiếm ảnh HaiHand</h1><p>Ảnh tham chiếu đã xác minh cùng loại vật thể. Nhãn thẻ giữ từ lần chấm thủ công trước; thẻ mới chưa chấm được ghi “unreviewed”.</p></header><main>
<div class="summary"><div>Đã chạy: ${summary.evaluated}</div><div>Đúng ID trên cặp dương: ${summary.baselinePositiveHits}/${summary.positiveCases} → ${summary.improvedPositiveHits}/${summary.positiveCases}</div><div>Thẻ cùng loại: ${summary.baselineSameType} → ${summary.gradedSameType}</div><div>Thẻ sai loại/ảnh: ${summary.baselineWrongType} → ${summary.gradedWrongType}</div><div>Thẻ mới chưa chấm: ${summary.unreviewedCards}</div></div>
${cases}</main></body></html>`;
fs.writeFileSync(path.join(directory, 'image-results-improved.html'), html);
console.log(summary);
