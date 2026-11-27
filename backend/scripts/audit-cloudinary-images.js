const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI);
  try {
    const rows = await mongoose.connection.collection('posts').find({}, { projection: { title: 1, name: 1, category: 1, images: 1, image: 1 } }).toArray();
    const host = value => { try { return new URL(value).hostname.toLowerCase(); } catch { return ''; } };
    const missing = [], mixed = [], groups = {};
    for (const row of rows) {
      const urls = Array.isArray(row.images) ? row.images.filter(v => typeof v === 'string' && v.trim()) : [];
      const cloud = urls.filter(url => host(url) === 'res.cloudinary.com');
      const item = { id: String(row._id), title: row.title || row.name, category: row.category, images: urls, legacyImage: row.image };
      if (!cloud.length) {
        missing.push(item);
        const group = groups[row.category] ||= { count: 0, noImages: 0, hosts: {}, examples: [] };
        group.count++;
        if (!urls.length) group.noImages++;
        for (const url of urls) { const name = host(url) || 'invalid/local'; group.hosts[name] = (group.hosts[name] || 0) + 1; }
        if (group.examples.length < 2) group.examples.push({ id: item.id, title: item.title });
      } else if (cloud.length < urls.length) mixed.push(item);
    }
    const summary = { total: rows.length, withoutCloudinary: missing.length, noImages: missing.filter(r => !r.images.length).length, mixed: mixed.length, groups };
    const directory = path.join(__dirname, '../../output/category-audit');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'cloudinary-image-audit.json'), JSON.stringify({ checkedAt: new Date().toISOString(), summary, withoutCloudinary: missing, mixed }, null, 2));
    console.log(JSON.stringify(summary));
  } finally { await mongoose.disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
