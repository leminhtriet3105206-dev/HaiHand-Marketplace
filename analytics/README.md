# HaiHand Product Analytics (Python Pipeline)

## 1. Cài đặt & chạy thủ công

```bash
cd analytics
pip install -r requirements.txt
cp .env.example .env

# Sinh dữ liệu mô phỏng (demo)
python -m analytics.seed_demo --days 60 --sessions-per-day 400 --seed 42

# Chạy toàn bộ job tổng hợp
python -m analytics.run --job all --since 60d --include-synthetic --seed-rfm-from-events

# Dọn sạch dữ liệu mô phỏng
python -m analytics.seed_demo --purge-synthetic
```

## 2. Chạy kiểm thử (`pytest`)

```bash
cd analytics
pytest -v
```

## 3. Phân quyền MongoDB (khuyến nghị Production)

Tạo 2 tài khoản tách biệt (chạy trong `mongosh`, **không** commit mật khẩu vào Git):

```javascript
use haihand;

// User chỉ đọc cho analytics_events, orders, posts, users
db.createUser({
  user: "analytics_reader",
  pwd: "STRONG_READ_PASSWORD",
  roles: [
    { role: "read", db: "haihand" }
  ]
});

// User chỉ ghi vào các collection analytics_*
db.createUser({
  user: "analytics_writer",
  pwd: "STRONG_WRITE_PASSWORD",
  roles: [
    { role: "readWrite", db: "haihand" }
  ]
});
```

## 4. Định nghĩa chỉ số
- **Phiên**: Theo `sessionId` từ client; nếu thiếu hoặc `unknown`, cắt phiên theo `anonymousId` với ngưỡng nghỉ 30 phút. Tỷ lệ thoát = phiên chỉ có đúng 1 `page_view`.
- **DAU/WAU/MAU**: Theo `userId` (đã đăng nhập) hoặc `anonymousId` (ẩn danh).
- **Phễu mua hàng**: `product_view` → `add_to_cart` → `checkout_start` → `order_placed` → `payment_success`. Bỏ giỏ = phiên có `add_to_cart` nhưng không có `order_placed` trong cùng phiên hoặc 24h kế.
- **RFM & KMeans**: Tính từ `orders` (R/F/M theo phân vị 1–5); KMeans chọn `k ∈ [3, 6]` theo silhouette (`random_state=42`) khi có ≥ 30 khách.
- **Cohort**: Theo tuần đầu tiên thấy người dùng (tuần 0..8), cả retention sự kiện và đơn hàng.
- **Múi giờ**: Mọi tổng hợp theo ngày/giờ dùng `Asia/Ho_Chi_Minh`.
