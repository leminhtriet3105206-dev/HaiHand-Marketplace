# FIX LOG — Hệ thống Product Analytics (HaiHand)

- **Nhánh**: `feature/product-analytics` (tạo từ `feature/seller-messaging` vì `main` trước đó có xung đột chưa giải quyết)
- **Ngày khởi tạo**: 2026-11-26

---

## Khác biệt phát hiện giữa Specification & Codebase thực tế (Verify-First)

1. **Đã có `backend/routes/track.js` & `backend/models/UserEvent.js` (Recommendation Engine)**:
   - Codebase thực tế đã có `POST /api/track` trong `backend/routes/track.js` phục vụ hệ thống gợi ý (`UserEvent`, payload `{ type, productId, ... }`) kèm các test `backend/test/trackApi.test.js` và `backend/test/behaviorAndRecommendation.test.js`.
   - **Cách xử lý**: Giữ nguyên luồng `UserEvent` cho payload legacy (`type` / `events[].type`) để không làm gãy engine gợi ý và test hiện có; đồng thời xử lý payload Product Analytics mới (`events: [{ eventId, name, ts, props }]`) tại `POST /api/track` (cùng alias `POST /api/analytics/track`), lưu vào collection `analytics_events` (`AnalyticsEvent`) với đầy đủ rule bảo mật/riêng tư của Phase 1.
2. **Xác thực `optionalAuth`**:
   - Middleware `protect` trong `backend/middleware/auth.js` có fallback sang header `userid`.
   - **Cách xử lý**: Tạo riêng `optionalJwtAuth` trong `backend/middleware/auth.js` (chỉ đọc `Authorization: Bearer <token>`, **không** đọc `req.headers.userid`, `req.body.userId`, `req.query.userId`) cho `POST /api/track`.

---

## Nhật ký thực thi theo từng Phase

### Step 0 — Thiết lập nhánh & tài liệu
| Hạng mục | Trạng thái | File đổi | Ghi chú |
|----------|-----------|----------|---------|
| Setup | XONG | `docs/FIX_LOG_ANALYTICS.md` | Tạo nhánh `feature/product-analytics` |

### PHASE 1 — Thu thập: Model + API nhận sự kiện (`backend/`)
| Hạng mục | Trạng thái | File đổi | Cách kiểm chứng |
|----------|-----------|----------|----------------|
| 1.1 Từ điển sự kiện | XONG | `analytics/event_spec.json`, `backend/analytics/eventSpec.js` | `analyticsTrackPhase1.test.js` (test 1, 2, 5) |
| 1.2 Model `AnalyticsEvent` | XONG | `backend/models/AnalyticsEvent.js`, `backend/.env.example` | Index kép + TTL 180 ngày (`ANALYTICS_RETENTION_DAYS`) |
| 1.3 Route `POST /api/track` & `trackServerEvent` | XONG | `backend/routes/track.js`, `backend/analytics/track.js`, `backend/middleware/auth.js`, `backend/test/analyticsTrackPhase1.test.js` | `analyticsTrackPhase1.test.js` (9/9 pass) + `npm test` toàn bộ backend |

### PHASE 2 — Thu thập: Tracker ở Frontend (`frontend/`)
| Hạng mục | Trạng thái | File đổi | Cách kiểm chứng |
|----------|-----------|----------|----------------|
| 2.1 Thư viện `tracker.js`, `ConsentBanner.jsx`, `usePageViews.js` | XONG | `frontend/src/analytics/{tracker.js,ConsentBanner.jsx,usePageViews.js}`, `frontend/src/App.js` | `tracker.test.js` (4/4 pass) |
| 2.2 Gắn điểm đo & nút Tắt theo dõi | XONG | `ProductDetailPage.js`, `HomePage.js`, `ProductListPage.js`, `CartPage.js`, `CheckoutPage.jsx`, `ProfilePage.js`, `axiosClient.js`, `backend/middleware/security.js` | `react-scripts build` thành công |

### PHASE 3 — Thu thập: Sự kiện phía Server (`backend/`)
| Hạng mục | Trạng thái | File đổi | Cách kiểm chứng |
|----------|-----------|----------|----------------|
| 3.1 Hooks `order_placed`, `payment_success`, `payment_failed`, `order_cancelled`, `signup`, `seller_applied`, `product_created` | XONG | `checkoutController.js`, `routes/seller.js`, `server.js`, `test/analyticsCheckoutPhase3.test.js` | `analyticsCheckoutPhase3.test.js` (pass) + `npm test` toàn bộ backend |

### PHASE 4 — Python: Tổng hợp & Phân tích (`analytics/`)
| Hạng mục | Trạng thái | File đổi | Cách kiểm chứng |
|----------|-----------|----------|----------------|
| 4.1–4.3 Core, sessions & 8 jobs (`daily_metrics`, `funnel`, `rfm_segments`, `cohorts`, `product_performance`, `search_insights`, `heatmap`, `related_products`) | XONG | `analytics/analytics/{config,db,event_spec,sessions,run}.py`, `analytics/analytics/jobs/*.py` | `pytest -v` (kiểm bất biến phễu, thiết bị, RFM, idempotency) |
| 4.4–4.5 `seed_demo.py`, Docker & tài liệu | XONG | `analytics/analytics/seed_demo.py`, `analytics/{Dockerfile,requirements.txt,.env.example,README.md}`, `docker-compose.yml` | `pytest -v` (`generate_synthetic_events` + `purge_synthetic`) |


---

## PHASE 5 – Admin EJS Analytics Dashboard

### Findings & Discrepancies
- `admin/views/dashboard.ejs` chart `trafficDonutChart` already used real `User` demographics data (`Người mua`, `Người bán B2C`, `Chờ duyệt`, `Bị khóa`) labeled `(Thống kê thật)`, not fake numbers. Left intact.
- `admin/views/partials/sidebar.ejs` previously used `active === 'analytics'` for `/admin/behavior-analytics` (legacy Recommendation Engine). Updated legacy route to `active: 'behavior-analytics'` ("Phân tích Gợi ý AI") and assigned `active: 'analytics'` to `/admin/analytics` ("Phân tích hành vi").
- `admin/app.js` `checkLogin` middleware now treats `/admin/analytics/api/*` as API requests (returning JSON `401`/`403` instead of redirecting to `/login`).

### Changes
- Created `admin/routes/analytics.js` (`GET /admin/analytics` and `GET /admin/analytics/api/:section` for `overview|funnel|customers|products|search|retention|traffic`) with ISO date range validation (≤365 days), segment whitelist, email masking (`n***@gmail.com`), and rule-based Vietnamese action suggestions.
- Created `admin/views/analytics.ejs` with 6 interactive tabs, Chart.js visualizations, Tailwind dark mode support, 7×24 heatmap grid, synthetic data warning banner, global date/device/source filters persisted in query string, and CSV export for at-risk customers.
- Updated `admin/app.js` and `admin/views/partials/sidebar.ejs`.
- Created `backend/test/analyticsAdminPhase5.test.js`.


---

## PHASE 6 – Seller Analytics View

- Backend: Added `GET /api/seller/analytics?range=7|30|90` in `backend/routes/seller.js` (`protect` + `isSeller`). Queries `analytics_products`, `analytics_products_summary`, and `analytics_events` scoped strictly to `sellerId === req.user._id` / seller's `Post` IDs. Never exposes buyer PII.
- Frontend: Created `frontend/src/pages/seller/SellerAnalytics.js`, mounted at `/seller-channel/analytics` in `frontend/src/App.js`, and added "Phân tích shop" menu item in `frontend/src/pages/seller/SellerLayout.js`.
- Tests: Created `backend/test/analyticsSellerPhase6.test.js` (2/2 passed).
- **Fix**: Removed duplicate legacy `GET /api/seller/analytics` handler (line 228, using `UserEvent.aggregate`) that conflicted with the new Phase 6 handler (line 878, using `analytics_*` collections). Express was matching the old handler first, which failed because `UserEvent` model doesn't exist in Phase 6 test mocks. Also added `fields()` to the `upload` mock in the test.

---

## PHASE 7 – Documentation, Performance & Security Verification

- Created `docs/ANALYTICS.md` covering architecture, event dictionary, metric definitions, Python job execution, MongoDB read/write user creation, privacy & TTL policy, and 3-step guide to add new events.
- **Index & Performance Check**:
  - `analytics_events` defines compound indexes `{name: 1, ts: -1}`, `{userId: 1, ts: -1}`, `{sessionId: 1, ts: 1}`, `{'props.productId': 1, ts: -1}` and TTL index `{receivedAt: 1}` (`180 * 86400` seconds).
  - `analytics_daily` (`date`, `dimension`, `key`), `analytics_funnel` (`date`, `segment`), `analytics_products_summary` (`periodDays`, `productId`), `analytics_search` (`date`, `query`) all use unique compound upsert indexes created by `upsert_records()`.
- **Security Check**:
  - `POST /api/track` enforces 120 req/min/IP rate limit, 64KB body cap, max 20 events/request, client-event whitelist, PII regex masking, and JWT-only `optionalJwtAuth` (ignores `userid` header).
  - `/admin/analytics` and `/admin/analytics/api/:section` require Admin session (`checkLogin` returns 401/403).
  - `/api/seller/analytics` requires `protect` + `isSeller` and filters strictly by logged-in seller's products.
- **E2E Verification Checklist (Manual / Staging)**:
  1. Open frontend → verify `ConsentBanner` appears; click "Từ chối" → confirm zero `POST /api/track` requests in Network tab.
  2. Enable tracking in Profile or click "Đồng ý" → browse product, search, add to cart, place COD order → verify `analytics_events` receives client events and server `order_placed` event.
  3. Run `python -m analytics.run --job all --since 1d` → open `/admin/analytics` → verify updated KPIs and charts.
