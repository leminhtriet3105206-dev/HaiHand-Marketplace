const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');

require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const OUTPUT_DIR = path.join(__dirname, '../../output');
const CANDIDATES_FILE = path.join(OUTPUT_DIR, 'playwright-product-image-candidates.json');
const APPLY = process.argv.includes('--apply');
const REFRESH = process.argv.includes('--refresh');
const APPLY_GENERATED = process.argv.includes('--apply-generated');

const SHEETS = {
  electronics: ['Cáp Sạc Nhanh Type-C', 'Củ Sạc Nhanh GaN', 'Sạc Dự Phòng Sạc', 'Bàn Phím Cơ Không', 'Bộ Phát WiFi 6', 'Camera An Ninh WiFi', 'Chuột Không Dây Công', 'Đèn Treo Màn Hình', 'Đồng Hồ Thông Minh', 'Giá Đỡ Laptop Nhôm', 'Hub Chuyển Đổi Type-C', 'Loa Bluetooth Di Động', 'Micro Thu Âm USB', 'Ổ Cứng Di Động', 'Tai Nghe Bluetooth Chống'],
  baby: ['Balo Bỉm Sữa Đa', 'Bình Sữa PPSU Cổ', 'Bộ Chén Muỗng Ăn', 'Địu Ngồi Trợ Lực', 'Đồ Chơi Xếp Hình', 'Ghế Ăn Dặm Đa', 'Khăn Sữa Sợi Tre', 'Máy Hâm Sữa Tiệt', 'Máy Hút Sữa Điện', 'Nhiệt Kế Hồng Ngoại', 'Set Quần Áo Sơ', 'Sữa Tắm Gội Tạo', 'Tã Quần Siêu Thấm', 'Thảm Chơi Xốp Gấp', 'Xe Đẩy Gấp Gọn'],
  household: ['Ấm Siêu Tốc 2', 'Bàn Làm Việc Gaming', 'Bình Giữ Nhiệt Inox', 'Bộ Chăn Ga Gối', 'Bộ Nồi Inox 3', 'Cây Lau Nhà Tự', 'Đèn Bàn Học Chống', 'Ghế Công Thái Học', 'Hộp Cơm Giữ Nhiệt', 'Kệ Sách Gỗ Lắp', 'Máy Hút Bụi Cầm', 'Máy Lọc Không Khí', 'Máy Xay Sinh Tố', 'Nồi Chiên Không Dầu', 'Tủ Nhựa Đựng Đồ'],
  beauty: ['Bàn Chải Điện Sóng', 'Dầu Gội Thảo Dược', 'Kem Chống Nắng Kiềm', 'Kem Dưỡng Ẩm Phục', 'Mặt Nạ Đất Sét', 'Máy Rửa Mặt Silicone', 'Nước Hoa Nữ Hương', 'Nước Tẩy Trang Dịu', 'Serum Vitamin C Làm', 'Son Kem Lì Mịn', 'Sữa Rửa Mặt Tạo', 'Sữa Tắm Dưỡng Ẩm', 'Tẩy Tế Bào Chết', 'Tinh Chất Dưỡng Tóc', 'Toner Hoa Cúc Làm'],
  sports: ['Balo Trekking Leo Núi', 'Bình Nước Thể Thao', 'Bộ Dây Kháng Lực', 'Bộ Tạ Tay Bọc', 'Đai Bảo Vệ Đầu', 'Dây Nhảy Thể Lực', 'Đèn Pin Đội Đầu', 'Ghế Xếp Dã Ngoại', 'Giày Chạy Bộ Đệm', 'Kính Bơi Chống Sương', 'Lều Cắm Trại Tự', 'Thảm Tập Yoga TPE', 'Túi Trống Tập Gym', 'Vali Kéo Du Lịch', 'Vợt Cầu Lông Carbon'],
  fashion: ['Áo Hoodie Nỉ Bông', 'Áo Khoác Gió 2', 'Áo Len Cổ Lọ', 'Áo Polo Thể Thao', 'Áo Sơ Mi Dài', 'Áo Thun Nam Cotton', 'Balo Laptop Công Sở', 'Chân Váy Xếp Ly', 'Giày Sneaker Đế Êm', 'Quần Jeans Nam Slim', 'Quần Kaki Công Sở', 'Quần Ống Suông Cạp', 'Thắt Lưng Da Bò', 'Túi Đeo Chéo Da', 'Váy Midi Hoa Nhí']
};

const ENGLISH_QUERIES = {
  'Cáp Sạc Nhanh Type-C': 'USB-C charging cable',
  'Củ Sạc Nhanh GaN': 'GaN charger',
  'Sạc Dự Phòng Sạc': 'power bank',
  'Bàn Phím Cơ Không': 'mechanical keyboard',
  'Bộ Phát WiFi 6': 'wireless router',
  'Camera An Ninh WiFi': 'security camera',
  'Chuột Không Dây Công': 'ergonomic wireless mouse',
  'Đèn Treo Màn Hình': 'computer monitor light',
  'Đồng Hồ Thông Minh': 'smartwatch',
  'Giá Đỡ Laptop Nhôm': 'laptop stand',
  'Hub Chuyển Đổi Type-C': 'USB-C hub',
  'Loa Bluetooth Di Động': 'Bluetooth speaker',
  'Micro Thu Âm USB': 'USB microphone',
  'Ổ Cứng Di Động': 'external solid state drive',
  'Tai Nghe Bluetooth Chống': 'noise cancelling headphones',
  'Balo Bỉm Sữa Đa': 'diaper backpack',
  'Bình Sữa PPSU Cổ': 'baby bottle',
  'Bộ Chén Muỗng Ăn': 'baby feeding bowl spoon',
  'Địu Ngồi Trợ Lực': 'baby carrier',
  'Đồ Chơi Xếp Hình': 'wooden building blocks',
  'Ghế Ăn Dặm Đa': 'baby high chair',
  'Khăn Sữa Sợi Tre': 'baby washcloth',
  'Máy Hâm Sữa Tiệt': 'baby bottle warmer',
  'Máy Hút Sữa Điện': 'electric breast pump',
  'Nhiệt Kế Hồng Ngoại': 'infrared thermometer',
  'Set Quần Áo Sơ': 'newborn baby clothes',
  'Sữa Tắm Gội Tạo': 'baby shampoo bottle',
  'Tã Quần Siêu Thấm': 'baby diapers',
  'Thảm Chơi Xốp Gấp': 'foam play mat',
  'Xe Đẩy Gấp Gọn': 'baby stroller',
  'Ấm Siêu Tốc 2': 'electric kettle',
  'Bàn Làm Việc Gaming': 'gaming desk',
  'Bình Giữ Nhiệt Inox': 'stainless steel thermos',
  'Bộ Chăn Ga Gối': 'bedding set',
  'Bộ Nồi Inox 3': 'stainless steel cookware set',
  'Cây Lau Nhà Tự': 'spin mop',
  'Đèn Bàn Học Chống': 'desk lamp',
  'Ghế Công Thái Học': 'ergonomic office chair',
  'Hộp Cơm Giữ Nhiệt': 'insulated lunch box',
  'Kệ Sách Gỗ Lắp': 'wooden bookshelf',
  'Máy Hút Bụi Cầm': 'cordless vacuum cleaner',
  'Máy Lọc Không Khí': 'air purifier',
  'Máy Xay Sinh Tố': 'kitchen blender',
  'Nồi Chiên Không Dầu': 'air fryer',
  'Tủ Nhựa Đựng Đồ': 'plastic storage cabinet',
  'Bàn Chải Điện Sóng': 'electric toothbrush',
  'Dầu Gội Thảo Dược': 'shampoo bottle',
  'Kem Chống Nắng Kiềm': 'sunscreen bottle',
  'Kem Dưỡng Ẩm Phục': 'moisturizer cream',
  'Mặt Nạ Đất Sét': 'clay face mask cosmetic',
  'Máy Rửa Mặt Silicone': 'silicone facial cleansing brush',
  'Nước Hoa Nữ Hương': 'perfume bottle',
  'Nước Tẩy Trang Dịu': 'micellar water bottle',
  'Serum Vitamin C Làm': 'vitamin C serum bottle',
  'Son Kem Lì Mịn': 'liquid lipstick',
  'Sữa Rửa Mặt Tạo': 'facial cleanser bottle',
  'Sữa Tắm Dưỡng Ẩm': 'body wash bottle',
  'Tẩy Tế Bào Chết': 'body scrub cosmetic',
  'Tinh Chất Dưỡng Tóc': 'hair serum bottle',
  'Toner Hoa Cúc Làm': 'facial toner bottle',
  'Balo Trekking Leo Núi': 'hiking backpack',
  'Bình Nước Thể Thao': 'sports water bottle',
  'Bộ Dây Kháng Lực': 'resistance bands',
  'Bộ Tạ Tay Bọc': 'dumbbells',
  'Đai Bảo Vệ Đầu': 'knee support brace',
  'Dây Nhảy Thể Lực': 'jump rope',
  'Đèn Pin Đội Đầu': 'headlamp',
  'Ghế Xếp Dã Ngoại': 'camping chair',
  'Giày Chạy Bộ Đệm': 'running shoes',
  'Kính Bơi Chống Sương': 'swimming goggles',
  'Lều Cắm Trại Tự': 'camping tent',
  'Thảm Tập Yoga TPE': 'yoga mat',
  'Túi Trống Tập Gym': 'gym duffel bag',
  'Vali Kéo Du Lịch': 'travel suitcase',
  'Vợt Cầu Lông Carbon': 'badminton racket',
  'Áo Hoodie Nỉ Bông': 'hoodie',
  'Áo Khoác Gió 2': 'windbreaker jacket',
  'Áo Len Cổ Lọ': 'turtleneck sweater',
  'Áo Polo Thể Thao': 'polo shirt',
  'Áo Sơ Mi Dài': 'dress shirt',
  'Áo Thun Nam Cotton': 'mens t-shirt',
  'Balo Laptop Công Sở': 'laptop backpack',
  'Chân Váy Xếp Ly': 'pleated skirt',
  'Giày Sneaker Đế Êm': 'sneakers',
  'Quần Jeans Nam Slim': 'mens jeans',
  'Quần Kaki Công Sở': 'khaki trousers',
  'Quần Ống Suông Cạp': 'wide leg pants',
  'Thắt Lưng Da Bò': 'leather belt',
  'Túi Đeo Chéo Da': 'crossbody bag',
  'Váy Midi Hoa Nhí': 'floral midi dress'
};

function concept(title = '') {
  return title.trim().split(/\s+/).slice(0, 4).join(' ');
}

function slug(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function parsePlaywrightResult(output) {
  const match = output.match(/### Result\r?\n([\s\S]*?)\r?\n### Ran Playwright code/);
  if (!match) throw new Error('Không đọc được kết quả từ Playwright CLI');
  return JSON.parse(JSON.parse(match[1]));
}

async function cropGeneratedSheets() {
  const sheetsDir = path.join(OUTPUT_DIR, 'imagegen/product-sheets');
  const cropsDir = path.join(OUTPUT_DIR, 'imagegen/product-crops');
  fs.mkdirSync(cropsDir, { recursive: true });
  for (const [sheet, keys] of Object.entries(SHEETS)) {
    const source = path.join(sheetsDir, `${sheet}.png`);
    const metadata = await sharp(source).metadata();
    const cellWidth = Math.floor(metadata.width / 5);
    const cellHeight = Math.floor(metadata.height / 3);
    for (let index = 0; index < keys.length; index += 1) {
      const left = (index % 5) * cellWidth + 2;
      const top = Math.floor(index / 5) * cellHeight + 2;
      await sharp(source)
        .extract({ left, top, width: cellWidth - 4, height: cellHeight - 4 })
        .resize(800, 800, { fit: 'contain', background: '#ffffff' })
        .jpeg({ quality: 90 })
        .toFile(path.join(cropsDir, `${slug(keys[index])}.jpg`));
    }
  }
  return cropsDir;
}

function collectWithPlaywright(groups) {
  const queries = groups.map(group => ({
    key: group.key,
    query: ENGLISH_QUERIES[group.key]
  }));
  const missing = queries.filter(item => !item.query);
  if (missing.length) throw new Error(`Thiếu từ khóa tiếng Anh: ${missing.map(item => item.key).join(', ')}`);
  const collected = [];
  const cli = path.join(path.dirname(require.resolve('@playwright/cli/package.json')), 'playwright-cli.js');
  const opened = spawnSync(process.execPath, [cli, 'open', 'about:blank'], { encoding: 'utf8', timeout: 30000 });
  if (opened.status !== 0) throw new Error(opened.stderr || opened.stdout || 'Không mở được Playwright');
  for (let start = 0; start < queries.length; start += 8) {
    const batch = queries.slice(start, start + 8);
    const code = `async page => {
      const queries = ${JSON.stringify(batch)};
      const results = [];
      for (const item of queries) {
        const search = '"' + item.query + '" filetype:bitmap';
        const api = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url%7Cmime&iiurlwidth=800&format=json&origin=*&gsrsearch=' + encodeURIComponent(search);
        const response = await page.goto(api, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const data = await response.json();
        const images = Object.values(data.query?.pages || {}).map(entry => ({
          url: entry.imageinfo?.[0]?.thumburl || entry.imageinfo?.[0]?.url || '',
          title: entry.title?.replace(/^File:/, '') || '',
          source: entry.imageinfo?.[0]?.descriptionurl || '',
          mime: entry.imageinfo?.[0]?.mime || ''
        })).filter(item => item.url.startsWith('http') && ['image/jpeg', 'image/png', 'image/webp'].includes(item.mime)).slice(0, 5);
        results.push({ ...item, images });
      }
      return JSON.stringify(results);
    }`;
    const result = spawnSync(process.execPath, [cli, 'run-code', code], {
      encoding: 'utf8', timeout: 4 * 60 * 1000, maxBuffer: 5 * 1024 * 1024
    });
    if (result.status !== 0) throw new Error(result.error?.message || `${result.stdout || ''}\n${result.stderr || ''}`.trim() || 'Playwright thất bại');
    collected.push(...parsePlaywrightResult(result.stdout));
    console.log(`Playwright ${Math.min(start + batch.length, queries.length)}/${queries.length}`);
  }
  return collected;
}

async function uploadGroup(group) {
  let lastError;
  for (const image of group.images) {
    try {
      const uploaded = await cloudinary.uploader.upload(image.url, {
        folder: 'haihand-demo/product-types',
        public_id: slug(group.key),
        overwrite: true,
        resource_type: 'image',
        context: `caption=${group.key}|source=${image.source}`
      });
      return { url: uploaded.secure_url, source: image };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${group.key}: ${lastError?.message || 'không upload được ảnh'}`);
}

async function main() {
  if (process.argv.includes('--self-test')) {
    assert.equal(concept('Ấm Siêu Tốc 2 Lớp Chống Bỏng'), 'Ấm Siêu Tốc 2');
    assert.equal(slug('Bình Giữ Nhiệt Inox'), 'binh-giu-nhiet-inox');
    console.log('self-test ok');
    return;
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const min = new mongoose.Types.ObjectId('6b2c00000000000000000000');
    const max = new mongoose.Types.ObjectId('6b2d00000000000000000000');
    const products = await mongoose.connection.db.collection('posts').find(
      { _id: { $gte: min, $lt: max } },
      { projection: { title: 1, name: 1, category: 1, images: 1 } }
    ).toArray();
    const grouped = new Map();
    for (const product of products) {
      const key = concept(product.title || product.name);
      const entry = grouped.get(key) || { key, category: product.category, products: [] };
      entry.products.push(product);
      grouped.set(key, entry);
    }
    const groups = [...grouped.values()];
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    if (APPLY_GENERATED) {
      const cropsDir = await cropGeneratedSheets();
      const expected = new Set(Object.values(SHEETS).flat());
      assert.deepEqual(new Set(groups.map(group => group.key)), expected);
      const backupFile = path.join(OUTPUT_DIR, `product-image-backup-${Date.now()}.json`);
      fs.writeFileSync(backupFile, JSON.stringify({
        createdAt: new Date().toISOString(),
        products: products.map(product => ({ _id: String(product._id), images: product.images || [] }))
      }, null, 2));
      const updates = [];
      let uploaded = 0;
      for (const group of groups) {
        const localImage = path.join(cropsDir, `${slug(group.key)}.jpg`);
        const result = await cloudinary.uploader.upload(localImage, {
          folder: 'haihand-demo/product-types', public_id: slug(group.key), overwrite: true,
          resource_type: 'image', context: `caption=${group.key}|source=OpenAI ImageGen`
        });
        uploaded += 1;
        for (const product of group.products) {
          updates.push({ updateOne: {
            filter: { _id: product._id },
            update: {
              $set: { images: [result.secure_url] },
              $unset: {
                imageEmbedding: '', imageEmbeddings: '', imageEmbeddingImages: '', imageEmbeddingModel: '',
                imageVector0: '', imageVector1: '', imageVector2: '', imageVector3: '', imageVector4: ''
              }
            }
          } });
        }
        console.log(`Cloudinary ${uploaded}/${groups.length}: ${group.key}`);
      }
      await mongoose.connection.db.collection('posts').bulkWrite(updates);
      console.log(JSON.stringify({ uploaded, updatedProducts: updates.length, backupFile }));
      return;
    }
    let candidates;
    if (!REFRESH && fs.existsSync(CANDIDATES_FILE)) {
      candidates = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'));
    } else {
      candidates = collectWithPlaywright(groups);
      fs.writeFileSync(CANDIDATES_FILE, JSON.stringify(candidates, null, 2));
    }
    const byKey = new Map(candidates.map(item => [item.key, item]));
    console.log(`Playwright: ${candidates.length}/${groups.length} nhóm, sản phẩm: ${products.length}`);
    if (!APPLY) return;

    const backup = {
      createdAt: new Date().toISOString(),
      products: products.map(product => ({ _id: String(product._id), images: product.images || [] }))
    };
    const backupFile = path.join(OUTPUT_DIR, `product-image-backup-${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));

    const updates = [];
    let uploaded = 0;
    for (const group of groups) {
      const candidate = byKey.get(group.key);
      if (!candidate?.images?.length) {
        console.warn(`Bỏ qua ${group.key}: không có kết quả ảnh`);
        continue;
      }
      const image = await uploadGroup(candidate);
      uploaded += 1;
      for (const product of group.products) {
        updates.push({ updateOne: {
          filter: { _id: product._id },
          update: {
            $set: { images: [image.url] },
            $unset: {
              imageEmbedding: '', imageEmbeddings: '', imageEmbeddingImages: '', imageEmbeddingModel: '',
              imageVector0: '', imageVector1: '', imageVector2: '', imageVector3: '', imageVector4: ''
            }
          }
        } });
      }
      console.log(`Đã upload ${uploaded}/${groups.length}: ${group.key}`);
    }
    if (updates.length) await mongoose.connection.db.collection('posts').bulkWrite(updates);
    console.log(JSON.stringify({ uploaded, updatedProducts: updates.length, backupFile }));
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { SHEETS };
if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
