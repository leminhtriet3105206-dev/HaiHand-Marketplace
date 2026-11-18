const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('../../backend/node_modules/sharp');

const directory = __dirname;
const manifest = path.join(directory, 'source-picks.json');

async function main() {
  const rows = JSON.parse(await fs.readFile(manifest));
  await fs.mkdir(path.join(directory, 'queries'), { recursive: true });
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      if (row.sourceStatus !== 'needs_visual_review' || row.image) continue;
      const destination = path.join(directory, 'queries', `${row.id}.jpg`);
      try {
        const response = await fetch(row.imageUrl, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > 8 * 1024 * 1024) throw new Error('Ảnh quá lớn');
        bytes = await sharp(bytes).rotate().resize(512, 512, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
        await fs.writeFile(destination, bytes);
        row.image = `queries/${row.id}.jpg`;
      } catch (error) {
        row.sourceStatus = 'download_failed';
        row.reviewNote = error.message;
      }
      done++;
      if (done % 15 === 0) console.log(`Đã tải ${done} ảnh; lỗi ${rows.filter((item) => item.sourceStatus === 'download_failed').length}`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  await fs.writeFile(manifest, JSON.stringify(rows, null, 2));
  console.log(`Hoàn tất: ${rows.filter((row) => row.image).length} ảnh tham chiếu, ${rows.filter((row) => row.sourceStatus === 'download_failed').length} lỗi tải.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
