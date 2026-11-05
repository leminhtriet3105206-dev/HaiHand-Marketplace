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

Điền `MONGO_URI` và `JWT_SECRET` trong `backend/.env`, sau đó chạy:

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
