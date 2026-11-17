const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const labels = JSON.parse(fs.readFileSync(path.join(dir, 'labels.json'), 'utf8'));
const before = JSON.parse(fs.readFileSync(path.join(dir, 'image-results-before.json'), 'utf8'));
const after = JSON.parse(fs.readFileSync(path.join(dir, 'image-results.json'), 'utf8'));
const manifest = fs.readFileSync(path.join(dir, '../../backend/training-data/catalog/manifest.jsonl'), 'utf8')
  .trim().split(/\r?\n/).map(JSON.parse);
const titleById = new Map(manifest.map((item) => [item.productId, item.title]));
const html = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const csv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function productCard(product, expectedIds) {
  const correct = expectedIds.includes(product.id);
  const localImage = `images/catalog-${product.id}.jpg`;
  const image = fs.existsSync(path.join(dir, localImage)) ? `<img src="${localImage}" alt="Ảnh tin ${html(product.title)}">` : '';
  return `<div class="product ${correct ? 'correct' : 'wrong'}">${image}<div><strong>${correct ? '✓ Đúng' : '✕ Sai'}</strong><a href="http://localhost:3000/post/${html(product.id)}">${html(product.title || titleById.get(product.id) || product.id)}</a><small>${html(product.id)}</small></div></div>`;
}

function caseCard(label, index) {
  const old = before.results[index];
  const current = after.results[index];
  const expected = label.expectedIds.map((id) => productCard({ id, title: titleById.get(id) }, label.expectedIds)).join('');
  const returned = current.finalProducts.length
    ? current.finalProducts.map((item) => productCard(item, label.expectedIds)).join('')
    : `<p class="empty">${label.expectedIds.length ? 'Không trả sản phẩm — bỏ sót' : 'Không trả sản phẩm — đúng vì không có hàng'}</p>`;
  const oldNames = old.finalProducts.length ? old.finalProducts.map((item) => html(item.title)).join('; ') : 'Không có';
  return `<section class="case">
    <h2>${index + 1}. ${html(label.message)}</h2>
    <div class="columns">
      <div><h3>Ảnh truy vấn</h3><img class="query" src="${html(label.image)}" alt="${html(label.message)}"><p><a href="${html(label.sourceUrl)}">Nguồn ảnh</a></p></div>
      <div><h3>Tin đúng theo nhãn</h3>${expected || '<p>Không có sản phẩm phù hợp</p>'}</div>
      <div><h3>Kết quả sau chỉnh sửa</h3>${returned}</div>
    </div>
    <p class="previous"><b>Trước chỉnh sửa:</b> ${oldNames}</p>
    ${label.reviewNote ? `<p class="note"><b>Cần xem dữ liệu:</b> ${html(label.reviewNote)}</p>` : ''}
  </section>`;
}

const summary = `<table><thead><tr><th>Chỉ số</th><th>Trước</th><th>Sau</th></tr></thead><tbody>
  <tr><td>Truy vấn có ít nhất một tin đúng</td><td>${before.summary.finalHit}/${before.summary.positiveQueries}</td><td>${after.summary.finalHit}/${after.summary.positiveQueries}</td></tr>
  <tr><td>Thẻ sản phẩm đúng</td><td>${before.summary.correctCards}</td><td>${after.summary.correctCards}</td></tr>
  <tr><td>Thẻ sản phẩm sai</td><td>${before.summary.wrongCards}</td><td>${after.summary.wrongCards}</td></tr>
  <tr><td>Trả hàng sai khi không có hàng</td><td>${before.summary.finalFalsePositive}/${before.summary.negativeQueries}</td><td>${after.summary.finalFalsePositive}/${after.summary.negativeQueries}</td></tr>
</tbody></table>`;

const page = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HaiHand — Kết quả tìm sản phẩm bằng ảnh</title><style>
  *{box-sizing:border-box}body{margin:0;background:#fffbeb;color:#1c1917;font:15px/1.5 Inter,system-ui,sans-serif}header{background:#facc15;padding:26px max(24px,calc((100vw - 1180px)/2))}h1{font-size:28px;margin:0}main{max-width:1180px;margin:auto;padding:28px 20px 60px}a{color:#a74600}table{border-collapse:collapse;width:100%;background:white;margin:16px 0 26px}th,td{text-align:left;border:1px solid #e7e5e4;padding:10px 14px}th{background:#f5f5f4}.case{background:white;border:1px solid #e7e5e4;border-radius:12px;padding:22px;margin:20px 0}.case h2{font-size:20px;margin:0 0 16px}.case h3{font-size:14px;margin:0 0 10px}.columns{display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px}.query{width:100%;height:210px;object-fit:contain;background:#f5f5f4;border-radius:8px}.product{display:flex;gap:10px;border:1px solid #e7e5e4;border-left:4px solid #16a34a;border-radius:8px;padding:8px;margin:0 0 8px;min-height:70px}.product.wrong{border-left-color:#dc2626}.product img{width:72px;height:64px;object-fit:cover;border-radius:4px}.product div{display:flex;flex-direction:column;gap:2px}.product strong{font-size:12px}.product.correct strong{color:#166534}.product.wrong strong{color:#b91c1c}.product small{color:#78716c;word-break:break-all}.previous,.note{background:#f5f5f4;padding:10px 12px;border-radius:6px;margin:14px 0 0}.note{background:#fff7ed}.empty{color:#57534e}@media(max-width:760px){.columns{grid-template-columns:1fr}.query{height:180px}}
  </style></head><body><header><h1>Kết quả tìm sản phẩm bằng hình ảnh</h1><div>HaiHand · 7 ảnh truy vấn ngoài catalog · 15/11/2026</div></header><main>
  <p>Ảnh truy vấn được chọn thủ công từ Wikimedia Commons. “Đúng” nghĩa là ảnh và loại sản phẩm phù hợp; nhãn chưa xác thực mẫu mã hoặc tình trạng thực tế của món hàng. Đây là bộ kiểm thử nhỏ để phát hiện lỗi, không phải số đo độ chính xác chung của hệ thống.</p>
  <p>Mỗi cột là một lần chạy. Bộ lọc cũ cũng từng đạt 5/6 ở lần thử khác, nên chênh lệch 4/6 → 5/6 ở đây chưa chứng minh mức cải thiện ổn định. Ảnh truy vấn là ảnh chụp thumbnail của trang tìm kiếm, độ phân giải thấp.</p>
  ${summary}
  <p><b>Vấn đề dữ liệu:</b> tin mũ bảo hiểm xe đạp có ảnh người lái xe máy; tin Twitter Mantis ghi xe đạp địa hình nhưng ảnh là xe đường phố. Cần ảnh thật đúng sản phẩm và lập chỉ mục lại trước khi dùng hai tin đó để huấn luyện.</p>
  ${labels.map(caseCard).join('\n')}
  </main></body></html>`;
fs.writeFileSync(path.join(dir, 'image-results.html'), page);

const rows = [['image', 'message', 'expected_ids', 'before_ids', 'after_ids', 'after_correct_cards', 'after_wrong_cards', 'review_note']];
labels.forEach((label, index) => {
  const ids = after.results[index].finalIds;
  rows.push([label.image, label.message, label.expectedIds.join('|'), before.results[index].finalIds.join('|'), ids.join('|'),
    ids.filter((id) => label.expectedIds.includes(id)).length, ids.filter((id) => !label.expectedIds.includes(id)).length, label.reviewNote || '']);
});
fs.writeFileSync(path.join(dir, 'image-results.csv'), rows.map((row) => row.map(csv).join(',')).join('\r\n'), 'utf8');
console.log('Created image-results.html and image-results.csv');
