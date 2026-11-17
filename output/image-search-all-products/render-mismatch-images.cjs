const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../../backend/node_modules/sharp');

const directory = __dirname;
const rows = require('./reviewed-sources.json').filter((row) => row.catalogPhotoReview === 'mismatch');
const catalog = new Map(require('./catalog.json').map((row) => [row.id, row]));
const escapeXml = (value) => String(value || '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function main() {
  const folder = path.join(directory, 'catalog-mismatch-sheets');
  await fs.mkdir(folder, { recursive: true });
  for (let start = 0; start < rows.length; start += 4) {
    const overlays = [];
    for (const [index, row] of rows.slice(start, start + 4).entries()) {
      const left = (index % 2) * 710 + 20;
      const top = Math.floor(index / 2) * 470 + 20;
      const label = `<svg width="680" height="55" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:Arial,sans-serif;fill:#111}</style><text x="2" y="20" font-size="15">${escapeXml(row.id.slice(-8))} | ${escapeXml(row.title.slice(0, 62))}</text><text x="2" y="42" font-size="12">${escapeXml(row.catalogReviewNote.slice(0, 85))}</text></svg>`;
      overlays.push({ input: Buffer.from(label), left, top });
      for (let i = 0; i < (catalog.get(row.id)?.images?.length || 0); i++) {
        const imagePath = path.resolve(directory, '../../backend/training-data/catalog/images', `${row.id}-${i}.jpg`);
        const x = left + (i % 3) * 220;
        const y = top + 55 + Math.floor(i / 3) * 190;
        try {
          const buffer = await sharp(imagePath).resize(205, 165, { fit: 'contain', background: 'white' }).png().toBuffer();
          overlays.push({ input: buffer, left: x, top: y });
          const number = `<svg width="210" height="20" xmlns="http://www.w3.org/2000/svg"><text x="4" y="15" font-family="Arial" font-size="12">Ảnh ${i + 1}</text></svg>`;
          overlays.push({ input: Buffer.from(number), left: x, top: y + 165 });
        } catch { /* Missing image remains blank. */ }
      }
    }
    const filename = `sheet-${String(Math.floor(start / 4) + 1).padStart(2, '0')}.jpg`;
    await sharp({ create: { width: 1440, height: 970, channels: 3, background: '#e9edf4' } })
      .composite(overlays).jpeg({ quality: 86 }).toFile(path.join(folder, filename));
  }
  console.log(`Đã tạo ${Math.ceil(rows.length / 4)} tờ cho ${rows.length} tin có ảnh bìa bị nghi sai.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
