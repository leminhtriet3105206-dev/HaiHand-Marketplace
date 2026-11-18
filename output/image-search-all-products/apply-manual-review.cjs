const fs = require('node:fs');
const path = require('node:path');

const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-picks.json')));
// Reviewed side by side in review-sheets/: external query image on the left, Atlas listing image on the right.
const rejectedSource = new Map(Object.entries({
  '8ab32501': 'Dép xỏ ngón khác kiểu dép tổ ong trong tin',
  '4ed9bf5c': 'Dép xỏ ngón khác kiểu dép tổ ong trong tin',
  'd474daf1': 'Ảnh sinh hoạt không thấy rõ bộ đồ ngủ cần tìm',
  '16621eff': 'Ảnh xe tăng quân sự, không phải bể nuôi rùa',
  '9bb40e94': 'Ảnh người đẩy xe hàng gần đường ray, không phải xe đẩy em bé',
  '9bb40e99': 'Ảnh ánh sáng xanh, không thấy rõ cũi trẻ em',
  'ef3af603': 'Ảnh máy in cổ, không phải trục lăn xả vải'
}));
const catalogMismatch = new Map(Object.entries({
  '16621f03': 'Tin mũ bảo hiểm xe đạp dùng ảnh người lái xe máy',
  '9bb40e8a': 'Tin xe đạp địa hình dùng ảnh xe đạp đường phố',
  'ef3b043a': 'Tin Google Pixel dùng ảnh thiết bị và hộp máy khác mẫu, kèm tay cầm game',
  '9e8f50bc': 'Tin thức ăn chó dùng ảnh hộp thức ăn rùa/cá',
  '16621eff': 'Tin bể rùa dùng ảnh hổ',
  '16621f02': 'Tin bát ăn thú cưng dùng ảnh chó đọc sách',
  '16621f04': 'Tin khóa dây số dùng ảnh xe đạp, không thấy khóa',
  '9bb40e8f': 'Tin đèn pin dùng ảnh bàn máy tính tối, không thấy đèn pin',
  '9bb40e90': 'Tin bàn bóng bàn dùng ảnh vợt bóng bàn',
  '9bb40e91': 'Tin cần câu dùng ảnh mèo',
  '9bb40e94': 'Tin xe đẩy em bé dùng ảnh phòng ngủ',
  '9bb40e97': 'Tin ghế ăn dặm dùng ảnh em bé, không thấy ghế',
  '9bb40e98': 'Tin máy hút sữa dùng ảnh em bé chơi đồ chơi',
  '9bb40e99': 'Tin quây cũi dùng ảnh đường ray đồ chơi',
  '9bb40e9c': 'Tin iPhone 13 Pro dùng ảnh iPhone kiểu máy hai camera',
  '9bb40ea1': 'Tin ốp lưng dùng ảnh điện thoại, không thấy ốp',
  '9bb40ea5': 'Tin mũ bảo hiểm dùng ảnh xe máy đang chạy, mũ không rõ',
  '9bb40ea6': 'Tin camera hành trình dùng ảnh ô tô, không thấy camera',
  '9bb40eae': 'Tin nồi chiên không dầu dùng ảnh nấu ăn bằng chảo',
  '9bb40eb1': 'Tin ghế công thái học dùng ảnh ghế thường không tựa lưng',
  '9bb40eb6': 'Tin chuồng mèo dùng ảnh mèo, không thấy chuồng',
  '9bb40eb7': 'Tin cát vệ sinh dùng ảnh mèo, không thấy cát',
  '9bb40eb8': 'Tin bể cá dùng ảnh cá riêng lẻ, không thấy bể',
  '334558ef': 'Tin điện thoại Samsung dùng ảnh iPhone',
  '34fe1d8b': 'Tin Labubu dùng ảnh logo sàn, không thấy đồ chơi',
  '16621efe': 'Tin pate cho mèo dùng ảnh chuột lang đang ăn cà rốt',
  '16621f00': 'Tin thức ăn cho rùa dùng ảnh rùa, không thấy thức ăn',
  '16621f01': 'Tin đèn sưởi bò sát dùng ảnh mèo, không thấy đèn',
  '9bb40e93': 'Tin Labubu dùng ảnh nhiều loại đồ chơi, không xác định Labubu',
  '9bb40e96': 'Tin gấu bông Capybara dùng ảnh gấu bông thường',
  '9bb40e9a': 'Tin xe chòi chân cho bé dùng ảnh chó',
  '9bb40e9b': 'Tin truyện tranh thiếu nhi dùng ảnh sách kinh doanh',
  '9bb40e9f': 'Tin sạc dự phòng Anker dùng ảnh sạc Xiaomi',
  '9bb40ea2': 'Tin gimbal điện thoại dùng ảnh tai nghe',
  '9bb40ea7': 'Tin bơm lốp ô tô dùng ảnh ô tô, không thấy bơm',
  '9bb40ea8': 'Tin nhớt xe máy dùng ảnh ô tô, không thấy nhớt',
  '9bb40eb9': 'Tin thức ăn cá dùng ảnh cá, không thấy thức ăn'
}));

const reviewed = rows.map((row) => {
  const suffix = row.id.slice(-8);
  const hasSource = Boolean(row.image) && (row.sourceStatus === 'needs_visual_review' || row.sourceStatus === 'previously_reviewed');
  const sourceIssue = rejectedSource.get(suffix);
  const catalogIssue = catalogMismatch.get(suffix) || '';
  return {
    ...row,
    sourceReview: !hasSource ? 'not_available' : sourceIssue ? 'rejected' : 'object_type_verified',
    sourceReviewNote: sourceIssue || '',
    catalogPhotoReview: catalogIssue ? 'mismatch' : hasSource ? 'appears_match' : 'not_reviewed',
    catalogReviewNote: catalogIssue,
    evaluationEligible: hasSource && !sourceIssue,
    trainingEligible: hasSource && !sourceIssue && !catalogIssue && row.trainable !== false
  };
});
fs.writeFileSync(path.join(__dirname, 'reviewed-sources.json'), JSON.stringify(reviewed, null, 2));
fs.writeFileSync(path.join(__dirname, 'labels-reviewed.json'), JSON.stringify(
  reviewed.filter((row) => row.trainingEligible).map((row) => ({
    image: row.image, message: '', expectedIds: [row.id], sourceUrl: row.sourceUrl,
    labelLevel: 'object_type', reviewNote: 'Ảnh ngoài mạng cùng loại vật thể; chưa xác nhận đúng thương hiệu, mẫu hoặc món hàng đang bán.'
  })), null, 2));
console.log(JSON.stringify({
  products: reviewed.length,
  sourceVerified: reviewed.filter((row) => row.sourceReview === 'object_type_verified').length,
  sourceRejected: reviewed.filter((row) => row.sourceReview === 'rejected').length,
  sourceUnavailable: reviewed.filter((row) => row.sourceReview === 'not_available').length,
  catalogMismatch: reviewed.filter((row) => row.catalogPhotoReview === 'mismatch').length,
  evaluationEligible: reviewed.filter((row) => row.evaluationEligible).length,
  trainingEligible: reviewed.filter((row) => row.trainingEligible).length
}, null, 2));
