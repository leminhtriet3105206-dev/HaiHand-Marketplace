# PROMPT TỐI THƯỢNG #3 – PRODUCT ANALYTICS (PHÂN TÍCH HÀNH VI NGƯỜI DÙNG) NHÚNG VÀO TRANG ADMIN

> Cách dùng: copy file vào thư mục gốc repo (đổi tên `ANALYTICS_PROMPT.md`), tạo nhánh `feature/product-analytics`, rồi bảo Agent: "Đọc `ANALYTICS_PROMPT.md` và làm theo, xong mỗi PHASE thì dừng báo cáo."
> Nên chạy SAU Phase 0–1 của prompt sửa lỗi bảo mật (cần middleware JWT chuẩn, rate limit, CORS). Nếu chưa xong, Agent phải tự thêm bản tối thiểu cho riêng route mới và ghi rõ.

---

## VAI TRÒ

Bạn là Senior Full-stack + Data Engineer. Nhiệm vụ: xây hệ thống **product analytics** cho HaiHand Marketplace: thu thập hành vi người dùng trên web, xử lý bằng **Python**, và hiển thị kết quả thành trang **"Phân tích"** nhúng trực tiếp trong **trang admin hiện có** (Express + EJS + Tailwind, cổng 4001) bằng **EJS + Chart.js** (KHÔNG dùng Streamlit, KHÔNG iframe).

Luồng tổng thể:
```
React (tracker) ──POST /api/track──► Backend ──► MongoDB: analytics_events (thô, TTL 180 ngày)
Server hooks (đặt hàng, thanh toán…) ───────────►        ▲
                                                          │ đọc (user chỉ-đọc)
                              Python jobs (pandas/sklearn, chạy theo lịch)
                                                          │ ghi (user chỉ ghi analytics_*)
                                                          ▼
Admin EJS /admin/analytics ◄── đọc ── MongoDB: analytics_* (đã tổng hợp)
```

## BỐI CẢNH (đã khảo sát – PHẢI tự kiểm tra lại)

- `admin/`: `app.js` (Express 5 + EJS + `express-session`, kết nối MongoDB TRỰC TIẾP bằng mongoose, không gọi qua backend API), models riêng trong `admin/models/`, views trong `admin/views/` với `layouts/AdminLayout.ejs`, `partials/header.ejs|sidebar.ejs|footer.ejs`. Giao diện Tailwind tông tím (`purple-600/indigo-600`), có dark mode, sidebar truyền biến `active` (`'dashboard'`, `'users'`, `'revenue'`…). `dashboard.ejs` đã dùng Chart.js (canvas `salesBarChart`, `trafficDonutChart`) – **kiểm tra "Traffic Sources" có phải dữ liệu giả không**; nếu giả, thay bằng dữ liệu thật từ analytics (thiết bị/nguồn truy cập) hoặc gắn nhãn rõ ràng.
- `backend/`: Express 5 + Mongoose 9 + Socket.io, `server.js` ~2800 dòng (nhiều route trong file), `routes/`, `controllers/checkoutController.js` (tạo đơn, thanh toán COD/VNPAY/HAIPAY), `models/`.
- `frontend/`: React 18; `src/api/axiosClient.js` (gắn Bearer token từ `localStorage.user`), `src/context/AuthContext.js`, các trang: `HomePage`, `ProductDetailPage`, `CartPage`, `checkout/CheckoutPage.jsx`, tìm kiếm ở `AppHeader`, `FavoritesPage`, `PublicProfile`, `ChatPage`, kênh người bán `pages/seller/*`.
- Chưa có hệ thống thu thập hành vi nào (hãy `grep -ri "analytics\|trackEvent\|pageview"` để chắc chắn).
- `docker-compose.yml`: 3 service backend/frontend/admin, mạng `haihand-network`, `env_file` từng service.
- Dự án sinh viên, **chưa có lưu lượng thật** → bắt buộc có bộ sinh dữ liệu mô phỏng (Phase 4) để demo, và phải **gắn nhãn dữ liệu mô phỏng** trên giao diện.

## QUY TẮC VÀNG

1. **Verify trước khi sửa**: code thực tế thắng mô tả ở đây; lệch thì ghi vào FIX_LOG.
2. Mỗi tính năng nhỏ = 1 commit; không refactor lan man; không phá luồng đang chạy. Tracking **không bao giờ được làm hỏng hoặc làm chậm** trải nghiệm: mọi lỗi tracker phải bị nuốt (try/catch), không chặn UI, không hiện toast.
3. **Quyền riêng tư (bắt buộc)**: không lưu email/SĐT/địa chỉ/nội dung tin nhắn/mật khẩu/token trong events; không lưu IP thô (chỉ phân loại thiết bị + quốc gia nếu có, hoặc bỏ); chỉ track khi người dùng **đồng ý** (banner cookie/analytics, lưu lựa chọn); tôn trọng `navigator.doNotTrack === '1'`; không track tài khoản Admin; cung cấp nút "Tắt theo dõi" trong trang cài đặt/hồ sơ. Chuỗi tìm kiếm phải che email/số điện thoại (regex) trước khi lưu. (Ghi chú tuân thủ: Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân yêu cầu sự đồng ý – ghi trong tài liệu, không tự diễn giải pháp lý.)
4. **Không tin client cho chuyển đổi**: `order_placed`, `payment_success`, `signup`, `seller_applied` do **server** phát sinh tại controller; client chỉ gửi hành vi duyệt/tương tác.
5. Endpoint thu thập phải chịu được bị lạm dụng: validate whitelist, giới hạn kích thước, rate limit, dedupe theo `eventId`, không tin `userId` do client gửi (chỉ lấy từ JWT nếu có; **không** dùng fallback header `userid`).
6. Python dùng tài khoản MongoDB **chỉ đọc** cho `analytics_events`/`orders`/`posts`/`users`, và tài khoản **chỉ ghi** vào `analytics_*`. Không bao giờ ghi vào `orders/users/posts`. Hướng dẫn tạo user trong tài liệu (không tự chạy trên DB thật, không commit secret).
7. Kết quả tổng hợp **idempotent**: chạy lại job cùng khoảng ngày cho ra cùng kết quả (upsert theo khóa), không nhân đôi.
8. Test cho mỗi phần (Jest + supertest + `mongodb-memory-server` cho Node; pytest cho Python). Ghi kết quả vào `docs/FIX_LOG_ANALYTICS.md`.
9. Không chạy lệnh phá hủy (không xóa DB thật, không `git push --force`); không đụng file `.env`, chỉ thêm biến vào `.env.example`.
10. Mọi chuỗi hiển thị bằng tiếng Việt; số tiền dạng `1.250.000 ₫`; ngày `dd/MM/yyyy`; múi giờ `Asia/Ho_Chi_Minh` khi tính theo ngày/giờ.
11. Xong mỗi PHASE: chạy test, khởi động thử, rồi dừng báo cáo.

---

# PHASE 1 – THU THẬP: MODEL + API NHẬN SỰ KIỆN (backend)

### 1.1 Từ điển sự kiện (một nguồn sự thật)
Tạo `backend/analytics/eventSpec.js` (và bản sao Python `analytics/event_spec.py` sinh từ cùng JSON `analytics/event_spec.json` ở thư mục gốc để hai bên không lệch). Mỗi event có: `name`, `source` (`client`|`server`), danh sách `props` cho phép (kiểu + giới hạn). Bộ tối thiểu:

| Event | Nguồn | Props cho phép |
|---|---|---|
| `page_view` | client | `path`, `title`, `referrer` (chỉ domain), `utm_source/medium/campaign` |
| `product_view` | client | `productId`, `sellerId`, `category`, `price`, `fromList` (`home|search|category|related|shop|favorites`), `position` |
| `product_impression` | client (throttle, gộp lô) | `productIds[]` (≤20), `list`, |
| `search` | client | `query` (≤100, đã che PII), `resultCount`, `filters` (object nhỏ) |
| `search_result_click` | client | `query`, `productId`, `position` |
| `filter_apply` | client | `category`, `priceMin`, `priceMax`, `condition`, `sort` |
| `add_to_cart` / `remove_from_cart` | client | `productId`, `sellerId`, `quantity`, `price`, `variantId?` |
| `favorite_add` / `favorite_remove` | client | `productId` |
| `follow_shop` / `unfollow_shop` | client | `sellerId` |
| `chat_start` | client | `sellerId`, `productId?` |
| `checkout_start` | client | `itemCount`, `cartValue` |
| `payment_method_select` | client | `method` (`COD|VNPAY|HAIPAY`) |
| `signup` | **server** | `method` |
| `order_placed` | **server** | `orderId`, `sellerId`, `value`, `itemCount`, `paymentMethod` |
| `payment_success` / `payment_failed` | **server** | `orderId`, `method` |
| `order_cancelled` | **server** | `orderId`, `by` (`buyer|seller|admin|system`) |
| `seller_applied` | **server** | – |
| `product_created` | **server** | `productId`, `sellerId` |

### 1.2 Model & chỉ mục
`backend/models/AnalyticsEvent.js` (collection `analytics_events`):
```js
{
  eventId:     { type: String, required: true, unique: true },   // UUID do client/server sinh (dedupe)
  name:        { type: String, required: true, index: true },
  ts:          { type: Date, required: true, index: true },        // thời điểm sự kiện (client, đã kẹp ±24h so với server)
  receivedAt:  { type: Date, default: Date.now },
  anonymousId: { type: String, required: true, index: true },     // id ẩn danh lưu localStorage
  sessionId:   { type: String, required: true, index: true },
  userId:      { type: ObjectId, ref: 'User', index: true },      // chỉ từ JWT, có thể rỗng
  props:       { type: Object, default: {} },
  context:     { path: String, device: String /*mobile|tablet|desktop*/, browser: String, os: String, locale: String, viewport: String },
  synthetic:   { type: Boolean, default: false, index: true }     // dữ liệu mô phỏng
}
```
- Index kép: `{name:1, ts:-1}`, `{userId:1, ts:-1}`, `{sessionId:1, ts:1}`, `{'props.productId':1, ts:-1}`.
- **TTL**: `{receivedAt:1}` với `expireAfterSeconds` = `ANALYTICS_RETENTION_DAYS` (mặc định 180) × 86400. Ghi rõ trong tài liệu.

### 1.3 Route `POST /api/track` (`backend/routes/track.js`, mount trong `server.js`)
- Middleware: `optionalAuth` (nếu có Bearer JWT hợp lệ thì gán `req.user`, nếu không thì bỏ qua, **KHÔNG** đọc header `userid`); rate limit 120 request/phút/IP; `express.json({limit:'64kb'})`.
- Body: `{ anonymousId, sessionId, events: [ {eventId, name, ts, props} ... ] }`, tối đa **20 event/request**.
- Validate chặt: tên nằm trong whitelist **client**; props chỉ giữ key cho phép, ép kiểu, cắt độ dài; `ObjectId` hợp lệ; `query` che email/SĐT (`/[\w.+-]+@[\w-]+\.[\w.]+/`, `/\b(?:\+?84|0)\d{8,10}\b/`); `ts` kẹp trong khoảng ±24h quanh giờ server (nếu lệch → dùng giờ server). `context` suy ra từ header `User-Agent` bằng `ua-parser-js` (không lưu UA thô, không lưu IP).
- Bỏ qua (204) nếu `req.user.role === 'Admin'`. Trả **204** nhanh, ghi `insertMany(..., {ordered:false})` và nuốt lỗi duplicate `eventId`. Không bao giờ trả lỗi chi tiết.
- `GET /api/track/ping` (không cần) – không làm.
- Hàm dùng chung `trackServerEvent(name, { userId, sessionId, anonymousId, props })` trong `backend/analytics/track.js` để các controller gọi (fire-and-forget, try/catch, **không await làm chậm** luồng chính).
- Test: sự kiện hợp lệ lưu đúng; tên lạ bị loại; props thừa bị cắt; trùng `eventId` không nhân đôi; >20 event → 413/400; email trong `query` bị che; user Admin bị bỏ qua; header `userid` không có tác dụng.

---

# PHASE 2 – THU THẬP: TRACKER Ở FRONTEND

### 2.1 Thư viện `frontend/src/analytics/`
- `tracker.js`: `initTracker()`, `track(name, props)`, `identify()` (khi đăng nhập/đăng xuất vẫn giữ `anonymousId`, server tự gắn `userId` từ JWT), `setConsent(granted)`, `getConsent()`.
  - `anonymousId`: UUID trong `localStorage` (`hh_aid`). `sessionId`: UUID trong `sessionStorage`/`localStorage` kèm `lastActive`; **hết phiên sau 30 phút không hoạt động** hoặc khi mở tab mới sau 30 phút.
  - **Hàng đợi + gộp lô**: đẩy vào mảng, gửi mỗi 5 giây hoặc khi đủ 10 event, và khi `visibilitychange → hidden`/`pagehide` dùng `navigator.sendBeacon` (fallback `fetch keepalive`). Lỗi mạng: giữ lại tối đa 100 event trong bộ nhớ, thử lại có backoff; quá giới hạn thì bỏ.
  - Chỉ chạy khi `consent === 'granted'` và `!doNotTrack`; chưa đồng ý thì **không gửi và không lưu gì ngoài lựa chọn consent**.
  - Gửi tới `${REACT_APP_API_URL}/api/track` dùng `fetch`/beacon riêng (không qua `axiosClient` để không dính interceptor/lỗi UI); nếu có token thì gắn `Authorization: Bearer` (với sendBeacon không gắn header được → dùng `fetch keepalive` khi có token, `sendBeacon` khi ẩn danh; hoặc truyền token trong body trường `auth` rồi server verify – chọn một cách và ghi rõ).
  - Throttle `product_impression`: dùng `IntersectionObserver` (≥50% thẻ hiện trong ≥1 giây), mỗi sản phẩm tối đa 1 lần/phiên/list.
- `ConsentBanner.jsx` (tiếng Việt, gắn trong `App.js`, hiện lần đầu, 2 nút "Đồng ý" / "Từ chối", link giải thích) + mục bật/tắt trong `ProfilePage` hoặc footer.
- `usePageViews.js`: hook dùng `useLocation` ghi `page_view` mỗi lần đổi route (không ghi trùng hai lần liên tiếp cùng path; bỏ qua `/seller-channel/*` nội bộ chỉ nếu bạn quyết định – mặc định **vẫn ghi** để phân tích hành vi người bán, gắn `context.area='seller'`).

### 2.2 Gắn điểm đo (instrumentation) – mỗi chỗ 1 commit nhỏ
- `ProductDetailPage`: `product_view` (kèm `fromList`/`position` lấy từ `location.state` – cập nhật nơi điều hướng để truyền state), `favorite_add/remove`, `follow_shop`, `chat_start`, `add_to_cart`.
- `HomePage`/danh sách/`CategoryPage`/`FavoritesPage`/`PublicProfile`: `product_impression` + `product_view` khi bấm thẻ (truyền `fromList`).
- Tìm kiếm (`AppHeader`/trang kết quả): `search` (sau khi có kết quả để biết `resultCount`; debounce, không ghi mỗi phím), `search_result_click`, `filter_apply`.
- Giỏ hàng (`CartPage`/context): `add_to_cart`, `remove_from_cart`, cập nhật số lượng.
- `CheckoutPage`: `checkout_start` (khi vào trang có giỏ), `payment_method_select`.
- Gửi `sessionId` + `anonymousId` kèm request tạo đơn/đăng ký (header `x-hh-sid`, `x-hh-aid`) để server gắn sự kiện chuyển đổi vào đúng phiên (xem Phase 3). Chỉ thêm header khi đã consent.
- Không thêm tracking vào luồng thanh toán nhạy cảm (số thẻ, PIN, OTP, nội dung chat).
- Test: Jest/React Testing Library cho tracker (không gửi khi chưa consent; gộp lô; hết phiên 30 phút; dedupe).

---

# PHASE 3 – THU THẬP: SỰ KIỆN PHÍA SERVER

Dùng `trackServerEvent` (fire-and-forget) tại:
- Tạo đơn thành công (`checkoutController`): `order_placed` cho **từng đơn con** (orderId, sellerId, value, itemCount, paymentMethod), kèm `sessionId/anonymousId` lấy từ header `x-hh-sid/x-hh-aid` (nếu thiếu thì tạo sessionId rỗng-đánh-dấu `unknown`).
- Thanh toán xác nhận (nơi settle thanh toán VNPAY/HAIPAY, hoặc chuyển `escrow`): `payment_success`; thất bại/hết hạn: `payment_failed`.
- Hủy đơn (`cancelOrderWithRefundAndRestock` hoặc nơi hủy hiện có): `order_cancelled` (`by`).
- Đăng ký tài khoản: `signup`; gửi hồ sơ người bán: `seller_applied`; tạo sản phẩm (`seller.js`): `product_created`.
- Test: tạo đơn → có đúng 1 `order_placed` mỗi đơn con; lỗi khi ghi analytics **không làm đơn hàng thất bại**.

---

# PHASE 4 – PYTHON: TỔNG HỢP & PHÂN TÍCH

### 4.1 Cấu trúc thư mục `analytics/` (gốc repo)
```
analytics/
  README.md                # cách chạy, định nghĩa chỉ số, tạo user Mongo
  requirements.txt         # pymongo, pandas, numpy, scikit-learn, python-dateutil, pytz, pytest, mongomock
  analytics/
    __init__.py
    config.py              # đọc env: ANALYTICS_MONGO_URI (đọc), ANALYTICS_WRITE_MONGO_URI (ghi), DB_NAME, TZ
    db.py                  # kết nối, hàm đọc DataFrame, hàm upsert
    event_spec.py          # từ event_spec.json
    sessions.py            # dựng phiên từ events
    jobs/
      daily_metrics.py     # DAU/WAU/MAU, phiên, trang/phiên, thời lượng, tỷ lệ thoát, thiết bị, nguồn, người mới/quay lại
      funnel.py            # phễu mua hàng
      rfm_segments.py      # RFM + KMeans
      cohorts.py           # giữ chân theo tuần
      product_performance.py
      search_insights.py
      heatmap.py           # tuần × giờ
      related_products.py  # (tùy chọn) đồng xuất hiện "người xem A cũng xem B"
    run.py                 # CLI: python -m analytics.run --job all --since 30d [--tz Asia/Ho_Chi_Minh]
    seed_demo.py           # sinh dữ liệu mô phỏng
  tests/                   # pytest
  Dockerfile
```
- Mọi job: hàm thuần `compute(df_events, df_orders, ...) -> dict/DataFrame` (dễ test) + hàm `run(since, until)` đọc DB và upsert kết quả. Ghi log vào `analytics_runs` (job, khoảng, số dòng đọc/ghi, thời gian, lỗi).
- Chỉ đọc dữ liệu `synthetic:false` **hoặc** cả hai tùy cờ `--include-synthetic` (mặc định: gồm mô phỏng khi **không có** dữ liệu thật, và đánh cờ `hasSynthetic` vào kết quả để admin hiện nhãn).

### 4.2 Định nghĩa chỉ số (phải đúng như sau, ghi vào README)
- **Phiên**: dựng theo `sessionId` của client; sự kiện không có `sessionId` hợp lệ → cắt phiên theo `anonymousId` với khoảng nghỉ 30 phút. Thời lượng phiên = max(ts) − min(ts) (phiên 1 sự kiện = 0). **Tỷ lệ thoát** = phiên chỉ có đúng 1 `page_view`.
- **Người dùng hoạt động**: DAU/WAU/MAU theo `userId` nếu có, ngược lại `anonymousId` (ghi rõ "khách ẩn danh" vs "đã đăng nhập"). Người mới = lần đầu thấy `anonymousId`/`userId` trong kỳ.
- **Phễu mua hàng** (theo phiên, tính cả theo ngày và theo nguồn/thiết bị): `Phiên có xem sản phẩm` → `Thêm giỏ` → `Bắt đầu thanh toán` → `Đặt hàng (order_placed)` → `Thanh toán thành công / hoàn tất`. Mỗi bước: số phiên, % so với bước trước, % so với bước đầu, **điểm rơi lớn nhất**. Bỏ giỏ = phiên có `add_to_cart` nhưng không có `order_placed` trong cùng phiên hoặc 24h kế (nối theo `userId`).
- **RFM** (khách có đơn `Completed`/đã thanh toán, lấy từ collection `orders`, không từ events): R = số ngày từ đơn gần nhất đến hôm nay, F = số đơn, M = tổng giá trị. Chấm điểm 1–5 theo phân vị (xử lý trùng giá trị bằng `rank(method='first')`). Nhãn: `Champions` (R≥4,F≥4), `Khách trung thành` (F≥4), `Tiềm năng` (R≥4,F≤2), `Có nguy cơ rời bỏ` (R≤2,F≥3), `Ngủ đông/Đã mất` (R≤2,F≤2), `Mới`.
- **KMeans**: đặc trưng = log1p(RFM) + hành vi (số phiên 30 ngày, số `product_view`, tỷ lệ giỏ→đơn, giờ hoạt động trung vị), chuẩn hóa `StandardScaler`; chọn k ∈ [3,6] theo silhouette (cố định `random_state=42`); mô tả mỗi cụm bằng giá trị trung vị các đặc trưng và **đặt tên tự động** theo đặc điểm nổi trội (ví dụ "Săn sale – xem nhiều, mua ít"). Không đủ dữ liệu (<30 khách) → bỏ qua KMeans, chỉ trả RFM, ghi chú trong kết quả.
- **Cohort giữ chân theo tuần**: cohort = tuần đầu tiên thấy người dùng; retention tuần N = % người trong cohort có ít nhất 1 sự kiện (hoặc 1 đơn – tính cả hai chỉ số) ở tuần N. Trả ma trận cohort × tuần (0..8).
- **Hiệu quả sản phẩm** (theo ngày và tổng kỳ, cho từng `productId`): `views`, `uniqueViewers`, `impressions`, `ctr = views/impressions`, `addToCart`, `cartRate = addToCart/views`, `orders`, `conversion = orders/views` (đơn tính theo sản phẩm trong `orders.items`), `favorites`. Cờ **"Xem nhiều – ít mua"**: views ≥ P75 của danh mục và conversion ≤ P25; cờ **"Tiềm năng"**: conversion ≥ P75 nhưng views ≤ P25 (nên đẩy hiển thị); so sánh `price` với trung vị danh mục (`priceVsCategory`).
- **Tìm kiếm**: top truy vấn (chuẩn hóa chữ thường, bỏ dấu cách thừa), số lần, `ctr` (có click kết quả), `zeroResultRate` (`resultCount == 0`), truy vấn → chuyển đổi (đặt đơn trong cùng phiên), danh sách **truy vấn không có kết quả** (cơ hội bổ sung hàng).
- **Heatmap**: số phiên theo thứ trong tuần × giờ (múi giờ Việt Nam).
- **Quan tâm theo danh mục**: views/addToCart/orders theo `category`.
- (Tùy chọn) **Related products**: đồng xuất hiện trong cùng phiên (lift/jaccard), top 8 mỗi sản phẩm → `analytics_related_products`; nếu làm, đề xuất dùng cho mục "Có thể bạn quan tâm" ở trang sản phẩm (không bắt buộc đổi UI).

### 4.3 Collection kết quả (Agent tạo, khóa upsert ghi bên cạnh)
`analytics_daily` (`date`+`dimension`+`key`), `analytics_funnel` (`date`+`segment`), `analytics_segments` (`userId`: rfm_r/f/m, rfm_label, cluster, clusterName, updatedAt) + `analytics_cluster_profiles`, `analytics_cohorts` (`cohortWeek`), `analytics_products` (`date`+`productId`) và `analytics_products_summary` (kỳ 7/30/90 ngày), `analytics_search` (`date`+`query`), `analytics_heatmap` (`weekday`+`hour`+`period`), `analytics_runs`. Index phù hợp truy vấn của admin.

### 4.4 Bộ sinh dữ liệu mô phỏng `seed_demo.py`
- Tham số: `--days 60 --sessions-per-day 400 --seed 42 --purge-synthetic`.
- Đọc `users`, `posts` (sản phẩm đang `active`), `categories` **có thật** từ DB để `productId/sellerId/category` hợp lệ; KHÔNG ghi vào `users/posts/orders`.
- Sinh hành vi **có quy luật thực tế**: mùa vụ theo thứ/giờ (cao điểm 20–22h và cuối tuần), 60% mobile, nguồn (trực tiếp/Facebook/Google/Zalo), phễu xấp xỉ: xem 100% → thêm giỏ ~12% → thanh toán ~55% của giỏ → đặt đơn ~70% → thanh toán thành công ~92%; một nhóm "người săn sale" xem nhiều không mua; một nhóm khách quay lại mua nhiều lần; 8% truy vấn tìm kiếm trả 0 kết quả (ví dụ "iphone 20 pro", "áo khoác lông vũ cũ size xs"); sản phẩm giá cao hơn trung vị danh mục có conversion thấp hơn.
- Mọi event đặt `synthetic:true`; đơn hàng mô phỏng **không** tạo trong `orders` (chỉ event `order_placed` synthetic) → RFM vẫn tính từ `orders` thật; nếu `orders` thật quá ít (<30 khách), cho phép `--seed-rfm-from-events` để job RFM dùng event `order_placed` synthetic (đánh cờ rõ).
- `--purge-synthetic` xóa event `synthetic:true` và kết quả đã tổng hợp từ chúng.
- Test pytest: seed → chạy từng job → kiểm các bất biến (phễu không tăng ở bước sau; tổng phiên theo thiết bị = tổng phiên; RFM có đủ nhãn; chạy lại job không nhân đôi).

### 4.5 Chạy theo lịch & triển khai
- Thêm service `analytics` vào `docker-compose.yml` (profile `analytics`, không bật mặc định): image Python 3.12-slim, `env_file: ./analytics/.env`, lệnh vòng lặp `python -m analytics.run --job all --since 2d` mỗi giờ, và `--job rfm_segments,cohorts --since 90d` mỗi đêm. (Hoặc dùng `supercronic`.) Có hướng dẫn chạy tay.
- `analytics/.env.example` (chỉ tên biến). Tài liệu cách tạo hai user Mongo (đọc / ghi `analytics_*`) bằng `db.createUser` – ghi trong README, không chạy.

---

# PHASE 5 – TRANG "PHÂN TÍCH" TRONG ADMIN (EJS + Chart.js)

Tích hợp vào **admin hiện có**, giữ nguyên phong cách (Tailwind tím, dark mode, layout `AdminLayout`).

### 5.1 Khung
- `admin/models/`: thêm model **chỉ đọc** (`strict:false`, `collection` đặt đúng tên, không có `save` ở route) cho các collection `analytics_*` cần đọc, hoặc dùng `mongoose.connection.collection('analytics_daily')` trực tiếp.
- `admin/routes/analytics.js` (hoặc thêm vào `app.js` nếu dự án chưa có thư mục routes, giữ nhất quán): 
  - `GET /admin/analytics` → render `analytics.ejs` (tab mặc định "Tổng quan").
  - `GET /admin/analytics/api/:section?from=&to=&segment=` (`overview|funnel|customers|products|search|retention|traffic`) → JSON cho Chart.js. Mọi route dùng **đúng middleware kiểm tra admin hiện có** (xem `app.js`, đừng tự tạo bản yếu hơn); validate `from/to` (≤ 365 ngày, ISO date), `segment` whitelist; giới hạn số dòng trả về (top 20/50); **không trả `userId` thô** trừ trang "Khách hàng" (cần để admin tra cứu) – ở đó join tên và **che email** (`a***@gmail.com`).
- `sidebar.ejs`: thêm mục **"Phân tích hành vi"** (icon biểu đồ) với `active === 'analytics'`, đặt dưới "Doanh thu". Cập nhật `header`/breadcrumb nếu có.
- `views/analytics.ejs`: dùng cùng layout/partials như `revenue.ejs`. Chart.js tải bằng cùng CDN đã dùng ở `dashboard.ejs` (kiểm tra phiên bản, không thêm thư viện thừa). Tất cả biểu đồ phải đẹp ở dark mode (đọc màu từ class `dark`), responsive, có trạng thái **đang tải / không có dữ liệu / lỗi**.
- Bộ lọc chung ở đầu trang: khoảng ngày (7/30/90 ngày + tùy chọn), thiết bị, nguồn; nhớ lựa chọn bằng query string. **Banner vàng "Đang hiển thị dữ liệu mô phỏng"** nếu kết quả có `hasSynthetic`. Hiện "Cập nhật lần cuối: <thời gian> (từ `analytics_runs`)".

### 5.2 Các tab (mỗi tab có thẻ KPI + biểu đồ + bảng + 1–2 dòng "Gợi ý hành động" sinh bằng luật đơn giản, tiếng Việt)
1. **Tổng quan**: thẻ KPI (Người dùng hoạt động, Phiên, Trang/phiên, Thời lượng TB, Tỷ lệ thoát, Tỷ lệ chuyển đổi), đường DAU theo ngày, cột phiên theo thiết bị, bánh nguồn truy cập, **heatmap tuần × giờ** (vẽ bằng lưới div Tailwind đổ màu theo cường độ hoặc Chart.js matrix – chọn cách không cần thêm thư viện).
2. **Phễu mua hàng**: biểu đồ cột ngang 5 bước + % rơi; bảng so sánh phễu theo thiết bị/nguồn; thẻ "Điểm rơi lớn nhất" + tỷ lệ **bỏ giỏ**.
3. **Khách hàng**: phân bố nhãn RFM (cột/bánh), bảng cụm KMeans (tên cụm, số khách, R/F/M trung vị, hành vi nổi trội), bảng 20 khách "Có nguy cơ rời bỏ" có giá trị cao (tên, số đơn, lần mua cuối, email đã che) – nút xuất CSV (chỉ cột không nhạy cảm).
4. **Sản phẩm**: bảng xếp hạng có sắp xếp (views, cartRate, conversion, favorites), hai danh sách "Xem nhiều – ít mua" và "Tiềm năng – nên đẩy", biểu đồ danh mục (views vs đơn), liên kết sang trang `edit-post` của sản phẩm.
5. **Tìm kiếm**: top truy vấn, **truy vấn không có kết quả** (cơ hội), CTR tìm kiếm, đám mây/bảng từ khóa.
6. **Giữ chân**: bảng cohort tô màu theo % (ô trống khi chưa đủ tuần), đường retention trung bình theo tuần.
- Tab nào thiếu dữ liệu cho kỳ đã chọn → thông báo "Chưa đủ dữ liệu" kèm hướng dẫn chạy job/seed (chỉ hiện cho admin).

### 5.3 Dọn dẹp liên quan
- `dashboard.ejs`: nếu "Traffic Sources" là số giả → thay bằng dữ liệu thật từ `analytics_daily` (nguồn truy cập) hoặc ẩn đi và ghi vào FIX_LOG. Không để số liệu bịa hiển thị như thật.

---

# PHASE 6 – (TÙY CHỌN, NÊN LÀM NẾU CÒN THỜI GIAN) THÔNG TIN CHO NGƯỜI BÁN

- Backend: `GET /api/seller/analytics?range=7|30|90` (`protect` + `isSeller`), **chỉ** trả dữ liệu của sản phẩm thuộc shop đăng nhập từ `analytics_products` + `analytics_search`: lượt xem, thêm giỏ, tỷ lệ chuyển đổi, top sản phẩm, từ khóa dẫn tới sản phẩm của shop, giờ khách xem nhiều. Không bao giờ trả dữ liệu cá nhân của người mua.
- Frontend: trang `pages/seller/SellerAnalytics.js` (route `/seller-channel/analytics`, mục menu "Phân tích shop") với 4 thẻ KPI + 2 biểu đồ + bảng sản phẩm; phong cách `SellerLayout`. Có thể dùng thư viện biểu đồ nhẹ đã có trong dự án; chưa có thì dùng Chart.js qua npm.
- Gợi ý hành động cho người bán (luật đơn giản): "Sản phẩm X có nhiều lượt xem nhưng ít người thêm vào giỏ: xem lại giá/ảnh".

---

# PHASE 7 – HOÀN THIỆN, TÀI LIỆU, KIỂM THỬ

- `docs/ANALYTICS.md`: kiến trúc, sơ đồ luồng, từ điển sự kiện, định nghĩa chỉ số, cách chạy seed/jobs, cách tạo user Mongo, chính sách quyền riêng tư & lưu trữ (TTL), cách thêm một sự kiện mới (3 bước: thêm vào `event_spec.json`, gọi `track()`, thêm vào job nếu cần).
- Hiệu năng: kiểm tra `explain()` cho các truy vấn job chính có dùng index; job 60 ngày × 400 phiên/ngày chạy < 60 giây trên máy dev.
- Bảo mật: kiểm tra lại `/api/track` bị gọi 1000 lần/phút → bị chặn; admin routes không truy cập được khi chưa đăng nhập admin; không có secret trong code.
- Kịch bản e2e thủ công (ghi vào FIX_LOG): bật consent → duyệt sản phẩm → thêm giỏ → đặt đơn COD → trong 10 giây thấy event trong DB → chạy `python -m analytics.run --job all --since 1d` → mở `/admin/analytics` thấy số liệu cập nhật.

## TIÊU CHÍ HOÀN THÀNH

- [ ] Từ chối consent ⇒ **không** có request `/api/track` nào, không có dữ liệu nào ngoài lựa chọn consent trong localStorage.
- [ ] Đồng ý consent ⇒ `page_view`, `product_view`, `search`, `add_to_cart`, `checkout_start` xuất hiện trong `analytics_events`; `order_placed` chỉ do server sinh, đúng 1 lần mỗi đơn con.
- [ ] Lỗi analytics (Mongo ghi lỗi, mạng) **không làm hỏng** đặt hàng hay duyệt trang.
- [ ] `seed_demo.py` + `run --job all` tạo đủ các collection `analytics_*`; chạy lại không nhân đôi; `--purge-synthetic` dọn sạch.
- [ ] Trang `/admin/analytics` có 6 tab, bộ lọc ngày, banner dữ liệu mô phỏng, dark mode, responsive; yêu cầu đăng nhập admin.
- [ ] Số liệu khớp các bất biến (phễu không tăng, tổng theo thiết bị = tổng phiên, RFM đủ nhãn).
- [ ] Test Node + pytest xanh; frontend `npm run build` không lỗi mới; tài liệu `docs/ANALYTICS.md` đầy đủ.

## QUY TRÌNH

0. `git checkout -b feature/product-analytics`; tạo `docs/FIX_LOG_ANALYTICS.md` (mỗi mục: việc đã làm, file đổi, test, quyết định).
1. PHASE 1 → test → dừng báo cáo.
2. PHASE 2–3 → dừng báo cáo (kèm demo: banner consent + event vào DB).
3. PHASE 4 (có `seed_demo`) → dừng báo cáo (kèm ảnh/bảng kết quả job).
4. PHASE 5 → dừng báo cáo kèm ảnh chụp màn hình từng tab (Playwright nếu có).
5. PHASE 6–7 → báo cáo cuối.

## ĐẦU RA CUỐI CÙNG (bắt buộc)

1. Danh sách commit theo phase.
2. Bảng: hạng mục | trạng thái (XONG / BỎ QUA + lý do) | file chính | cách kiểm chứng.
3. Danh sách route/collection/biến môi trường **mới**.
4. Việc con người phải làm: tạo user Mongo đọc/ghi, đặt biến môi trường (`ANALYTICS_*`, `ANALYTICS_RETENTION_DAYS`), chạy seed/job lần đầu, rà soát nội dung banner đồng ý với giảng viên/chủ dự án.
5. Quyết định cần xác nhận (ví dụ: có track khu vực người bán không; thời gian lưu 180 ngày; nhãn RFM).
6. Hạn chế đã biết và đề xuất bước tiếp (ví dụ: dữ liệu thật còn ít, cần chạy thời gian dài; A/B test; gợi ý sản phẩm).

Nếu code thực tế khác mô tả (tên route, cấu trúc admin, tên file), **code thực tế thắng** – ghi lại khác biệt rồi điều chỉnh cho phù hợp, đừng ép theo prompt.
