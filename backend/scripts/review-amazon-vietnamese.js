const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../../output');
const file = path.join(root, 'amazon-vietnamese-reviewed-plan.json');
const plan = JSON.parse(fs.readFileSync(file));
const docs = JSON.parse(fs.readFileSync(path.join(root, 'amazon-import-prepared.json'))).documents;
const source = JSON.parse(fs.readFileSync(path.join(root, 'amazon-products-parsed.json'), 'utf8').replace(/^\uFEFF/, ''));
const manual = {
  f3c2ed5c5c9300954d6d9157: ['Quần lửng nữ Lee Flex-to-go dáng rộng có túi hộp', 'Thời trang & Phụ kiện'],
  '1dff4c5b4f1813b66a6e7e06': ['Áo bikini Coco Reef Enrapture dáng quấn, nâng ngực có gọng, cúp C, D, DD, E, F', 'Thời trang & Phụ kiện'],
  '6274bf4b3ff132873ed2c870': ['Giày bốt nam Merrell Moab Adventure Chelsea PLR chống thấm nước', 'Thời trang & Phụ kiện'],
  '4cc6ec09562cda39d9477f93': ['Kìm bấm hạt chặn trang sức Euro Tool Dual Eurocrimper 5¾ inch, PLR-582.00', 'Sách & Văn phòng phẩm']
};
for (const doc of docs) {
  const row = source.find(row => row.asin === doc.details.asin);
  if (manual[doc._id]) plan[doc._id] = { originalTitle: row.title, title: manual[doc._id][0], category: manual[doc._id][1], sourceCategories: row.categories };
  if (row.title === 'Venum Contender 2.0 BJJ Gi') plan[doc._id] = { originalTitle: row.title, title: 'Bộ võ phục Jiu-Jitsu Venum Contender 2.0 BJJ', category: 'Thể thao & Dã ngoại', sourceCategories: row.categories };
  if (row.title === 'FANMATS NFL Mens Man Cave Starter') plan[doc._id] = { originalTitle: row.title, title: 'Thảm trang trí NFL FANMATS Man Cave Starter chống trượt, 19 x 30 inch', category: 'Đồ gia dụng & Nội thất', sourceCategories: row.categories };
  if (row.title === 'Easton Encore Hybrid') plan[doc._id] = { originalTitle: row.title, title: 'Gậy bóng chày Easton Encore Hybrid', category: 'Thể thao & Dã ngoại', sourceCategories: row.categories };
}
for (const item of Object.values(plan)) {
  const cats = JSON.parse(item.sourceCategories || '[]');
  if (cats.includes('Hunting & Fishing')) item.category = 'Thể thao & Dã ngoại';
  if (cats.includes('Household Supplies') || cats.includes('Diffusers') || cats.includes('Office Furniture & Lighting')) item.category = 'Đồ gia dụng & Nội thất';
  if (cats.includes('Office Electronics') || cats.includes('Mouse Pads & Wrist Rests') || cats.includes('CDs & Vinyl')) item.category = 'Điện tử & Công nghệ';
  if (/Safety Vests|Protective Workwear/.test(cats.join('|'))) item.category = 'Thời trang & Phụ kiện';
  if (item.originalTitle.startsWith('Ridgid 62990')) item.title = 'Đầu thông tắc thẳng Ridgid 62990 T-201, 5 inch';
  if (item.originalTitle.startsWith('KASOTT Replacement Airpod')) item.title = 'Nút tai nghe KASOTT bằng mút nhớ thay thế cho AirPods Pro, giảm ồn, chống trượt, cỡ M, 3 đôi';
}
fs.writeFileSync(file, JSON.stringify(plan, null, 2));
console.log(JSON.stringify({count: Object.keys(plan).length, categories: Object.values(plan).reduce((a,x)=>(a[x.category]=(a[x.category]||0)+1,a),{}), uncategorized: Object.entries(plan).filter(([,x])=>x.category==='Linh tinh'), longest: Math.max(...Object.values(plan).map(x=>x.title.length))}, null, 2));
if (Object.keys(plan).length !== 943) process.exitCode = 1;
