const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Post } = require('../models/Product');
const root = path.join(__dirname, '../../output');
const preparedPath = path.join(root, 'amazon-import-prepared.json');
const seller = new mongoose.Types.ObjectId('69c2a970e17a085d1f1351b7');
const clean = value => !value || value === 'null' ? '' : String(value).trim();
function category(value) {
  const text = value.toLowerCase();
  const rules = [
    [/pet supplies/, 'Thú cưng & Đồ dùng'], [/baby|toys|games/, 'Đồ chơi, Mẹ & Bé'],
    [/clothing|shoes|jewelry/, 'Thời trang & Phụ kiện'], [/beauty|personal care|health/, 'Sức khỏe & Làm đẹp'],
    [/cell phones/, 'Điện thoại & Phụ kiện'], [/electronics|computers/, 'Điện tử & Công nghệ'],
    [/sports|outdoors/, 'Thể thao & Dã ngoại'], [/automotive/, 'Xe cộ & Phụ tùng'],
    [/grocery|gourmet/, 'Thực phẩm & Đồ uống'], [/books|office products/, 'Sách & Văn phòng phẩm'],
    [/home|kitchen|garden|tools|appliances/, 'Đồ gia dụng & Nội thất']
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] || 'Linh tinh';
}
async function prepare() {
  const rows = JSON.parse(fs.readFileSync(path.join(root, 'amazon-products-parsed.json'), 'utf8').replace(/^\uFEFF/, ''));
  const skipped = [], candidates = [], seen = new Set();
  for (const row of rows) {
    const price = Number(clean(row.final_price).replace(/"/g, ''));
    const title = clean(row.title), asin = clean(row.asin), url = clean(row.image_url);
    const reason = row.currency !== 'USD' ? 'non-USD' : !title || !asin ? 'missing-title-asin' : !Number.isFinite(price) || price <= 0 ? 'missing-price' : !/^https:\/\/(m\.media-amazon\.com|images-na\.ssl-images-amazon\.com)\//.test(url) ? 'missing-image' : seen.has(asin) ? 'duplicate-asin' : '';
    if (reason) { skipped.push({ asin, reason }); continue; }
    seen.add(asin);
    candidates.push({ row, price, title, asin, url });
  }
  let next = 0, checked = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < candidates.length) {
      const item = candidates[next++];
      try {
        const response = await fetch(item.url, { signal: AbortSignal.timeout(20000) });
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('invalid-size');
        item.hash = crypto.createHash('sha256').update(bytes).digest('hex');
      } catch (error) { item.error = error.message; }
      checked++;
      if (checked % 100 === 0) console.log(`Checked images ${checked}/${candidates.length}`);
    }
  }));
  const hashes = new Set(), titles = new Set(), documents = [];
  for (const item of candidates) {
    const { row, price, title, asin, url, hash } = item;
    const nameKey = title.toLowerCase().replace(/\s+/g, ' ');
    const reason = item.error ? 'image-unreachable' : hashes.has(hash) ? 'duplicate-image-content' : titles.has(nameKey) ? 'duplicate-title' : '';
    if (reason) { skipped.push({ asin, reason, error: item.error }); continue; }
    hashes.add(hash); titles.add(nameKey);
    documents.push({ _id: crypto.createHash('sha256').update(`haihand-amazon:${asin}`).digest('hex').slice(0, 24),
      sellerId: String(seller), author: String(seller), name: title, title, sku: `AMAZON-${asin}`,
      price: Math.round(price * 26000), originalPrice: 0, stockQuantity: 1, quantity: 1, soldCount: 0,
      category: category(clean(row.categories)), location: 'Toàn quốc', condition: 'Mới',
      description: `${clean(row.description)}\n\nDữ liệu demo từ Amazon dataset samples. Giá quy đổi minh họa: 1 USD = 26.000 VNĐ; không xác nhận tồn kho thực tế.`,
      images: [url], status: 'active', details: { source: clean(row.url), asin, brand: clean(row.brand),
        originalCurrency: 'USD', originalPrice: String(price), exchangeRate: '26000' },
      imageSourceHash: hash, imageSourceUrl: clean(row.url), imageSourceImage: url,
      ragText: `${title}. ${clean(row.description)}` });
  }
  const report = { sourceRows: rows.length, preparedAt: new Date().toISOString(), documents, skipped };
  fs.writeFileSync(preparedPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ prepared: documents.length, skipped: skipped.reduce((a, x) => (a[x.reason] = (a[x.reason] || 0) + 1, a), {}), path: preparedPath }));
}
async function apply() {
  const prepared = JSON.parse(fs.readFileSync(preparedPath, 'utf8'));
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const db = mongoose.connection.db, posts = db.collection('posts');
  const admin = await db.collection('users').findOne({ _id: seller, username: 'adminne', role: 'Admin' });
  if (!admin) throw new Error('Admin identity mismatch');
  const existing = await posts.find({}).toArray();
  const fields = new Set(existing.flatMap(row => Object.keys(row)));
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(x => x.name).sort();
  const indexes = await posts.listIndexes().toArray();
  const referenced = new Set(), ids = new Set(existing.map(x => String(x._id)));
  function scan(value) {
    if (!value) return;
    if (typeof value === 'string' || value._bsontype === 'ObjectId') { if (ids.has(String(value))) referenced.add(String(value)); }
    else if (Array.isArray(value)) value.forEach(scan);
    else if (typeof value === 'object') for (const [key, child] of Object.entries(value)) if (key !== '_id') scan(child);
  }
  for (const name of names) if (name !== 'posts' && !name.startsWith('system.')) for await (const row of db.collection(name).find({})) scan(row);
  const groups = new Map();
  for (const row of existing) {
    if (!row.images?.[0]?.includes('/haihand-demo/product-types/')) continue;
    const key = JSON.stringify([String(row.title || row.name).trim().toLowerCase(), row.images[0]]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const removed = [];
  for (const rows of groups.values()) {
    rows.sort((a,b) => Number(referenced.has(String(b._id))) - Number(referenced.has(String(a._id))) || String(a._id).localeCompare(String(b._id)));
    removed.push(...rows.slice(1).filter(x => !referenced.has(String(x._id))));
  }
  const stamp = Date.now(), backup = path.join(root, `amazon-migration-backup-${stamp}.ejson`);
  fs.writeFileSync(backup, EJSON.stringify({ posts: existing, indexes, collections: names }, { relaxed: false }));
  const loaded = EJSON.parse(fs.readFileSync(backup, 'utf8'), { relaxed: false });
  if (loaded.posts.length !== existing.length) throw new Error('Backup verification failed');
  const docs = [];
  for (const row of prepared.documents) {
    const prior = existing.find(p => String(p._id) === row._id || p.sku === row.sku);
    if (prior) { if (prior.sku !== row.sku) throw new Error('ID collision'); continue; }
    const doc = { ...row, _id: new mongoose.Types.ObjectId(row._id), sellerId: seller, author: seller, createdAt: new Date(), updatedAt: new Date() };
    for (const field of Object.keys(doc)) if (!fields.has(field)) throw new Error(`New column refused: ${field}`);
    await new Post(doc).validate();
    docs.push(doc);
  }
  // Persist the manifest before mutations for recovery even if interrupted.
  const manifest = { backup, insertedIds: docs.map(d => String(d._id)), deletedIds: removed.map(d => String(d._id)), removed: 0, inserted: 0 };
  const manifestPath = path.join(root, `amazon-migration-result-${stamp}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  if (docs.length) manifest.inserted = (await posts.insertMany(docs, { ordered: true })).insertedCount;
  const insertedCount = await posts.countDocuments({ _id: { $in: docs.map(x => x._id) } });
  if (insertedCount !== docs.length) throw new Error('Insert verification failed; no duplicates deleted');
  for (const row of removed) {
    manifest.removed += (await posts.deleteOne({ _id: row._id, title: row.title, images: row.images, updatedAt: row.updatedAt })).deletedCount;
  }
  const after = (await db.listCollections({}, { nameOnly: true }).toArray()).map(x => x.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(after)) throw new Error('Collection list changed');
  manifest.totalAfter = await posts.countDocuments();
  manifest.retainedReferencedDuplicates = [...groups.values()].reduce((n, rows) => n + rows.slice(1).filter(x => referenced.has(String(x._id))).length, 0);
  manifest.collectionsUnchanged = true;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ...manifest, insertedIds: undefined, deletedIds: undefined, manifestPath }));
}
(process.argv.includes('--apply') ? apply() : prepare()).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
