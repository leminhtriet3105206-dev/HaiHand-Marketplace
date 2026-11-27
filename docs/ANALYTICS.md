# HaiHand Product Analytics – Tài liệu Kiến trúc & Vận hành

## 1. Kiến trúc & Sơ đồ luồng dữ liệu

```text
React Frontend (src/analytics/tracker.js)
  ──► POST /api/track (validate whitelist, rate limit 120 req/phút/IP, dedupe eventId, UA→device/browser/os)
  ──► MongoDB: analytics_events (thô, TTL 180 ngày)
        ▲
        │ (chỉ ghi server-side cho chuyển đổi: order_placed, payment_success, signup, seller_applied)
Backend Controllers (checkoutController, seller, server)

MongoDB: analytics_events + orders + posts
  ──► Python Analytics Pipeline (analytics/analytics/run.py, user Mongo chỉ-đọc)
  ──► MongoDB: analytics_daily, analytics_funnel, analytics_segments, analytics_cluster_profiles,
               analytics_cohorts, analytics_products, analytics_products_summary,
               analytics_search, analytics_heatmap, analytics_runs (user Mongo chỉ-ghi analytics_*)
  ──► Admin Portal (/admin/analytics, Express + EJS + Chart.js, cổng 4001)
  ──► Seller Channel (/seller-channel/analytics, GET /api/seller/analytics)
```

---

## 2. Từ điển sự kiện (`analytics/event_spec.json`)

Nguồn sự thật duy nhất tại `analytics/event_spec.json`, đồng bộ với `backend/analytics/eventSpec.js` và `analytics/analytics/event_spec.py`.

| Event | Nguồn | Props cho phép |
|---|---|---|
| `page_view` | client | `path`, `title`, `referrer` (chỉ domain), `utm_source`, `utm_medium`, `utm_campaign` |
| `product_view` | client | `productId`, `sellerId`, `category`, `price`, `fromList`, `position` |
| `product_impression` | client | `productIds[]` (≤20), `list` |
| `search` | client | `query` (≤100, đã che email/SĐT), `resultCount`, `filters` |
| `search_result_click` | client | `query`, `productId`, `position` |
| `filter_apply` | client | `category`, `priceMin`, `priceMax`, `condition`, `sort` |
| `add_to_cart` / `remove_from_cart` | client | `productId`, `sellerId`, `quantity`, `price`, `variantId` |
| `favorite_add` / `favorite_remove` | client | `productId` |
| `follow_shop` / `unfollow_shop` | client | `sellerId` |
| `chat_start` | client | `sellerId`, `productId` |
| `checkout_start` | client | `itemCount`, `cartValue` |
| `payment_method_select` | client | `method` (`COD\|VNPAY\|HAIPAY`) |
| `signup` | **server** | `method` |
| `order_placed` | **server** | `orderId`, `sellerId`, `value`, `itemCount`, `paymentMethod` |
| `payment_success` / `payment_failed` | **server** | `orderId`, `method` |
| `order_cancelled` | **server** | `orderId`, `by` (`buyer\|seller\|admin\|system`) |
| `seller_applied` | **server** | – |
| `product_created` | **server** | `productId`, `sellerId` |

---

## 3. Định nghĩa chỉ số

- **Phiên (Session)**: Gom theo `sessionId` từ client (hết hạn sau 30 phút không hoạt động). Nếu thiếu `sessionId`, tự cắt phiên theo `anonymousId` với khoảng nghỉ 30 phút. **Tỷ lệ thoát** = phiên chỉ có đúng 1 `page_view` và không có sự kiện tương tác khác.
- **Người dùng hoạt động (DAU/WAU/MAU)**: Tính theo `userId` nếu đã đăng nhập, ngược lại theo `anonymousId`.
- **Phễu mua hàng**: `product_view` → `add_to_cart` → `checkout_start` → `order_placed` → `payment_success`. Bỏ giỏ = phiên có `add_to_cart` nhưng không có `order_placed` trong cùng phiên hoặc trong vòng 24 giờ theo `actor_id`.
- **RFM**: Tính từ collection `orders` (đơn hoàn tất/đã thanh toán). Chấm điểm phân vị 1–5 (`rank(method='first')`), gán 6 nhãn: `Champions`, `Khách trung thành`, `Tiềm năng`, `Có nguy cơ rời bỏ`, `Ngủ đông/Đã mất`, `Mới`.
- **KMeans**: Đặc trưng `log1p(R, F, M, sessions30d, productViews)` + `cartToOrderRate` + `medianHour/24`, chuẩn hóa `StandardScaler`, chọn `k ∈ [3, 6]` theo silhouette (`random_state=42`). Bỏ qua nếu `<30` khách.
- **Cohort giữ chân**: Tuần đầu tiên thấy người dùng (múi giờ `Asia/Ho_Chi_Minh`), theo dõi tuần `0..8` theo cả tương tác (`eventRetention`) và đơn hàng (`orderRetention`).
- **Hiệu quả sản phẩm**: `ctr = views/impressions`, `cartRate = addToCart/views`, `conversion = orders/views`. Gắn cờ **"Xem nhiều – ít mua"** (`views >= P75` danh mục và `conversion <= P25`) và **"Tiềm năng"** (`conversion >= P75` và `views <= P25`).

---

## 4. Hướng dẫn chạy Seed & Python Jobs

```bash
cd analytics
cp .env.example .env   # điền ANALYTICS_READ_URI và ANALYTICS_WRITE_URI

# Sinh dữ liệu mô phỏng (60 ngày × 400 phiên/ngày)
python -m analytics.seed_demo --days 60 --sessions-per-day 400 --seed 42

# Chạy toàn bộ job tổng hợp
python -m analytics.run --job all --since 60d --seed-rfm-from-events

# Xóa dữ liệu mô phỏng khi lên production
python -m analytics.seed_demo --purge-synthetic
```

Hoặc chạy bằng Docker Compose:
```bash
docker compose --profile analytics up -d analytics
```

---

## 5. Phân quyền MongoDB (Read / Write tách biệt)

Tạo hai tài khoản riêng trên MongoDB (chạy thủ công trên DB thật, không commit mật khẩu):

```javascript
// 1. User chỉ đọc cho Python jobs
db.createUser({
  user: "haihand_analytics_reader",
  pwd: "<STRONG_PASSWORD_READER>",
  roles: [
    { role: "read", db: "haihand" } // hoặc customRole chỉ đọc analytics_events, orders, posts, users, categories
  ]
});

// 2. User chỉ ghi vào các collection analytics_*
db.createRole({
  role: "analyticsWriterRole",
  privileges: [
    "analytics_daily", "analytics_funnel", "analytics_segments",
    "analytics_cluster_profiles", "analytics_cohorts", "analytics_products",
    "analytics_products_summary", "analytics_search", "analytics_heatmap",
    "analytics_related_products", "analytics_runs"
  ].map(c => ({
    resource: { db: "haihand", collection: c },
    actions: ["find", "insert", "update", "remove", "createIndex"]
  })),
  roles: []
});

db.createUser({
  user: "haihand_analytics_writer",
  pwd: "<STRONG_PASSWORD_WRITER>",
  roles: [{ role: "analyticsWriterRole", db: "haihand" }]
});
```

---

## 6. Chính sách Quyền riêng tư & Lưu trữ (TTL)

- **Opt-in & DoNotTrack**: Chỉ gửi sự kiện khi người dùng bấm **"Đồng ý"** trên `ConsentBanner` (`localStorage.hh_analytics_consent = 'granted'`) và trình duyệt không bật `navigator.doNotTrack === '1'`. Người dùng có thể bật/tắt bất kỳ lúc nào tại trang Hồ sơ (`/profile`).
- **Không thu thập PII**: Không lưu email, SĐT, địa chỉ, nội dung tin nhắn, token, hay IP thô. Chuỗi tìm kiếm được che email/SĐT bằng regex trước khi lưu.
- **Không theo dõi Admin**: Tài khoản `role === 'Admin'` tự động bị bỏ qua (trả `204`).
- **TTL Retention**: Collection `analytics_events` có TTL index trên `receivedAt` với `expireAfterSeconds = ANALYTICS_RETENTION_DAYS * 86400` (mặc định **180 ngày**).
- *Ghi chú tuân thủ*: Thiết kế đồng ý (opt-in) và quyền rút lại đồng ý phù hợp định hướng Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.

---

## 7. Cách thêm một sự kiện mới (3 bước)

1. Thêm định nghĩa event (tên, `source`, danh sách `props` và giới hạn kiểu/độ dài) vào `analytics/event_spec.json`.
2. Gọi `track('ten_su_kien', { ...props })` từ frontend (`src/analytics/tracker.js`) hoặc `trackServerEvent('ten_su_kien', ...)` từ backend controller (`backend/analytics/track.js`).
3. Cập nhật job xử lý tương ứng trong `analytics/analytics/jobs/` (nếu cần tổng hợp chỉ số mới) và chạy lại `pytest`.
