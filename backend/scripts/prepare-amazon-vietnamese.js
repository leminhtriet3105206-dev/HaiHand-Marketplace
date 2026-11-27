const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../../output');
const destination = path.join(root, 'amazon-vietnamese-reviewed-plan.json');
const docs = JSON.parse(fs.readFileSync(path.join(root, 'amazon-import-prepared.json'))).documents;
const source = JSON.parse(fs.readFileSync(path.join(root, 'amazon-products-parsed.json'), 'utf8').replace(/^\uFEFF/, ''));
const byAsin = new Map(source.map(row => [row.asin, row]));
const plan = fs.existsSync(destination) ? JSON.parse(fs.readFileSync(destination)) : {};
function category(row) {
  let list; try { list = JSON.parse(row.categories); } catch { list = []; }
  const main = String(list?.[0] || row.root_bs_category || '').toLowerCase();
  const rules = [
    [/clothing|shoes|jewelry|costume/, 'Thời trang & Phụ kiện'], [/pet/, 'Thú cưng & Đồ dùng'],
    [/baby|toys/, 'Đồ chơi, Mẹ & Bé'], [/cell phone/, 'Điện thoại & Phụ kiện'],
    [/electronics|computer|video games|musical instruments|camera/, 'Điện tử & Công nghệ'],
    [/beauty|health|personal care/, 'Sức khỏe & Làm đẹp'], [/sports|outdoors/, 'Thể thao & Dã ngoại'],
    [/automotive|motorcycle/, 'Xe cộ & Phụ tùng'], [/grocery|gourmet/, 'Thực phẩm & Đồ uống'],
    [/books|office|arts, crafts/, 'Sách & Văn phòng phẩm'],
    [/home|kitchen|garden|tools|appliances|industrial/, 'Đồ gia dụng & Nội thất']
  ];
  return rules.find(([regex]) => regex.test(main))?.[1] || 'Linh tinh';
}
async function main() {
  let next = 0, count = 0;
  const pending = docs.filter(doc => !plan[doc._id]);
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < pending.length) {
      const doc = pending[next++], row = byAsin.get(doc.details.asin);
      let error;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const url = new URL('https://translate.googleapis.com/translate_a/single');
          for (const [key, value] of Object.entries({ client: 'gtx', sl: 'en', tl: 'vi', dt: 't', q: row.title })) url.searchParams.set(key, value);
          const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
          if (!response.ok) throw new Error(`Translate HTTP ${response.status}`);
          const data = await response.json();
          const title = data[0].map(part => part[0] || '').join('').trim();
          if (title.length < 4 || !/[À-ỹ]/.test(title)) throw new Error('Missing Vietnamese translation');
          plan[doc._id] = { originalTitle: row.title, title, category: category(row), sourceCategories: row.categories };
          fs.writeFileSync(destination, JSON.stringify(plan, null, 2));
          error = null; break;
        } catch (cause) { error = cause; }
      }
      if (error) { console.error(`${doc._id}: ${row.title}: ${error.message}`); continue; }
      if (++count % 50 === 0) console.log(`Translated ${Object.keys(plan).length}/943`);
    }
  }));
  console.log(JSON.stringify({ count: Object.keys(plan).length, categories: Object.values(plan).reduce((sum, row) => (sum[row.category] = (sum[row.category] || 0) + 1, sum), {}), samples: Object.values(plan).slice(0, 5) }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
