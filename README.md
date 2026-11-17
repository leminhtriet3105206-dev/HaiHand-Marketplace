# HaiHand Marketplace

## Chạy bằng Docker với AI local

Yêu cầu trên mỗi máy:

- Docker Desktop đang chạy.
- Bionic/LM Studio đã tải `qwen3-vl-4b-instruct` và `text-embedding-bge-m3`.
- Local Model API chạy ở port `1235` và bật Just-in-time model loading.
- Có MongoDB connection string hợp lệ.

Thiết lập lần đầu:

```powershell
Copy-Item backend/.env.example backend/.env
```

Điền `MONGO_URI` (hoặc `MONGODB_ATLAS_URI`) và `JWT_SECRET` trong `backend/.env`, sau đó chạy:

```powershell
docker compose up --build
```

Các địa chỉ mặc định:

- Frontend: http://localhost:3000
- Backend: http://localhost:4000
- Admin: http://localhost:4001
- Local Model API trên máy host: http://localhost:1235/v1

Docker Compose tự dùng `host.docker.internal` để backend trong container gọi Local Model API trên máy host. Các model không được đóng gói vào Docker image; mỗi máy phải tải model riêng.

Muốn đổi URL hoặc model ID khi chạy Docker, đặt `LM_STUDIO_URL`, `AI_MODEL` hoặc `EMBEDDING_MODEL` trong file `.env` ở thư mục gốc dự án.

## Cải thiện tìm sản phẩm bằng ảnh

Tìm ảnh hiện lập vector cho tối đa 5 ảnh mỗi sản phẩm. Hệ thống lấy ứng viên bằng vector ảnh và vector văn bản từ cả yêu cầu bằng chữ lẫn mô tả ảnh, rồi so ảnh truy vấn với từng ảnh của mỗi sản phẩm. Nếu chữ và ảnh cùng xác định rõ loại vật thể, kết quả khác loại bị loại. Qwen3-VL xem lại ảnh người dùng cùng ảnh các ứng viên đầu tiên để loại sản phẩm không phù hợp. Kết quả dưới `IMAGE_SEARCH_MIN_SCORE` bị loại; giá trị mặc định `0.72` chỉ là điểm khởi đầu, cần chỉnh bằng ảnh thử của chính kho hàng.

Sau khi cập nhật mã nguồn, chạy lại `npm run rag:index` trong thư mục `backend` để tạo `imageEmbeddings` cho các tin cũ. Không bật `RAG_IMAGE_MISSING_ONLY=true` ở lần chạy này, vì những tin có vector ảnh cũ cũng cần được làm mới. Vector đại diện vẫn nằm ở trường `imageEmbedding`, nên chỉ mục Atlas hiện tại không cần đổi đường dẫn.

Nếu quá trình lập chỉ mục bị gián đoạn, chạy `npm run rag:index -- --missing-multi` để tiếp tục các tin chưa có `imageEmbeddings`. Script lưu theo nhóm 4 tin và giữ vector cũ khi ảnh tải lỗi.

Để đo chất lượng, tạo một file JSON gồm cả ảnh có hàng đúng và ảnh không có hàng tương ứng:

```json
[
  { "image": "test-images/ao.jpg", "message": "tìm áo khoác", "expectedIds": ["ID_SAN_PHAM_DUNG"] },
  { "image": "test-images/khong-co-hang.jpg", "message": "tìm áo khoác", "expectedIds": [] }
]
```

Trong thư mục `backend`, chạy `npm run image:eval -- labels.json`. Lệnh đo cả sản phẩm cuối cùng hiển thị cho khách lẫn top 5 ứng viên ở nhiều ngưỡng điểm, và phân biệt lỗi lấy ứng viên với lỗi lọc ứng viên. Trường `message` có thể bỏ trống nếu chỉ tìm bằng ảnh. Có thể thêm `"description"` vào từng case để dùng mô tả đã kiểm tra khi đo điểm ứng viên; phép đo kết quả cuối vẫn gọi Qwen3-VL như khi khách sử dụng. Chọn ngưỡng phù hợp rồi đặt `IMAGE_SEARCH_MIN_SCORE` trong `backend/.env` hoặc `.env` của Docker Compose. Ảnh thử và ID phải lấy từ database thật; ví dụ trên chỉ mô tả định dạng file.

Để chuẩn bị dữ liệu cho Colab hoặc Kaggle, chạy `npm run image:export-training` trong `backend`. Script đọc các tin đang bán từ Atlas, tải ảnh thành JPEG và ghi `backend/training-data/catalog/manifest.jsonl` gồm ID tin, đường dẫn ảnh, tên và danh mục. Thư mục `backend/training-data/` được Git bỏ qua; không đưa `backend/.env` vào bộ dữ liệu. Nén thư mục `catalog` và tải lên Google Drive hoặc một Kaggle Dataset ở chế độ Private. Các ảnh đăng bán chỉ là dữ liệu tham khảo; để huấn luyện bộ tìm kiếm cần thêm ảnh truy vấn thật và `expectedIds` do người kiểm tra gắn nhãn như ví dụ trên.
