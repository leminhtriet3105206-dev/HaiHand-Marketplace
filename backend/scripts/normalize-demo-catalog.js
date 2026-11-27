const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
const { embedImage, IMAGE_EMBEDDING_MODEL } = require('../services/imageEmbeddingService');
const { imageVectorFields } = require('../services/imageVectorIndex');
const { SHEETS } = require('./repair-demo-product-images');
const labels = {
 electronics: 'Cáp sạc USB-C|Củ sạc|Sạc dự phòng|Bàn phím máy tính|Bộ phát WiFi|Camera an ninh|Chuột máy tính|Đèn treo màn hình|Đồng hồ thông minh|Giá đỡ laptop|Hub USB-C|Loa Bluetooth|Micro thu âm|Ổ cứng di động SSD|Tai nghe chụp tai',
 baby: 'Balo bỉm sữa|Bình sữa cho bé|Bộ chén và muỗng ăn dặm|Địu em bé|Đồ chơi xếp hình gỗ|Ghế ăn dặm|Bộ khăn cho bé|Máy hâm sữa và tiệt trùng|Máy hút sữa điện|Nhiệt kế điện tử|Bộ quần áo sơ sinh|Sữa tắm gội cho bé|Tã cho bé|Thảm chơi gấp gọn|Xe đẩy em bé',
 household: 'Ấm siêu tốc|Bàn làm việc gaming|Bình giữ nhiệt|Bộ chăn ga gối|Bộ nồi và chảo|Cây lau nhà và xô vắt|Đèn bàn học|Ghế văn phòng lưới|Hộp cơm nhiều tầng|Kệ sách gỗ|Máy hút bụi cầm tay|Máy lọc không khí|Máy xay sinh tố|Nồi chiên không dầu|Tủ nhựa nhiều ngăn',
 beauty: 'Bàn chải điện|Dầu gội thảo dược|Kem chống nắng|Kem dưỡng ẩm|Mặt nạ đất sét|Máy rửa mặt silicone|Nước hoa|Nước tẩy trang|Serum dưỡng da|Son kem|Sữa rửa mặt tạo bọt|Sữa tắm|Tẩy tế bào chết cà phê|Tinh chất dưỡng tóc|Toner hoa cúc',
 sports: 'Balo leo núi|Bình nước thể thao|Bộ dây kháng lực|Bộ tạ tay|Đai bảo vệ đầu gối|Dây nhảy thể lực|Đèn pin đội đầu|Ghế xếp dã ngoại|Giày chạy bộ|Kính bơi|Lều cắm trại|Thảm tập yoga|Túi tập gym|Vali kéo du lịch|Vợt cầu lông',
 fashion: 'Áo hoodie|Áo khoác gió|Áo len cổ lọ|Áo polo|Áo sơ mi dài tay|Áo thun nam|Balo laptop|Chân váy xếp ly|Giày sneaker|Quần jeans|Quần kaki|Quần ống suông|Thắt lưng|Túi đeo chéo|Váy hoa midi'
};
const titles = new Map(Object.entries(SHEETS).flatMap(([sheet, keys]) => keys.map((key, i) => [key, labels[sheet].split('|')[i]])));

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const collection = mongoose.connection.db.collection('posts');
  const rows = await collection.find({ images: { $regex: '/nillgzmb/image/upload/.*/haihand-demo/product-types/' } }).toArray();
  const groups = new Map();
  for (const row of rows) {
    const url = row.images[0];
    if (!groups.has(url)) groups.set(url, []);
    groups.get(url).push(row);
  }
  const plan = [...groups].map(([url, products]) => {
    let words = products[0].title.trim().split(/\s+/);
    for (const product of products.slice(1)) {
      const other = product.title.trim().split(/\s+/);
      let n = 0;
      while (n < words.length && words[n] === other[n]) n++;
      words = words.slice(0, n);
    }
    if (words.length < 4) throw new Error(`Ambiguous group ${url}`);
    const key = words.slice(0, 4).join(' ');
    const title = titles.get(key);
    if (!title) throw new Error(`Missing label ${key}`);
    return { url, title, products };
  });
  console.log(JSON.stringify(plan.map(g => ({ title: g.title, count: g.products.length })), null, 2));
  if (!process.argv.includes('--apply')) return;
  const output = path.join(__dirname, '../../output');
  fs.mkdirSync(output, { recursive: true });
  const backup = path.join(output, `catalog-before-normalization-${Date.now()}.json`);
  fs.writeFileSync(backup, JSON.stringify(rows));
  console.log(`Backup: ${backup}`);
  let done = 0;
  for (const group of plan) {
    const vector = await embedImage(group.url);
    const description = `${group.title}. Dữ liệu minh họa phục vụ demo tìm kiếm sản phẩm bằng hình ảnh. Ảnh được tạo bằng AI, không đại diện cho thương hiệu hoặc mẫu hàng thực tế.`;
    const fields = {
      title: group.title, name: group.title, description,
      ragText: `${group.title}. ${group.products[0].category}. ${description}`,
      imageEmbedding: vector, imageEmbeddings: [vector], imageEmbeddingImages: [group.url],
      imageEmbeddingModel: IMAGE_EMBEDDING_MODEL, ...imageVectorFields([vector])
    };
    const result = await collection.updateMany(
      { _id: { $in: group.products.map(p => p._id) }, images: [group.url] },
      { $set: fields }
    );
    done += result.matchedCount;
    console.log(`Updated ${done}/${rows.length}: ${group.title}`);
  }
  console.log(`DONE ${done}`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
