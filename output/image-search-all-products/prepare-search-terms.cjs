const fs = require('node:fs');
const path = require('node:path');

const directory = __dirname;
const catalog = JSON.parse(fs.readFileSync(path.join(directory, 'catalog.json'), 'utf8'));
const overrides = [
  [/^(d ạdaoidkapdla|qwfqfq|1241241414|test$)/i, ''],
  [/^nhà đẹp hxh/i, 'nhà phố'],
  [/^vỏ si chất lượng/i, 'vỏ xe máy'],
  [/^cá tây tượng/i, 'cá tai tượng'],
  [/^đồng hồ đo ampe/i, 'đồng hồ đo ampe'],
  [/^trục lăn xả vải/i, 'trục lăn xả vải'],
  [/^xe sh125i/i, 'xe máy Honda SH'],
  [/^wave$/i, 'xe máy Honda Wave'],
  [/^vf3 cũ/i, 'ô tô VinFast VF3'],
  [/^samsum$/i, 'điện thoại Samsung'],
  [/^lababu$/i, 'đồ chơi Labubu'],
  [/^đầm$/i, 'váy nữ'],
  [/^pet$/i, 'thú cưng'],
  [/^chào mào đại bàng/i, 'chim chào mào'],
  [/^dép tổ ong/i, 'dép nhựa'],
  [/^gọng kính/i, 'gọng kính mắt'],
  [/^đồng hồ omaga/i, 'đồng hồ Omega'],
  [/^đồng hồ 3 kim/i, 'đồng hồ đeo tay'],
  [/^đồng hồ treo tường/i, 'đồng hồ treo tường'],
  [/^đồng hồ nam/i, 'đồng hồ đeo tay'],
  [/^đồng hồ đeo tay/i, 'đồng hồ đeo tay'],
  [/^nón full face/i, 'mũ bảo hiểm xe máy'],
  [/^mũ bảo hiểm fullface/i, 'mũ bảo hiểm xe máy'],
  [/^mũ bảo hiểm xe đạp/i, 'mũ bảo hiểm xe đạp'],
  [/^nón lưỡi trai/i, 'mũ lưỡi trai'],
  [/^nón trơn/i, 'mũ lưỡi trai'],
  [/^trái banh/i, 'quả bóng'],
  [/^thức ăn hỗn hợp/i, 'thức ăn cho rùa'],
  [/^bộ 10 cuốn truyện/i, 'truyện tranh thiếu nhi'],
  [/^bộ xếp hình lego/i, 'đồ chơi Lego'],
  [/^gấu bông capybara/i, 'gấu bông capybara'],
  [/^bộ cần câu/i, 'cần câu'],
  [/^bộ tạ tay/i, 'tạ tay'],
  [/^bàn bóng bàn/i, 'bàn bóng bàn'],
  [/^bàn làm việc gaming/i, 'bàn làm việc'],
  [/^bàn học lười/i, 'bàn học'],
  [/^quây cũi/i, 'quây cũi cho bé'],
  [/^xe chòi chân/i, 'xe chòi chân cho bé']
];
const englishOverrides = [
  [/^bàn phím không dây/i, 'wireless computer keyboard'],
  [/^máy quạt cầm tay/i, 'handheld fan'],
  [/^máy quạt$/i, 'electric fan'],
  [/^sofa cũ/i, 'sofa'],
  [/^chào mào/i, 'red whiskered bulbul bird'],
  [/^rồng nam mỹ/i, 'green iguana'],
  [/^gà đá/i, 'rooster'],
  [/^trục lăn xả vải/i, 'industrial fabric roller'],
  [/^máy gaming đồ họa/i, 'desktop gaming computer'],
  [/^chén làm bánh bèo/i, 'ceramic bowl'],
  [/^vỏ si chất lượng/i, 'motorcycle tire'],
  [/^thức ăn cho rùa/i, 'turtle food'],
  [/^thức ăn cho cún/i, 'dog food'],
  [/^thức ăn cho chó mèo/i, 'pet food'],
  [/^sách đắt nhân tâm/i, 'self help book'],
  [/^cá tây tượng/i, 'giant gourami fish'],
  [/^chuồng nuôi chuột/i, 'hamster cage'],
  [/^xe đạp địa hình/i, 'mountain bicycle'],
  [/^xe đạp địa$/i, 'mountain bicycle'],
  [/^trái banh/i, 'soccer ball'],
  [/^bình nước thể thao/i, 'sports water bottle'],
  [/^bát ăn đôi/i, 'pet feeding bowl'],
  [/^khóa dây số/i, 'bicycle cable lock'],
  [/^củ sạc nhanh/i, 'phone charger'],
  [/^xe chòi chân/i, 'toddler ride on toy'],
  [/^sạc dự phòng/i, 'power bank'],
  [/^ốp lưng chống sốc/i, 'phone case'],
  [/^đồng hồ thông minh/i, 'smartwatch'],
  [/^bơm lốp ô tô/i, 'portable car tire inflator'],
  [/^màn hình máy tính/i, 'computer monitor'],
  [/^nồi chiên không dầu/i, 'air fryer'],
  [/^balo laptop/i, 'laptop backpack'],
  [/^chuồng nuôi mèo/i, 'cat cage'],
  [/^cát đậu nành/i, 'cat litter'],
  [/^giày chạy bộ/i, 'running shoes'],
  [/^áo khoác gió/i, 'windbreaker jacket'],
  [/^đèn sưởi UVB/i, 'reptile heat lamp']
];

function searchPhrase(title) {
  const clean = title.trim();
  for (const [pattern, phrase] of overrides) if (pattern.test(clean)) return phrase;
  return clean.split(/\s+/).slice(0, 3).join(' ');
}

async function translate(phrases) {
  const text = phrases.join('\n');
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=en&dt=t&q=' + encodeURIComponent(text);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Dịch tên sản phẩm: HTTP ${response.status}`);
  const data = await response.json();
  const lines = data[0].map((part) => part[0]).join('').trim().split('\n').map((line) => line.trim());
  if (lines.length !== phrases.length) throw new Error(`Bản dịch thiếu dòng: ${lines.length}/${phrases.length}`);
  return lines;
}

async function main() {
  const rows = catalog.map((product) => ({ id: product.id, title: product.title, queryVi: searchPhrase(product.title) }));
  for (let offset = 0; offset < rows.length; offset += 10) {
    const batch = rows.slice(offset, offset + 10);
    const translated = await translate(batch.map((row) => row.queryVi || 'không có sản phẩm'));
    batch.forEach((row, index) => {
      row.queryEn = row.queryVi ? translated[index] : '';
      const override = englishOverrides.find(([pattern]) => pattern.test(row.title));
      if (override) row.queryEn = override[1];
    });
    console.log(`Đã dịch ${Math.min(offset + batch.length, rows.length)}/${rows.length}`);
  }
  fs.writeFileSync(path.join(directory, 'search-terms.json'), JSON.stringify(rows, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
