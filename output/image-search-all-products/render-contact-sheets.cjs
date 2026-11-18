const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../../backend/node_modules/sharp');

const directory = __dirname;
const escapeXml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[character]);

async function main() {
  const rows = JSON.parse(await fs.readFile(path.join(directory, 'source-picks.json')))
    .filter((row) => row.image && row.sourceStatus === 'needs_visual_review');
  const sheets = path.join(directory, 'review-sheets');
  await fs.mkdir(sheets, { recursive: true });
  for (let start = 0; start < rows.length; start += 6) {
    const batch = rows.slice(start, start + 6);
    const overlays = [];
    for (const [index, row] of batch.entries()) {
      const left = (index % 2) * 590 + 20;
      const top = Math.floor(index / 2) * 320 + 20;
      const catalogImage = path.resolve(directory, '../../backend/training-data/catalog/images', `${row.id}-0.jpg`);
      for (const [imagePath, x] of [[path.resolve(directory, row.image), left], [catalogImage, left + 270]]) {
        try {
          const buffer = await sharp(imagePath).resize(245, 220, { fit: 'contain', background: 'white' }).png().toBuffer();
          overlays.push({ input: buffer, left: x, top: top + 60 });
        } catch { /* Missing catalog image remains blank in the review sheet. */ }
      }
      const label = `<svg width="560" height="60" xmlns="http://www.w3.org/2000/svg">
        <style>text{font-family:Arial,sans-serif;fill:#111} .small{font-size:12px;fill:#555}</style>
        <text x="2" y="18" font-size="15">${escapeXml(row.id.slice(-8))} | ${escapeXml(row.query.slice(0, 35))}</text>
        <text x="2" y="38" class="small">${escapeXml(row.sourceTitle.slice(0, 72))}</text>
        <text x="2" y="54" class="small">WEB IMAGE ↓                                       ATLAS IMAGE ↓</text>
      </svg>`;
      overlays.push({ input: Buffer.from(label), left, top });
    }
    const number = String(Math.floor(start / 6) + 1).padStart(2, '0');
    await sharp({ create: { width: 1200, height: 970, channels: 3, background: '#e9edf4' } })
      .composite(overlays).jpeg({ quality: 86 }).toFile(path.join(sheets, `sheet-${number}.jpg`));
  }
  console.log(`Đã tạo ${Math.ceil(rows.length / 6)} tờ đối chiếu cho ${rows.length} ảnh.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
