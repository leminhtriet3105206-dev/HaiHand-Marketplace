// Read-only preflight: collect schema, references and exact duplicate removal candidates.
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db;
  const posts = await db.collection('posts').find({}).toArray();
  const groups = new Map();
  const allIds = new Set(posts.map(p => String(p._id)));
  const references = new Map();
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  function scan(value, collection, field = '') {
    if (!value) return;
    if (typeof value === 'string' || value._bsontype === 'ObjectId') {
      const id = String(value);
      if (allIds.has(id)) {
        if (!references.has(id)) references.set(id, new Set());
        references.get(id).add(`${collection}:${field}`);
      }
    } else if (Array.isArray(value)) value.forEach(item => scan(item, collection, field));
    else if (typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if (key !== '_id') scan(item, collection, field ? `${field}.${key}` : key);
    }
  }
  for (const { name } of collections) {
    if (name === 'posts' || name.startsWith('system.')) continue;
    for await (const row of db.collection(name).find({})) scan(row, name);
  }
  for (const row of posts) {
    const image = row.images?.[0];
    if (typeof image !== 'string' || !image.includes('/haihand-demo/product-types/')) continue;
    const key = JSON.stringify([String(row.title || row.name || '').normalize('NFC').trim().toLowerCase(), image]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const candidates = [], preserved = [];
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => Number(references.has(String(b._id))) - Number(references.has(String(a._id))) || String(a._id).localeCompare(String(b._id)));
    preserved.push({ id: String(rows[0]._id), title: rows[0].title, reason: 'representative' });
    for (const row of rows.slice(1)) {
      const refs = references.get(String(row._id));
      if (refs) preserved.push({ id: String(row._id), title: row.title, reason: 'referenced', references: [...refs] });
      else candidates.push({ id: String(row._id), title: row.title, image: row.images[0] });
    }
  }
  const report = { generatedAt: new Date().toISOString(), total: posts.length, collections: collections.map(c => c.name),
    existingFields: [...new Set(posts.flatMap(p => Object.keys(p)))].sort(), categories: [...new Set(posts.map(p => p.category))],
    candidates, preserved };
  const destination = path.join(__dirname, `../../output/amazon-import-preflight-${Date.now()}.json`);
  fs.writeFileSync(destination, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ total: posts.length, duplicateGroups: [...groups.values()].filter(g => g.length > 1).length,
    removableUnreferenced: candidates.length, retainedReferences: preserved.filter(p => p.reason === 'referenced').length,
    categories: report.categories, existingFields: report.existingFields, report: destination }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
