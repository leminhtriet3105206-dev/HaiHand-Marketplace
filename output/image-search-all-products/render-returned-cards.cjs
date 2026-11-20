const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../../backend/node_modules/sharp');

const directory = __dirname;
const catalog = new Map(require('./catalog.json').map((row) => [row.id, row]));
const escapeXml = (value) => String(value || '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const catalogImage = (id, imageUrl) => {
  const index = Math.max(0, catalog.get(id)?.images?.indexOf(imageUrl) ?? -1);
  return path.resolve(directory, '../../backend/training-data/catalog/images', `${id}-${index}.jpg`);
};

async function main() {
  const rows = JSON.parse(await fs.readFile(path.join(directory, 'api-results-after.json')))
    .filter((row) => row.status === 'done')
    .flatMap((row) => row.products.filter((product) => product.id !== row.id)
      .map((product) => ({ row, product })));
  const folder = path.join(directory, 'returned-card-sheets');
  await fs.mkdir(folder, { recursive: true });
  for (let start = 0; start < rows.length; start += 6) {
    const overlays = [];
    for (const [index, { row, product }] of rows.slice(start, start + 6).entries()) {
      const left = (index % 2) * 600 + 20;
      const top = Math.floor(index / 2) * 330 + 20;
      const label = `<svg width="560" height="70" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:Arial,sans-serif;fill:#111}.small{font-size:12px;fill:#555}</style><text x="2" y="18" font-size="14">${escapeXml(row.title.slice(0, 45))}</text><text x="2" y="38" class="small">→ ${escapeXml(product.title.slice(0, 65))}</text><text x="2" y="56" class="small">ẢNH TRUY VẤN ↓                         ẢNH KẾT QUẢ ↓</text></svg>`;
      overlays.push({ input: Buffer.from(label), left, top });
      for (const [imagePath, x] of [[path.resolve(directory, row.image), left], [catalogImage(product.id, product.image), left + 270]]) {
        try {
          const buffer = await sharp(imagePath).resize(245, 225, { fit: 'contain', background: 'white' }).png().toBuffer();
          overlays.push({ input: buffer, left: x, top: top + 70 });
        } catch { /* A missing source stays blank. */ }
      }
    }
    const filename = `sheet-${String(Math.floor(start / 6) + 1).padStart(2, '0')}.jpg`;
    await sharp({ create: { width: 1200, height: 1010, channels: 3, background: '#e9edf4' } })
      .composite(overlays).jpeg({ quality: 86 }).toFile(path.join(folder, filename));
  }
  console.log(`Đã tạo ${Math.ceil(rows.length / 6)} tờ cho ${rows.length} thẻ khác ID.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
