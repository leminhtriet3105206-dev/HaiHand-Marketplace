# Kết quả tìm kiếm sản phẩm bằng ảnh

Mở [image-results.html](image-results.html) để xem từng ảnh truy vấn cạnh ảnh tin và kết quả trước/sau. [image-results.csv](image-results.csv) là bảng 7 lượt tìm; [image-results.json](image-results.json) có danh sách ứng viên, điểm ảnh và sản phẩm trả về. Ảnh truy vấn nằm trong `images/`, nguồn gốc từng ảnh nằm trong [labels.json](labels.json).

Ảnh truy vấn được Playwright chụp từ kết quả tìm kiếm trên Wikimedia Commons ngày 15/11/2026. Nhãn được kiểm tra thủ công theo **loại vật thể nhìn thấy**, không xác thực thương hiệu, mẫu mã, quyền sở hữu hay tình trạng thực tế của tin bán. Đây là bộ kiểm thử nhỏ, chưa phải tập dữ liệu đủ để fine-tune SigLIP. Ca mũ xe đạp được đánh dấu `trainable: false` vì ảnh tin trong Atlas sai loại vật thể; không đưa ca đó vào huấn luyện trước khi sửa dữ liệu gốc.

Kết quả sau chỉnh sửa: 5/6 truy vấn có hàng nhận ít nhất một tin đúng; 5 thẻ đúng, 1 thẻ sai, 1 lượt bỏ sót; ảnh không có hàng không trả nhầm tin. Bộ lọc cũ cũng từng đạt 5/6 ở một lần thử khác; chênh lệch 4/6 → 5/6 trong bảng là quan sát một lần, chưa chứng minh cải thiện ổn định. Tin mũ bảo hiểm bị bỏ sót vì ảnh trong catalog là người đi xe máy. Tin Twitter Mantis được trả nhầm vì tên ghi xe đạp địa hình nhưng ảnh là xe đường phố. Xem [catalog-data-issues.csv](catalog-data-issues.csv) để sửa dữ liệu gốc. Cần ảnh thật của chính món hàng trước khi cập nhật tin; không dùng ảnh minh họa trên mạng để thay ảnh sản phẩm đang bán.

Nếu sửa ảnh qua API cập nhật tin, backend sẽ lập chỉ mục lại khi lưu. Nếu sửa trực tiếp trong Atlas, cần lập chỉ mục lại trước khi đánh giá; lệnh dưới đây chạy lại toàn bộ tin đang bán:

```powershell
cd backend
npm run rag:index
npm run image:eval -- ..\output\image-search-evaluation-2026-11-15\labels.json
cd ..
node output\image-search-evaluation-2026-11-15\render-results.cjs
```

`--missing-multi` chỉ lập chỉ mục tin thiếu vector, vì vậy không dùng tùy chọn đó sau khi sửa ảnh của tin đã có vector.
