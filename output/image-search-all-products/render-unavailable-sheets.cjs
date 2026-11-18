const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../../backend/node_modules/sharp');

const directory = __dirname;
const escapeXml = (value) => String(value || '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
})[c]);

async function main() {
  const rows = JSON.parse(await fs.readFile(path.join(directory, 'reviewed-sources.json')))
    .filter((row) => row.sourceReview === 'not_available');
  const sheets = path.join(directory, 'unavailable-sheets');
  await fs.mkdir(sheets, { recursive: true });
  for (let start = 0; start < rows.length; start += 6) {
    const batch = rows.slice(start, start + 6);
    const overlays = [];
    for (const [index, row] of batch.entries()) {
      const left = (index % 2) * 590 + 20;
      const top = Math.floor(index / 2) * 320 + 20;
      const file = path.resolve(directory, '../../backend/training-data/catalog/images', `${row.id}-0.jpg`);
      try {
        overlays.push({ input: await sharp(file).resize(510, 220, { fit: 'contain', background: 'white' }).png().toBuffer(),
          left, top: top + 70 });
      } catch { /* Keep missing image blank. */ }
      const label = `<svg width="560" height="65" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:Arial,sans-serif;fill:#111}</style>
        <text x="2" y="19" font-size="14">${escapeXml(row.id.slice(-8))} | ${escapeXml(row.title.slice(0, 55))}</text>
        <text x="2" y="40" font-size="12">${escapeXml(row.query)} · ${escapeXml(row.sourceStatus)}</text></svg>`;
      overlays.push({ input: Buffer.from(label), left, top });
    }
    await sharp({ create: { width: 1200, height: 970, channels: 3, background: '#e9edf4' } })
      .composite(overlays).jpeg({ quality: 86 }).toFile(path.join(sheets, `sheet-${String(start / 6 + 1).padStart(2, '0')}.jpg`));
  }
  console.log(`Đã tạo ${Math.ceil(rows.length / 6)} tờ kiểm tra ảnh tin chưa có nguồn đối chiếu.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
