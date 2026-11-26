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
