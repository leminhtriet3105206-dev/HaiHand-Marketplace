const fs = require('node:fs');
const path = require('node:path');

const directory = __dirname;
const results = JSON.parse(fs.readFileSync(path.join(directory, 'api-results-v3.json')));
// Manual labels for cards absent from the prior reviewed results.
const labels = {
  '69dcc334295b6e59ef3afc9e:69dcc334295b6e59ef3afc9e': ['same_type', 'Ảnh thứ hai cho thấy bàn ủi hơi nước.'],
  '69de26217a871f2c9e8f529c:69de265b7a871f2c9e8f52f4': ['wrong_type', 'Chuồng hamster bằng bể kính khác bể nuôi cá.'],
  '6af173a0c91caafe16621f02:69dcb551e8f5f531d474e4c5': ['wrong_type', 'Bát ăn thú cưng khác gạt tàn điện tử.'],
  '6af17dbc2e06332d9bb40e8f:69de0c16e0f64faf1ab9fe6e': ['wrong_type', 'Đèn pin khác chảo chống dính.'],
  '6af17dbd2e06332d9bb40e97:6af1739fc91caafe16621efd': ['wrong_type', 'Ghế ăn dặm khác thức ăn cho thú cưng.'],
  '6af17dbd2e06332d9bb40e97:69d87073a937bd538ab31e7f': ['wrong_type', 'Ghế ăn dặm khác chó trong ảnh tin pet.'],
  '6af17dbd2e06332d9bb40e98:6af17dc22e06332d9bb40eaf': ['wrong_type', 'Máy hút sữa khác robot hút bụi.'],
  '6af17dbf2e06332d9bb40e9c:6af17dbf2e06332d9bb40e9d': ['related', 'Cùng là điện thoại nhưng khác hãng và mẫu.'],
  '6af17dc02e06332d9bb40ea1:69dcae1be8f5f531d474dd03': ['wrong_type', 'Ốp điện thoại khác thắt lưng.'],
  '6af17dc02e06332d9bb40ea1:69dcb006e8f5f531d474df1c': ['wrong_type', 'Ốp điện thoại khác áo thun.'],
  '6af17dc12e06332d9bb40eac:6af17dc12e06332d9bb40eac': ['same_type', 'Ảnh trả về là loa Bluetooth của đúng tin.'],
  '6af17dc12e06332d9bb40eae:6af17dc22e06332d9bb40eaf': ['wrong_type', 'Nồi chiên không dầu khác robot hút bụi.'],
  '6af17dc12e06332d9bb40eae:69dcb551e8f5f531d474e4c5': ['wrong_type', 'Nồi chiên không dầu khác gạt tàn điện tử.'],
  '6af17dc22e06332d9bb40eb1:69de24957a871f2c9e8f5109': ['related', 'Đều là ghế nhưng ghế công thái học khác ghế massage.']
};

const rows = Object.entries(labels).map(([pair, [grade, note]]) => {
  const [queryId, returnedId] = pair.split(':');
  const product = results.find((row) => row.id === queryId)?.products
    .find((item) => item.id === returnedId);
  if (!product) throw new Error(`Không thấy thẻ ${pair} trong kết quả v3`);
  return { queryId, returnedId, returnedImage: product.image, grade, note };
});
fs.writeFileSync(path.join(directory, 'returned-card-grades-v3-extra.json'), JSON.stringify(rows, null, 2));
console.log(`Đã chấm ${rows.length} thẻ mới.`);
