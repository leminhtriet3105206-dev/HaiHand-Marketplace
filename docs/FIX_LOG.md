# NHẬT KÝ SỬA LỖI BẢO MẬT & LOGIC – HAIHAND MARKETPLACE

Nhánh thực hiện: `fix/security-and-logic-audit`

## Bảng theo dõi từng hạng mục

| ID | Trạng thái | File đã đổi | Test đã thêm / chạy | Ghi chú |
|---|---|---|---|---|
| 0.1 | ĐÃ SỬA | Xóa các file `*-LAPTOP-G2N88BOO*` và các file nháp (`backend/extract_routes.js`, `backend/test_upload.js`, `backend/test_chatbot.js`, `frontend/scratch_screen.html`, `frontend/src/pages/fix_url.py`, `frontend/src/pages/gen_edit.py`) | `git grep` xác nhận không có module nào import | Dọn sạch file xung đột đồng bộ và file nháp |
| 0.2 | ĐÃ SỬA | `backend/config/env.js`, `backend/.env.example` | Test fail-fast khi thiếu biến môi trường (`backend/phase0_infra.test.js`) | Kiểm tra bắt buộc `MONGO_URI`, `JWT_SECRET`, `SESSION_SECRET`, `CLOUDINARY_*`, `VNPAY_*`, `GHN_WEBHOOK_TOKEN`, `CORS_ORIGINS`, `FIREBASE_*`; `.env.example` để giá trị rỗng |
| 0.3 | ĐÃ SỬA | `backend/middleware/auth.js`, `backend/middleware/validate.js`, `backend/middleware/upload.js`, `backend/middleware/errorHandler.js`, `backend/middleware/security.js`, `backend/utils/b2c.js`, `backend/models/User.js`, `admin/models/User.js`, `backend/server.js`, `admin/app.js` | `backend/phase0_infra.test.js`, `backend/phase1_3_security.test.js`, `backend/p1_6_authStrict.test.js` | `protect` bắt buộc Bearer JWT, chặn `isBanned`/`locked`/`isDeleted`, kiểm tra `tokenVersion` (`tv`), access token 2h + refresh token 7d; thêm `requireOwnerOrAdmin`, `requireAdminJWT`; `validate.js` chống NoSQL injection; gắn `helmet`, `mongoSanitizeMiddleware`, `express-rate-limit`; `upload.js` 5MB/8 files; CORS strict theo `CORS_ORIGINS`; `errorHandler.js` không lộ lỗi nội bộ; `sanitizeUser` & `publicUser` |
| 0.4 | ĐÃ SỬA | `backend/utils/orderStateMachine.js`, `backend/models/Order.js`, `backend/routes/seller.js`, `backend/controllers/shippingController.js`, `backend/controllers/webhookController.js`, `backend/controllers/checkoutController.js`, `backend/server.js`, `backend/test/chatbotRelevance.test.js` | `backend/phase0_infra.test.js`, `backend/p0_2_orderCancel.test.js`, `backend/shippingController.test.js`, `backend/webhook.test.js`, `backend/phase1_3_security.test.js` | Tạo `transitionOrder` nguyên tử (`findOneAndUpdate({_id, status: from})`), kiểm tra bảng chuyển trạng thái hợp lệ + điều kiện thanh toán (`escrow` cho VNPAY/HAIPAY), ghi `statusHistory`, gửi `sendNotification`, hủy luôn qua `cancelOrderWithRefundAndRestock` |
| C1 | ĐÃ SỬA | `backend/server.js`, `backend/utils/vnpay.js`, `backend/middleware/upload.js`, `backend/config/env.js`, `admin/app.js` | `git grep -nE "api_secret\|hashSecret\|secret-key\|khoa-bi-mat\|184464981981638"` trả về 0 kết quả; `backend/phase1_critical.test.js` | Thay toàn bộ secret cứng (Cloudinary, Session, VNPay) bằng `process.env`; cấu hình session cookie `httpOnly: true, sameSite: 'lax', secure: production, saveUninitialized: false` |
| C2 | ĐÃ SỬA | `backend/server.js`, `admin/app.js` | `backend/phase1_critical.test.js` | Xóa `POST /register` trong `backend/server.js`; whitelist field ở `/api/users/register` và `admin/app.js` (cấm `role/isSeller/walletBalance/pendingBalance/isAdmin` từ client) |
| C3 | ĐÃ SỬA | `backend/server.js`, `admin/app.js`, `backend/middleware/security.js`, `backend/utils/password.js` | `backend/phase1_critical.test.js` | Validate `typeof email === 'string' && typeof password === 'string'`, chặn NoSQL injection `{"password":{"$ne":""}}`; dùng `bcrypt` cost >= 10, `sanitizeUser`, `loginLimiter` theo IP + email, thông báo lỗi chung "Sai email hoặc mật khẩu" |
| C4 | ĐÃ SỬA | `backend/utils/password.js`, `backend/server.js`, `backend/routes/haipay.js`, `admin/app.js` | `backend/phase1_critical.test.js` | Tạo `utils/password.js` (`hashPassword`, `verifyPassword`): hỗ trợ cả bcrypt lẫn mật khẩu thô cũ (so sánh hằng-thời-gian + tự động băm lại và lưu DB ngay khi đăng nhập đúng - lazy migration); thống nhất token &密码 giữa HaiPay và trang chính |
| C5 | ĐÃ SỬA | `backend/utils/vnpay.js`, `backend/server.js`, `frontend/src/pages/PaymentResultPage.js`, `frontend/src/pages/HaiPayReturn.jsx`, `frontend/src/pages/HaiPayResult.js` | `backend/phase1_critical.test.js` | Xóa bản legacy `verifyVnpayChecksum` (thiếu/sai `vnp_SecureHash` -> `false`, so sánh hằng-thời-gian); `/api/haipay/verify` và `/api/vnpay/verify` chuyển thành chỉ đọc trạng thái từ DB; ghi tiền/chuyển escrow chỉ tại `/api/vnpay/vnpay_ipn` đã ký (kiểm tra `vnp_TmnCode`, `vnp_Amount === session.amount * 100`, `vnp_ResponseCode === '00'`, `vnp_TransactionStatus === '00'`, cổng idempotent `findOneAndUpdate({_id, status:'pending'})`); tạo `PaymentSession` khi tạo link nạp `NAP_*`; cập nhật frontend poll trạng thái |
| C6 | ĐÃ SỬA | `backend/server.js`, `backend/routes/seller.js`, `frontend/src/index.js`, `frontend/src/api/axiosClient.js` | `backend/phase1_critical.test.js`, bảng kiểm kê toàn bộ write routes bên dưới | Gắn `protect` (JWT) + kiểm tra chủ sở hữu/role cho mọi route ghi/xóa (`PUT/DELETE /api/posts/:id`, `PUT /api/users/profile/:id` kèm whitelist field, `PUT /api/users/change-password/:id` kèm tăng `tokenVersion`, `POST /users/edit/:id`, `/api/admin/*`, `GET /admin/withdrawals`, `GET /admin/orders`, `/api/users/cart*`, `/favorites`, `/follow`, `/api/reviews`, `/api/reports`, `/api/messages*`, `/api/notifications*`); xóa hẳn `GET /api/messages/clear-all` và `GET /api/admin/test-notif` |
| C7 | ĐÃ SỬA | `backend/server.js`, `backend/utils/b2c.js` | `backend/phase1_critical.test.js` | `GET /api/users/public-profile/:userId` và `GET /api/users/:id` (khi không phải chủ/Admin) chỉ trả `publicUser` (không lộ `email, phone, cccd, taxId, bankInfo, walletBalance, walletPin`); `GET /api/users/profile` và `/api/users/:userId/transactions` bắt buộc `protect` chính chủ/Admin (bỏ nhận `userid` từ query/header); `follow-list` không trả `email`; `/api/users/search` dùng `escapeRegex`, trần `limit <= 20`, không trả `email` |
| C8 | ĐÃ SỬA | `backend/routes/haipay.js`, `backend/server.js`, `backend/models/OtpToken.js`, `backend/utils/otpService.js` | `backend/phase1_critical.test.js`, `backend/phase1_3_security.test.js` | `POST /api/haipay/verify-firebase` verify `idToken` qua `firebase-admin` và lấy SĐT/uid từ token đã verify (không bao giờ tin `phoneNumber`/`firebaseUid` trần từ body); xóa hẳn `POST /api/users/forgot-password` (email + SĐT); giữ duy nhất `reset-password-otp` với OTP băm bcrypt, hết hạn 10 phút (`expires: 600`), tối đa 5 lần thử, dùng 1 lần, tăng `tokenVersion` |
| C9 | ĐÃ SỬA | `backend/server.js`, `backend/controllers/checkoutController.js` | `backend/phase1_critical.test.js` | `POST /api/admin/refund-order/:orderId` yêu cầu `requireAdminJWT`, từ chối đơn đã `refunded` (409) hoặc đơn COD/chưa `escrow` (400), gọi `cancelOrderWithRefundAndRestock` đặt cổng atomic `findOneAndUpdate` trước khi `$inc` ví người mua và trừ `pendingBalance` người bán |

---

## BẢNG KIỂM KÊ ROUTE GHI/XÓA (`POST | PUT | PATCH | DELETE`) → MIDDLEWARE (C6)

| File & Dòng | Method & Route | Middleware bảo vệ | Ghi chú |
|---|---|---|---|
| `backend/server.js:364` | `POST /login` | `loginLimiter` (Public Auth) | Đăng nhập Admin SSR |
| `backend/server.js:401` | `POST /api/admin/login` | `loginLimiter` (Public Auth) | Đăng nhập Admin JWT |
| `backend/server.js:523` | `PUT /api/admin/settings` | `requireAdminJWT` | Cập nhật cấu hình sàn |
| `backend/server.js:591` | `PUT /api/admin/users/:id/ban` | `requireAdminJWT` | Khóa / mở khóa user |
| `backend/server.js:604` | `DELETE /api/admin/users/:id` | `requireAdminJWT` | Xóa mềm user |
| `backend/server.js:619` | `PUT /api/admin/users/:id/restore` | `requireAdminJWT` | Khôi phục user |
| `backend/server.js:655` | `POST /users/edit/:id` | `requireAdminJWT` | Admin sửa user / đổi role |
| `backend/server.js:688` | `POST /admin/approve-seller/:id` | `requireAdmin` | Admin duyệt mở shop |
| `backend/server.js:706` | `POST /admin/reject-seller/:id` | `requireAdmin` | Admin từ chối mở shop |
| `backend/server.js:740` | `DELETE /api/admin/posts/:id` | `requireAdminJWT` | Admin xóa bài đăng |
| `backend/server.js:795` | `POST /admin/posts/delete/:id` | `requireAdmin` | Admin xóa bài vi phạm |
| `backend/server.js:840` | `POST /categories/add` | `requireAdmin, upload.single('image')` | Admin thêm danh mục |
| `backend/server.js:862` | `POST /categories/edit/:id` | `requireAdmin, upload.single('image')` | Admin sửa danh mục |
| `backend/server.js:890` | `POST /admin/reports/ignore/:id` | `requireAdmin` | Admin bỏ qua báo cáo |
| `backend/server.js:955` | `POST /orders/update-status/:id` | `requireAdmin` | Admin cập nhật trạng thái đơn |
| `backend/server.js:993` | `POST /api/admin/release-funds/:orderId` | `requireAdminJWT` | Admin giải ngân escrow |
| `backend/server.js:1104` | `POST /api/admin/refund-order/:orderId` | `requireAdminJWT` | Admin hoàn tiền escrow |
| `backend/server.js:1180` | `PUT /api/admin/withdraw/:id/approve` | `requireAdminJWT` | Admin duyệt rút tiền |
| `backend/server.js:1221` | `POST /api/admin/notifications/read` | `requireAdminJWT` | Admin đọc thông báo |
| `backend/server.js:1266` | `POST /api/users/login` | `loginLimiter` (Public Auth) | Đăng nhập người dùng |
| `backend/server.js:1289` | `POST /api/users/register` | Public Auth (Whitelist field) | Đăng ký khách hàng |
| `backend/server.js:1334` | `PUT /api/users/change-password/:id` | `protect, requireOwnerOrAdmin('id')` | Đổi mật khẩu + tăng `tokenVersion` |
| `backend/server.js:1357` | `POST /api/users/send-otp` | `otpLimiter` (Public OTP) | Gửi OTP đặt lại mật khẩu |
| `backend/server.js:1399` | `POST /api/users/reset-password-otp` | Public OTP (Verify OTP băm, <=5 lần) | Đặt lại mật khẩu bằng OTP |
| `backend/server.js:1503` | `PUT /api/users/profile/:id` | `protect, requireOwnerOrAdmin('id'), upload.single('avatar')` | Cập nhật hồ sơ (Whitelist field) |
| `backend/server.js:1589` | `POST /api/users/follow` | `protect` | Theo dõi (`followerId` từ token) |
| `backend/server.js:1647` | `POST /api/users/favorites` | `protect` | Yêu thích (`userId` từ token) |
| `backend/server.js:1809` | `POST /api/posts` | `protect, isSeller, upload.array('images', 5)` | Đăng sản phẩm mới |
| `backend/server.js:1905` | `PUT /api/posts/:id` | `protect, upload.array('images', 8)` + kiểm tra chủ sở hữu/Admin | Sửa sản phẩm (Whitelist field) |
| `backend/server.js:1975` | `DELETE /api/posts/:id` | `protect` + kiểm tra chủ sở hữu/Admin | Xóa sản phẩm |
| `backend/server.js:2019` | `DELETE /api/users/cart/clear/:userId` | `protect, requireOwnerOrAdmin('userId')` | Xóa toàn bộ giỏ hàng |
| `backend/server.js:2028` | `DELETE /api/users/cart/:userId/:postId` | `protect, requireOwnerOrAdmin('userId')` | Xóa 1 món khỏi giỏ hàng |
| `backend/server.js:2039` | `POST /api/users/cart` | `protect` | Thêm vào giỏ (`userId` từ token) |
| `backend/server.js:2084` | `POST /api/reviews` | `protect` + kiểm tra buyer của đơn `Completed` | Đánh giá đơn hàng |
| `backend/server.js:2142` | `POST /api/reports` | `protect` | Báo cáo bài đăng (`reporter` từ token) |
| `backend/server.js:2170` | `POST /api/checkout` | `protect` | Đặt hàng đa shop |
| `backend/server.js:2173` | `POST /api/users/:userId/checkout` | `protect` + kiểm tra chính chủ | Alias đặt hàng |
| `backend/server.js:2186` | `POST /api/haipay/deposit` | `protectStrict` | Tạo link nạp tiền Ví HaiPay |
| `backend/server.js:2281` | `POST /api/haipay/verify` | Read-only status check | Chỉ đọc trạng thái từ DB (C5) |
| `backend/server.js:2296` | `POST /api/users/:userId/withdraw` | `protectStrict` + kiểm tra chính chủ | Rút tiền từ ví |
| `backend/server.js:2345` | `POST /api/vnpay/create_payment_url` | `protect` + kiểm tra buyer | Tạo link thanh toán VNPAY |
| `backend/server.js:2450` | `POST /api/vnpay/verify` | Read-only status check | Chỉ đọc trạng thái từ DB (C5) |
| `backend/server.js:2616` | `PUT /api/orders/:orderId/confirm` | `protect` + kiểm tra seller/Admin | Seller xác nhận đơn |
| `backend/server.js:2658` | `PUT /api/orders/:orderId/cancel` | `protect` + kiểm tra buyer/seller/Admin | Hủy đơn nguyên tử |
| `backend/server.js:2699` | `PUT /api/orders/:orderId/receive` | `protect` + kiểm tra buyer/Admin | Buyer xác nhận đã nhận hàng |
| `backend/server.js:2869` | `PUT /api/notifications/read-all` | `protect` | Đọc tất cả thông báo (`userId` từ token) |
| `backend/server.js:2909` | `PUT /api/notifications/read-by-type` | `protect` | Đọc thông báo theo loại (`userId` từ token) |
| `backend/server.js:2935` | `PUT /api/notifications/:id/read` | `protect` + kiểm tra chủ thông báo | Đọc 1 thông báo |
| `backend/server.js:3012` | `POST /api/messages` | `protect, uploadLimiter, upload.single('image')` | Gửi tin nhắn (`sender` từ token) |
| `backend/server.js:3050` | `PUT /api/messages/mark-read` | `protect` | Đánh dấu đã đọc (`receiver` từ token) |
| `backend/server.js:3070` | `POST /api/chatbot/ask` | `chatbotLimiter` | Hỏi trợ lý AI (chỉ đọc catalog) |
| `backend/routes/seller.js:46` | `POST /api/users/apply-seller` | `protect` | Đăng ký mở Shop |
| `backend/routes/seller.js:124` | `PUT /api/admin/approve-seller/:id` | `requireAdminJWT` | Admin duyệt Seller |
| `backend/routes/seller.js:157` | `PUT /api/admin/reject-seller/:id` | `requireAdminJWT` | Admin từ chối Seller |
| `backend/routes/seller.js:228` | `PUT /api/seller/shop` | `protect, isSeller, upload.fields(...)` | Cập nhật thông tin Shop |
| `backend/routes/seller.js:279` | `POST /api/seller/products` | `protect, isSeller, upload.array('images', 8)` | Seller thêm sản phẩm |
| `backend/routes/seller.js:361` | `PUT /api/seller/products/:id` | `protect, isSeller, upload.array('images', 8)` + kiểm tra chủ | Seller sửa sản phẩm |
| `backend/routes/seller.js:402` | `DELETE /api/seller/products/:id` | `protect, isSeller` + kiểm tra chủ | Seller xóa sản phẩm |
| `backend/routes/seller.js:438` | `PUT /api/seller/orders/:id/status` | `protect, isSeller` + kiểm tra chủ | Seller đổi trạng thái đơn |
| `backend/routes/seller.js:557` | `POST /api/seller/orders/:id/prepare` | `protect, isSeller` + kiểm tra chủ | Seller chuẩn bị hàng |
| `backend/routes/seller.js:665` | `POST /api/seller/orders/:orderId/ship` | `protect, isSeller` + kiểm tra chủ | Seller tạo vận đơn GHN |
| `backend/routes/haipay.js:64` | `POST /api/haipay/send-otp` | `otpLimiter` (Public OTP) | Gửi OTP Ví HaiPay |
| `backend/routes/haipay.js:104` | `POST /api/haipay/register` | Public Auth (Verify OTP + mật khẩu) | Kích hoạt Ví HaiPay |
| `backend/routes/haipay.js:191` | `POST /api/haipay/login` | `loginLimiter` (Verify mật khẩu + OTP) | Đăng nhập Ví HaiPay |
| `backend/routes/haipay.js:275` | `POST /api/haipay/verify-firebase` | Verify Firebase `idToken` (C8) | Đồng bộ xác thực Firebase |
| `backend/routes/shipping.js:43` | `POST /api/shipping/calculate` | `protect` | Tính phí vận chuyển |
| `backend/routes/address.js:66-103` | `POST/PUT/PATCH/DELETE /api/addresses*` | `protect` | Quản lý sổ địa chỉ cá nhân |
| `backend/routes/webhook.js:10` | `POST /api/webhook/ghn` | Verify `GHN_WEBHOOK_TOKEN` hằng-thời-gian (C10) | Webhook vận chuyển GHN |
