# Đánh giá tìm kiếm bằng ảnh HaiHand (15–16/11/2026)

Mở `image-results.html` trong trình duyệt để xem từng tin: ảnh truy vấn từ Wikimedia Commons, ảnh tin trong Atlas và các thẻ mà chức năng thực sự trả về. Các ảnh cần thiết nằm trong cùng thư mục này.

## Cách chấm

- `same_type`: vật thể chính cùng loại; không xác nhận cùng mẫu, thương hiệu hay chính món hàng đang bán.
- `related`: cùng nhóm hàng nhưng khác loại cụ thể, phụ kiện hoặc đặc tính yêu cầu.
- `wrong_type`: sai vật thể chính.
- `wrong_catalog_photo`: ID tin trùng nhưng ảnh trong Atlas sai so với tiêu đề.
- `targetHit`: chức năng trả về đúng ID tin gốc; đây là chỉ số riêng, không thay cho chấm ảnh.

## Kết quả bản hiện tại

- 139 tin đang bán trong Atlas; 85 ảnh mạng xác minh cùng loại vật thể, 7 ảnh bị loại, 47 tin chưa có ảnh mạng đủ tin cậy.
- 86 lượt chạy (một lượt sau đó bị loại khỏi tập đánh giá), không lỗi hệ thống. 66 cặp ảnh tin gốc dùng làm nhãn dương hợp lệ.
- Sau ngưỡng trả thẻ 0,78: 84 thẻ gồm 63 cùng loại, 6 liên quan, 11 sai loại và 4 có ảnh catalog sai.
- 49/66 cặp nhãn dương trả về ID tin gốc; 17/66 không trả về ID đó.
- 37 tin có ít nhất ảnh bìa không khớp tiêu đề; kiểm tra mọi ảnh của các tin này cho thấy chưa có ảnh nào xác minh được đúng món hàng theo tên tin.

## Tệp

- `image-results.csv`: 139 dòng kết quả theo tin.
- `returned-card-grades-final.csv`: 84 thẻ và nhãn chấm ảnh.
- `catalog-data-issues.csv`: 37 tin cần thay ảnh bằng ảnh thật của món hàng.
- `manual-training-pairs.jsonl`: 100 cặp ảnh đã gắn nhãn thủ công, 66 dương và 34 âm. Nhãn chỉ ở mức **loại vật thể**; không dùng để khẳng định đúng mẫu hoặc đúng món hàng.
- `api-results-before.json`, `api-results-after.json`, `api-results-final.json`: kết quả trước sửa, sau sửa luồng và sau ngưỡng trả thẻ.
- `threshold-calibration.json`: thí nghiệm ngưỡng trên điểm cặp ảnh gốc.

Tập nhãn hiện còn nhỏ và có nhiều tin sai ảnh; chưa fine-tune trọng số SigLIP/Qwen. Cần sửa ảnh 37 tin, bổ sung ảnh truy vấn thật từ người dùng và chấm chính xác ID/mẫu trước khi huấn luyện trọng số trên Colab hoặc Kaggle.

## Cập nhật 16/11/2026

Mở `image-results-improved.html` để so ảnh truy vấn, ảnh Atlas và thẻ trước/sau theo từng ca. `api-results-v4.json` là kết quả API cuối, `improvement-summary.json` là số liệu tổng hợp, `returned-card-grades-v3-extra.json` là nhãn chấm bổ sung cho các thẻ mới.

| Chỉ số trên 85 ảnh đã xác minh | Bản trước | Bản mới |
|---|---:|---:|
| Đúng ID tin trong 66 cặp dương | 49 | 47 |
| Thẻ cùng loại vật thể | 63/84 | 58/64 |
| Thẻ chỉ liên quan | 6 | 2 |
| Thẻ sai loại hoặc ảnh catalog sai | 15 | 4 |

Bản mới chấm trực tiếp từng vector ảnh của tin đang bán, chỉ cho Qwen chọn thẻ có ảnh tải được, loại 37 ảnh bìa catalog từng được chấm sai khi URL chưa đổi, và chỉ giữ thẻ tìm bằng ảnh đơn thuần nếu tên/vector văn bản của tin nằm trong top 10 theo mô tả ảnh. Chatbot có bộ xếp hạng kết hợp tên/mã và vector văn bản, đồng thời tạo lại vector khi tạo/sửa tin. Hai bộ đánh giá đang dùng chính tập ảnh đã rà thủ công để chỉnh thuật toán, nên các số trên **chưa phải kiểm thử độc lập**. Cần thêm ảnh truy vấn thật chưa dùng để chỉnh ngưỡng nhằm xác nhận khả năng tổng quát.
