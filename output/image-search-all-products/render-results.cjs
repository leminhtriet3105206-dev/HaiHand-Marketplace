const fs = require('node:fs');
const path = require('node:path');

const directory = __dirname;
const review = new Map(JSON.parse(fs.readFileSync(path.join(directory, 'reviewed-sources.json'))).map((row) => [row.id, row]));
const catalog = new Map(JSON.parse(fs.readFileSync(path.join(directory, 'catalog.json'))).map((row) => [row.id, row]));
const resultFile = ['api-results-final.json', 'api-results-after.json', 'api-results.json']
  .find((name) => fs.existsSync(path.join(directory, name)));
const results = JSON.parse(fs.readFileSync(path.join(directory, resultFile)));
const gradeFile = path.join(directory, fs.existsSync(path.join(directory, 'returned-card-grades-final.json'))
  ? 'returned-card-grades-final.json' : 'returned-card-grades.json');
const cardGrades = fs.existsSync(gradeFile) ? JSON.parse(fs.readFileSync(gradeFile)) : null;
const gradeByPair = new Map((cardGrades?.grades || []).map((row) => [`${row.queryId}:${row.returnedId}`, row.grade]));
const html = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const csv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const localCatalogImage = (id, imageUrl) => {
  const index = Math.max(0, catalog.get(id)?.images?.indexOf(imageUrl) ?? -1);
  return `catalog-images/${id}-${index}.jpg`;
};

function productCard(product, targetId) {
  const grade = gradeByPair.get(`${targetId}:${product.id}`);
  const gradeLabel = { same_type: 'Cùng loại vật thể', related: 'Liên quan, khác loại cụ thể',
    wrong_type: 'Sai loại vật thể', wrong_catalog_photo: 'Ảnh catalog sai tên tin', ungradable: 'Không chấm được' }[grade] || 'Chưa chấm';
  return `<article class="result ${html(grade || '')}">
    <img src="${html(localCatalogImage(product.id, product.image))}" alt="Ảnh kết quả ${html(product.title)}">
    <div><b>${product.id === targetId ? 'Trùng ID tin' : 'Tin khác'} · ${html(gradeLabel)}</b>
    <a href="http://localhost:3000/post/${html(product.id)}">${html(product.title)}</a>
    <small>${html(product.id)} · điểm ${Number(product.similarity || 0).toFixed(3)}</small></div>
  </article>`;
}

function caseCard(row, index) {
  const label = review.get(row.id);
  const status = row.status === 'done' ? (row.targetHit ? 'Trả về tin đích' : 'Không trả về tin đích')
    : row.status === 'error' ? 'Lỗi khi chạy' : 'Chưa đánh giá';
  return `<section class="case" id="p-${html(row.id)}">
    <header><h2>${index + 1}. ${html(row.title)}</h2><span class="tag ${html(row.status)}">${html(status)}</span></header>
    <p class="meta">ID: ${html(row.id)} · nguồn: ${html(label.sourceReview)} · ảnh tin: ${html(label.catalogPhotoReview)}
      · ${html(row.elapsedSeconds ?? '—')} giây</p>
    <div class="columns"><div><h3>Ảnh tìm trên mạng</h3>${row.image ? `<img class="query" src="${html(row.image)}" alt="Ảnh truy vấn">` : '<p>Chưa có ảnh đủ tin cậy</p>'}
      ${row.sourceUrl ? `<a href="${html(row.sourceUrl)}">Nguồn ảnh Wikimedia</a>` : ''}</div>
      <div><h3>Ảnh tin trong Atlas</h3><img class="query" src="${html(localCatalogImage(row.id))}" alt="Ảnh tin trong Atlas"></div>
      <div><h3>Kết quả chức năng (${row.products.length})</h3>
      ${row.products.map((product) => productCard(product, row.id)).join('') || '<p>Không có thẻ sản phẩm</p>'}</div></div>
    ${label.catalogReviewNote ? `<p class="issue">Ảnh tin cần sửa: ${html(label.catalogReviewNote)}</p>` : ''}
    ${label.sourceReviewNote ? `<p class="issue">Ảnh tham chiếu bị loại: ${html(label.sourceReviewNote)}</p>` : ''}
    ${row.error ? `<p class="issue">Lỗi: ${html(row.error)}</p>` : ''}
  </section>`;
}

const done = results.filter((row) => row.status === 'done');
const validLabeled = done.filter((row) => review.get(row.id)?.trainingEligible);
const summary = {
  products: results.length,
  sourceVerified: [...review.values()].filter((row) => row.sourceReview === 'object_type_verified').length,
  sourceRejected: [...review.values()].filter((row) => row.sourceReview === 'rejected').length,
  sourceUnavailable: [...review.values()].filter((row) => row.sourceReview === 'not_available').length,
  catalogMismatch: [...review.values()].filter((row) => row.catalogPhotoReview === 'mismatch').length,
  completed: done.length,
  usableEvaluations: done.filter((row) => review.get(row.id)?.evaluationEligible).length,
  pending: results.filter((row) => row.status === 'pending').length,
  errors: results.filter((row) => row.status === 'error').length,
  targetHits: done.filter((row) => row.targetHit).length,
  verifiedLabelCorrect: validLabeled.filter((row) => row.targetHit).length,
  verifiedLabelMissed: validLabeled.filter((row) => !row.targetHit).length,
  invalidCatalogCases: done.filter((row) => review.get(row.id)?.catalogPhotoReview === 'mismatch').length,
  returnedCards: done.reduce((total, row) => total + row.products.length, 0)
};
if (cardGrades) {
  summary.correctObjectCards = cardGrades.summary.same_type || 0;
  summary.relatedCards = cardGrades.summary.related || 0;
  summary.wrongObjectCards = (cardGrades.summary.wrong_type || 0) + (cardGrades.summary.wrong_catalog_photo || 0);
}
const summaryLabels = {
  products: 'Tin đang bán trong Atlas', sourceVerified: 'Ảnh mạng đã xác minh cùng loại vật thể',
  sourceRejected: 'Ảnh mạng bị loại', sourceUnavailable: 'Tin chưa có ảnh mạng đủ tin cậy',
  catalogMismatch: 'Tin có ảnh catalog sai so với tiêu đề', completed: 'Ảnh đã chạy tìm kiếm',
  usableEvaluations: 'Lượt đánh giá có ảnh tham chiếu hợp lệ',
  pending: 'Ảnh chờ chạy', errors: 'Lượt chạy lỗi', targetHits: 'Tổng lượt trả về đúng ID tin',
  verifiedLabelCorrect: 'Đúng ID trong cặp ảnh hợp lệ', verifiedLabelMissed: 'Không thấy ID trong cặp ảnh hợp lệ',
  invalidCatalogCases: 'Lượt chạy trên tin có ảnh catalog sai', returnedCards: 'Tổng số thẻ trả về',
  correctObjectCards: 'Thẻ cùng loại vật thể (chấm bằng ảnh)',
  relatedCards: 'Thẻ liên quan, khác loại cụ thể', wrongObjectCards: 'Thẻ sai loại hoặc ảnh catalog sai'
};
const page = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HaiHand — Đánh giá tìm kiếm bằng ảnh từng sản phẩm</title><style>
*{box-sizing:border-box}body{margin:0;background:#faf8ef;color:#201f1b;font:15px/1.5 system-ui,sans-serif}
body>header{background:#ffd21b;padding:24px max(20px,calc((100vw - 1250px)/2))}h1{margin:0;font-size:28px}main{max-width:1250px;margin:auto;padding:22px 20px 60px}
.summary{border-collapse:collapse;width:100%;background:white;margin:18px 0}.summary th,.summary td{border:1px solid #ddd;padding:9px 14px;text-align:left}.summary th{background:#f4f4f4}
.case{background:white;border:1px solid #e2dfd3;border-radius:10px;padding:18px;margin:16px 0}.case>header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.case h2{margin:0;font-size:18px}.meta{color:#666;font-size:13px}.columns{display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:18px}.columns h3{font-size:14px;margin:0 0 8px}.query{width:100%;height:210px;object-fit:contain;background:#eee;border-radius:6px}.result{display:flex;gap:9px;border:1px solid #ddd;border-left:4px solid #a3a3a3;padding:7px;margin-bottom:7px;border-radius:5px}.result.same_type{border-left-color:#16a34a}.result.related{border-left-color:#d98f00}.result.wrong_type,.result.wrong_catalog_photo{border-left-color:#dc2626}.result img{width:67px;height:60px;object-fit:cover}.result div{display:flex;flex-direction:column}.result small{font-size:11px;color:#777}.result b{font-size:11px}.issue{background:#fff3e0;border-radius:5px;padding:8px 10px}.tag{white-space:nowrap;background:#eee;border-radius:99px;padding:4px 10px;font-size:12px}.tag.done{background:#e5f4e8}.tag.error{background:#fee2e2}a{color:#975100}@media(max-width:800px){.columns{grid-template-columns:1fr}.query{height:180px}}
</style></head><body><header><h1>Đánh giá tìm kiếm bằng ảnh từng sản phẩm</h1><div>HaiHand · 15–16/11/2026 · ảnh tham chiếu từ Wikimedia Commons</div></header><main>
<p>Ảnh mạng được đối chiếu thủ công theo <b>loại vật thể</b>. “Trùng ID tin” chỉ là phép đo truy hồi tin đích, chưa đồng nghĩa mọi thẻ khác đều sai. Tin có ảnh catalog sai được đánh dấu để sửa dữ liệu trước khi huấn luyện.</p>
<table class="summary"><tbody>${Object.entries(summary).map(([key, value]) => `<tr><th>${html(summaryLabels[key])}</th><td>${value}</td></tr>`).join('')}</tbody></table>
${results.map(caseCard).join('\n')}</main></body></html>`;
fs.writeFileSync(path.join(directory, 'image-results.html'), page);
const header = ['product_id', 'title', 'query_image', 'source_url', 'source_review', 'catalog_photo_review', 'catalog_issue',
  'run_status', 'target_hit', 'returned_ids', 'returned_titles', 'elapsed_seconds', 'error'];
const rows = results.map((row) => {
  const label = review.get(row.id);
  return [row.id, row.title, row.image, row.sourceUrl, label.sourceReview, label.catalogPhotoReview,
    label.catalogReviewNote, row.status, row.targetHit ?? '', row.products.map((product) => product.id).join('|'),
    row.products.map((product) => product.title).join('|'), row.elapsedSeconds ?? '', row.error || ''];
});
fs.writeFileSync(path.join(directory, 'image-results.csv'), [header, ...rows].map((row) => row.map(csv).join(',')).join('\r\n'));
const issueRows = [...review.values()].filter((row) => row.catalogPhotoReview === 'mismatch')
  .map((row) => [row.id, row.title, row.catalogReviewNote, row.imageCount, row.sourceUrl]);
fs.writeFileSync(path.join(directory, 'catalog-data-issues.csv'),
  [['product_id', 'title', 'issue', 'image_count', 'query_source_url'], ...issueRows]
    .map((row) => row.map(csv).join(',')).join('\r\n'));
fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
