# PROMPT TỐI THƯỢNG – SỬA LỖI BẢO MẬT & LOGIC DỰ ÁN HAIHAND MARKETPLACE

> Cách dùng: dán TOÀN BỘ nội dung từ "VAI TRÒ" trở xuống vào Agent (Claude Code / Cursor / Codex…) đang mở ở thư mục gốc repo `HaiHand-Marketplace`. Nên chạy trên nhánh mới, KHÔNG chạy trực tiếp trên master. Nếu muốn an toàn hơn, giao từng PHASE một (copy phần "Quy tắc chung" + 1 phase).

---

## VAI TRÒ

Bạn là Staff Backend/Security Engineer. Nhiệm vụ: sửa toàn bộ lỗ hổng bảo mật và lỗi luồng nghiệp vụ của dự án HaiHand (chợ đồ cũ nhiều người bán) theo báo cáo rà soát bên dưới, sao cho hệ thống chạy mượt, an toàn tiền bạc, và không làm hỏng chức năng đang chạy.

## BỐI CẢNH DỰ ÁN

- 3 app: `frontend/` (React 18, cổng 3000), `backend/` (Node + Express 5 + MongoDB/Mongoose + Socket.io, cổng 4000), `admin/` (Express + EJS, cổng 4001). `backend/server.js` (~2800 dòng) CÒN chứa bản trùng của trang admin EJS (/login, /register, /dashboard…).
- Thanh toán: COD / VNPAY / HAIPAY (ví nội bộ, có escrow). `paymentStatus`: unpaid → escrow → released / refunded. `PaymentSession.parentOrderId` chính là `vnp_TxnRef`. Admin giải ngân thủ công.
- Trạng thái đơn chuẩn hóa: Pending, Processing, Shipped, Delivered, Completed, Cancelled (`STATUS_TO_CANONICAL`).
- Phí sàn: `calculateOrderSplit` (backend/utils/b2c.js) dùng snapshot `order.sellerReceive/commissionRate`; `getPlatformFeePercent` đọc `commissionRate ?? platformFeePercentage`.
- Auth: JWT 7 ngày. `protect` (có fallback `userid` header/body/query – NGUY HIỂM) và `protectStrict` (chỉ Bearer token, nhưng chưa kiểm tra banned/locked/deleted).
- Hai hệ thống thông báo: `Notification` (frontend đọc) và `UserNotification` (không ai đọc).
- `Product` và `Post` dùng chung collection `posts`; `Settings` và `GlobalSetting` dùng chung collection `settings`.
- Vận đơn: `services/shipping` (ghn/mock) và `shippingController` (luôn GHN env) – hai đường tạo vận đơn khác nhau.
- Có file thừa do xung đột đồng bộ: `*-LAPTOP-G2N88BOO*`.

## QUY TẮC VÀNG (BẮT BUỘC)

1. **Verify trước khi sửa.** Báo cáo dưới đây là kết quả đọc code tĩnh, CHƯA khai thác thật. Với mỗi lỗi: mở đúng file/dòng, xác nhận lỗi còn tồn tại (số dòng có thể lệch). Nếu lỗi không có/đã sửa → ghi "KHÔNG TỒN TẠI" kèm bằng chứng, đừng bịa.
2. **Không phá API đang dùng.** Trước khi đổi/xóa route hay đổi tên field, `grep` toàn bộ `frontend/src` và `admin/` xem ai gọi; nếu đổi contract thì sửa luôn phía gọi trong cùng commit.
3. **Mỗi lỗi = 1 commit nhỏ**, message dạng `fix(C5): vnpay verify chỉ đọc trạng thái, IPN mới ghi tiền`. Không gộp việc không liên quan, không refactor lan man, không đổi format/đổi tên hàng loạt.
4. **Viết test cho mỗi lỗi nghiêm trọng/cao** (Jest + supertest + `mongodb-memory-server`, hoặc Docker mongo). Test phải FAIL trước fix và PASS sau fix (chạy thật, dán output).
5. **Tiền luôn nguyên tử + idempotent.** Mọi thay đổi số dư/kho dùng `findOneAndUpdate` có điều kiện hoặc `$inc` với filter (ví dụ `{_id, walletBalance: {$gte: x}}`), "cổng" trạng thái (`paymentStatus: 'escrow'` → `'refunded'`) đặt TRƯỚC khi cộng/trừ tiền. Luồng nhiều bước dùng `mongoose.startSession().withTransaction()` (nếu môi trường dev là mongo standalone thì có fallback không transaction nhưng vẫn giữ cổng idempotent).
6. **Không bao giờ đưa secret vào code/commit/log/test.** Mọi secret lấy từ `process.env`, thiếu thì báo lỗi lúc khởi động (fail fast) – không có giá trị mặc định. Cập nhật `.env.example` (chỉ tên biến, giá trị rỗng). Không in secret ra output.
7. **Không tự chạy lệnh phá hủy**: không `git push --force`, không `git filter-repo`, không xóa DB, không `rm -rf` ngoài file thừa liệt kê, không đụng production. Việc xoay khóa Cloudinary/VNPay và xóa lịch sử git là việc của con người → chỉ liệt kê hướng dẫn trong báo cáo cuối.
8. **Không sửa lan** sang file/chức năng ngoài phạm vi. Gặp lỗi mới ngoài danh sách → ghi vào mục "Phát hiện thêm", đừng tự sửa nếu không liên quan.
9. **Dữ liệu cũ phải tương thích**: người dùng hiện có mật khẩu lưu thô → làm migration lười (xem C4), không được làm họ mất tài khoản.
10. Mỗi phase xong: chạy `npm test`, `npm run lint` (nếu có), khởi động backend thử và gọi smoke test; chỉ sang phase sau khi xanh.

## QUY TRÌNH LÀM VIỆC

0. Tạo nhánh: `git checkout -b fix/security-and-logic-audit`. Tạo `docs/FIX_LOG.md` để ghi mỗi mục: ID, trạng thái (ĐÃ SỬA / KHÔNG TỒN TẠI / BỎ QUA + lý do), file đã đổi, test đã thêm.
1. Lập todo list theo thứ tự phase bên dưới.
2. Với mỗi mục: Đọc code → viết test tái hiện (FAIL) → sửa tối thiểu → test PASS → commit → ghi FIX_LOG.
3. Cuối cùng: chạy toàn bộ test, `npm audit` ở 3 thư mục, tạo báo cáo cuối (xem phần ĐẦU RA).

---

## PHASE 0 – DỌN NỀN & HẠ TẦNG DÙNG CHUNG (làm đầu tiên, các phase sau dựa vào đây)

**0.1 Xóa file thừa** (sau khi `grep` chắc chắn không ai import): mọi file `*-LAPTOP-G2N88BOO*` (server, seller, Product, chatbotService, package.json + lock, Dockerfile, docker-compose, .gitignore, FloatingAIChat, ChatPage); file nháp `backend/extract_routes.js`, `test_upload.js`, `test_chatbot.js`, `frontend/scratch_screen.html`, `frontend/src/pages/fix_url.py`, `gen_edit.py`.

**0.2 Cấu hình môi trường** – tạo `backend/config/env.js` đọc & kiểm tra bắt buộc: `MONGO_URI`, `JWT_SECRET`, `SESSION_SECRET`, `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `GHN_WEBHOOK_TOKEN`, `CORS_ORIGINS` (danh sách phân tách bằng dấu phẩy), `FIREBASE_*`/service account. Thiếu → throw lúc boot. Cập nhật `.env.example`.

**0.3 Middleware chung** (`backend/middleware/`):
- `auth.js`: viết lại `protect` = bắt buộc Bearer JWT (XÓA hoàn toàn fallback `userid` ở header/body/query, xóa `STRICT_PATH_PATTERNS`, giữ `protectStrict` làm alias để không vỡ import). Sau khi verify token phải nạp user từ DB và từ chối nếu `isBanned`, `status === 'locked'`, `isDeleted` (H10). Thêm `requireOwnerOrAdmin(paramName)` (so `req.user._id` với `req.params[paramName]`) và `requireAdminJWT`. Thêm `tokenVersion` vào User; token mang `tv`, đổi mật khẩu/khóa tài khoản thì tăng `tokenVersion` (thu hồi token cũ). Rút hạn token còn 1–2 giờ + refresh token (hoặc tối thiểu 1 ngày nếu chưa kịp làm refresh) – ghi rõ lựa chọn.
- `validate.js`: helper `assertString`, `assertObjectId`, `assertPositiveInt`, `assertMoney`; từ chối object/array khi cần string (chặn NoSQL injection).
- Cài và gắn toàn cục: `helmet`, `express-mongo-sanitize` (hoặc tự sanitize key bắt đầu `$`/chứa `.`), `express-rate-limit` (global + chặt hơn cho login, send-otp, haipay/send-otp, chatbot/ask, upload, rút tiền).
- `upload.js`: multer có `limits: {fileSize: 5MB, files: 8}` + `fileFilter` chỉ nhận image/jpeg|png|webp|gif; dùng chung cho mọi route upload (H13).
- CORS: một middleware duy nhất, chỉ cho origin trong `CORS_ORIGINS`, `credentials: true` chỉ với origin trong danh sách; XÓA middleware phản chiếu `Origin` thủ công và nhánh `callback(null, true)` (H15). Áp tương tự `admin/app.js`.
- `errorHandler.js`: trả lỗi chung cho client (`{message}`), log chi tiết server-side; không trả `error.message`/stack/`trackingLogs`/dữ liệu lỗi GHN (M9).
- `sanitizeUser(user)`: loại `password, walletPin, cccd, taxId, bankInfo, tokenVersion…`; và `publicUser(user)`: chỉ `name, avatar, shopInfo, rating…`.

**0.4 State machine đơn hàng** – tạo `backend/utils/orderStateMachine.js` với bảng chuyển hợp lệ:
`Pending→Processing|Cancelled`, `Processing→Shipped|Cancelled`, `Shipped→Delivered`, `Delivered→Completed`. Hàm `transitionOrder(orderId, to, actor, {reason})` thực hiện `findOneAndUpdate({_id, status: from}, ...)` (atomic), kiểm tra điều kiện thanh toán (VNPAY/HAIPAY phải `escrow` mới được sang Processing), ghi `statusHistory`, gửi thông báo qua `sendNotification`. Mọi đường đổi trạng thái (seller `/status`, `/prepare`, `/receive`, `/api/orders/:id/confirm`, `/ship`, admin update-status, webhook GHN, buyer cancel) PHẢI gọi hàm này. Hủy đơn luôn qua `cancelOrderWithRefundAndRestock`.

---

## PHASE 1 – KHẨN CẤP (CRITICAL)

**C1 – Secret trong code.** Thay toàn bộ: `server.js:118-122` (Cloudinary), `:230-234` (session secret `khoa-bi-mat-haihand`), `:1350-1351` + `utils/vnpay.js:5-6` (VNPay hash secret mặc định), `admin/app.js:145` (`secret-key-vip-pro`) bằng `process.env`. Session: `cookie: {httpOnly, sameSite:'lax', secure: production}`, `saveUninitialized:false`. `grep -rEn "api_secret|hashSecret|secret-key|khoa-bi-mat|184464981981638"` phải trả về 0 kết quả. Báo cáo cuối phải nhắc: khóa cũ ĐÃ LỘ trên GitHub → con người phải rotate Cloudinary + VNPay và làm sạch lịch sử git (BFG/git filter-repo). KHÔNG tự làm.

**C2 – Tự tạo Admin.** Xóa route `POST /register` trong `server.js` (app admin riêng đã có bản chặn). Nếu cần giữ: bỏ `role` khỏi body, luôn gán `'Khách hàng'`. Kiểm tra mọi route đăng ký khác (`/api/users/register`, `admin/app.js /api/users/register`) không nhận `role/isSeller/walletBalance/isAdmin` từ client (whitelist field).

**C3 – Đăng nhập: mật khẩu thô + NoSQL injection.** Các điểm: `server.js:273, :310, :1166`, `admin/app.js:261, :286`. Sửa: validate `typeof email === 'string' && typeof password === 'string'`; tìm user theo email (lowercase/trim) rồi `bcrypt.compare`; băm bcrypt (cost ≥ 10) khi đăng ký, đổi mật khẩu, reset; không bao giờ trả `password` ra response (dùng `sanitizeUser`; `/api/admin/login` và `admin/app.js` login/register cũng vậy); rate limit login (theo IP + theo email), thông báo lỗi chung "Sai email hoặc mật khẩu".

**C4 – Hai chuẩn mật khẩu.** Tạo `utils/password.js`: `hashPassword`, `verifyPassword(stored, input)` → nếu `stored` chưa có tiền tố `$2a$/$2b$/$2y$` thì so sánh hằng-thời-gian với chuỗi thô, đúng thì **băm lại và lưu ngay** (migration lười), còn lại `bcrypt.compare`. Dùng hàm này ở: login chính, admin login, HaiPay login/register, reset-password-otp, change-password. Test: user mật khẩu thô cũ đăng nhập được 1 lần rồi DB đã là bcrypt; user tạo qua HaiPay đăng nhập được trang chính và ngược lại.

**C5 – Xác nhận thanh toán tin dữ liệu client.** `POST /api/haipay/verify` (`server.js:~2393-2438`), `POST /api/vnpay/verify` (`~2459-2532`), `verifyVnpayChecksum` (`:1371`, `utils/vnpay.js:30`, trả `true` khi không có chữ ký). Sửa:
- Xóa bản "legacy" `verifyVnpayChecksum`; mọi nơi dùng bản strict: thiếu/sai `vnp_SecureHash` → false; so sánh hằng-thời-gian.
- Hai route `/verify` chuyển thành **chỉ đọc**: nhận `orderId/txnRef`, tra DB trả trạng thái (`paid/pending/failed`); TUYỆT ĐỐI không cộng ví, không đổi `paymentStatus`, không hủy đơn.
- Ghi tiền chỉ trong IPN/return đã ký (`vnpay_ipn`): kiểm tra chữ ký hợp lệ, `vnp_TmnCode === env`, `vnp_Amount === session.amount * 100`, `vnp_ResponseCode === '00'` và `vnp_TransactionStatus === '00'`, session chưa `paid` (idempotent bằng `findOneAndUpdate({_id, status:'pending'}, {status:'paid'})`), nạp ví = `$inc` đúng số tiền của session (không lấy `amount` từ client), mã nạp `NAP_<userId>_x` phải khớp một `PaymentSession` đã tạo từ server.
- Không bao giờ hủy đơn đã `escrow/paid` theo kết quả từ client.
- Sửa `frontend/src/pages/PaymentResultPage.js` để poll trạng thái (GET) thay vì gửi `responseCode`.
Test: gọi verify với `responseCode:'00'` không chữ ký → ví không đổi, đơn không thành escrow; IPN chữ ký sai → 400; IPN đúng gọi 2 lần → cộng 1 lần; amount lệch → từ chối.

**C6 – Route ghi/xóa không cần đăng nhập.** Gắn `protect`(JWT) + kiểm tra chủ sở hữu/role cho TẤT CẢ route sau (đúng bảng báo cáo):
- `DELETE /api/posts/:id` (`:980`), `PUT /api/posts/:id` (`:1326`): chỉ chủ sản phẩm hoặc Admin; whitelist field (name, price, images, description, stockQuantity, category, condition, location…); không cho client đổi `status/moderationStatus/sellerId`.
- `PUT /api/users/profile/:id` (`:1248`): XÓA `{...req.body}`; chỉ nhận whitelist `name, phone, avatar, bio, address, gender, birthday`; id lấy từ token, không từ URL (hoặc URL phải khớp token). Cấm `role, isSeller, walletBalance, pendingBalance, password, walletPin, isBanned, email`.
- `PUT /api/users/change-password/:id` (`:1138`): cần token + mật khẩu cũ, băm mới, tăng `tokenVersion`.
- `POST /users/edit/:id` (`:1108`) và mọi route đổi role: chỉ `requireAdminJWT`.
- `PUT /api/admin/withdraw/:id/approve` (`:1086`) và mọi `/api/admin/*`, `GET /admin/withdrawals`, `GET /admin/orders` (`:578`, `:1832`), `/api/admin/notifications*` (`:999,:1016,:1073`): `requireAdminJWT`.
- XÓA hẳn `GET /api/messages/clear-all` (`:2246`) và `GET /api/admin/test-notif`.
- `/api/users/cart*`, `/favorites`, `/follow`, `/api/reviews`, `/api/reports`, `/api/messages*` (`:2078-2349`, `:1462`, `:1845`, `:1872`): userId LẤY TỪ TOKEN, bỏ userId trong body/URL (hoặc bắt khớp token).
- Chạy script kiểm tra: liệt kê mọi `app.(post|put|patch|delete)` và `router.(post|put|patch|delete)`; xuất bảng route → middleware; không còn route ghi nào thiếu xác thực (trừ `login/register/send-otp/webhook-đã-xác-thực/vnpay_ipn`). Đưa bảng này vào FIX_LOG.

**C7 – Lộ dữ liệu cá nhân/tài chính.** `GET /api/users/:id` (`:1923`), `/api/users/public-profile/:userId` (`:1424`), `GET /api/users/profile` (`:1212`, bỏ nhận `userid` từ query/header), `/api/users/:userId/transactions` (`:1735`), follow-list (`:1896`), `/api/users/search` (`:1122`). Public → `publicUser` (không email/phone/cccd/taxId/bankInfo/walletBalance/walletPin). `profile`, `transactions`, `GET /api/users/:id` đầy đủ → chỉ chủ tài khoản hoặc Admin. Search: escape regex (`escapeRegex`), trần `limit ≤ 20`, không trả email.

**C8 – Chiếm tài khoản qua Firebase/quên mật khẩu.** `routes/haipay.js POST /verify-firebase`: dùng `firebase-admin` → `verifyIdToken(idToken)`, lấy số điện thoại từ token đã verify, TUYỆT ĐỐI không tin `phoneNumber/firebaseUid` trong body. `server.js:1150 forgot-password` (chỉ cần email + SĐT): xóa; giữ duy nhất luồng OTP qua email (`reset-password-otp`) với OTP băm, hết hạn 10 phút, tối đa 5 lần thử, dùng một lần.

**C9 – Hoàn tiền nhiều lần.** `POST /api/admin/refund-order/:orderId` (`:913-958`): thay bằng gọi `cancelOrderWithRefundAndRestock` (hoặc cổng `findOneAndUpdate({_id, paymentStatus:'escrow'}, {paymentStatus:'refunded', status:'Cancelled'})` TRƯỚC rồi mới `$inc` ví người mua và trừ `pendingBalance` người bán bằng `$inc` có filter). Từ chối nếu đã `refunded`, hoặc đơn COD chưa thu tiền. Test: gọi 2 lần → ví chỉ tăng 1 lần.

**C10 – Webhook GHN không xác thực.** `routes/webhook.js`, `controllers/webhookController.js`: yêu cầu header/token bí mật (`GHN_WEBHOOK_TOKEN`, so sánh hằng-thời-gian) và/hoặc IP allowlist cấu hình qua env; map trạng thái GHN → trạng thái nội bộ qua `transitionOrder` (chỉ chuyển hợp lệ, ví dụ Shipped→Delivered); GHN `cancel/return` → `cancelOrderWithRefundAndRestock`; trả `{ok:true}` thôi, không trả `trackingLogs`; log sự kiện bị từ chối. Test: không token → 401; delivered cho đơn đã Cancelled → bỏ qua; cancel → hoàn tiền + trả kho.

---

## PHASE 2 – CAO (HIGH)

**H0** `models/Product.js`: `price: {type:Number, min:1000, required}`, `originalPrice`/`stockQuantity` `min:0`, integer. `routes/seller.js:282-283,308,371` kiểm tra khi tạo/sửa (từ chối âm/NaN/chuỗi). `checkoutController.js` (`:244-253, :306-316, :376-397`): chỉ nhận sản phẩm `status:'active'` còn hàng, từ chối khi `sellerId == buyerId`, từ chối `finalAmount <= 0`, ép `quantity` là số nguyên dương, gộp dòng trùng sản phẩm trước khi kiểm kho (M6), từ chối (không bỏ qua âm thầm) sản phẩm đã xóa, sản phẩm không có chủ → lỗi chứ không gán buyer làm seller, `parentOrderId` dùng `crypto.randomUUID()`/`randomBytes`.

**H1** Thêm `stockDeducted: Boolean` trên Order, đặt khi trừ kho thật; `cancelOrderWithRefundAndRestock` chỉ cộng kho khi cờ này bật (`checkoutController.js:644-659, :500-507`). Test: tạo đơn VNPAY rồi hủy → tồn kho không đổi.

**H2** Giữ kho nguyên tử ngay lúc checkout: `findOneAndUpdate({_id, stockQuantity:{$gte:qty}}, {$inc:{stockQuantity:-qty, quantity:-qty}})`; không đủ → rollback các dòng đã giữ + trả lỗi hết hàng. Bỏ `Math.max(0, …)` che lỗi (`:96-100`) và kiểu đọc-sửa-`save()` (`:419-429`). Đơn VNPAY pending quá 15 phút: job `setInterval`/cron hủy + trả kho (idempotent, dùng `transitionOrder`). Test race: 2 request song song mua món cuối → đúng 1 thành công.

**H3** `routes/seller.js:369-393`: bỏ `status` khỏi danh sách field cho sửa; thêm `moderationStatus` (`pending|approved|rejected|locked`) tách khỏi trạng thái bán; nút ẩn/hiện riêng chỉ cho sản phẩm `approved` và không `locked`; tồn kho 0 vẫn phải qua `pending` rồi mới thành `out_of_stock`; sửa giá/ảnh/mô tả sản phẩm đã duyệt → quay lại `pending`; Admin đã ẩn/khóa thì seller không bật lại được. Cập nhật admin duyệt dùng `moderationStatus`; viết migration script nhỏ cho dữ liệu cũ (`scripts/migrate-moderation.js`, không tự chạy).

**H4** Chuyển `/status`, `/prepare`, `/ship`, `/api/orders/:id/confirm`, `/receive` sang `transitionOrder`. `/ship` chỉ khi `Pending`/`Processing` và đã `escrow` (hoặc COD). Thống nhất MỘT đường tạo vận đơn (`services/shipping`), xóa/redirect đường còn lại.

**H5** Chốt mô hình COD (mặc định ĐỀ XUẤT, ghi rõ trong FIX_LOG để người dùng đổi nếu muốn): khi đơn COD sang `Delivered` đã xác thực → ghi có `walletBalance` người bán = `sellerReceive`, tạo `Revenue` (phí sàn) và `Transaction`, idempotent bằng cờ `settled`. Sửa dashboard người bán (`seller.js:192-194`) khớp mô hình. Nếu không chắc nghiệp vụ → implement sau cờ `COD_SETTLEMENT_MODE` env, mặc định như trên, và hỏi lại trong báo cáo.

**H6** Người bán KHÔNG được tự đặt `Delivered/Completed` (`seller.js:463-466`). `Delivered` chỉ từ webhook GHN đã xác thực hoặc buyer bấm "Đã nhận"; `Completed` khi buyer xác nhận hoặc tự động sau N ngày (env `AUTO_COMPLETE_DAYS`, mặc định 7) nếu không khiếu nại (job idempotent). Giải ngân chỉ cho đơn `Completed`/đủ hạn. Thêm tối thiểu luồng khiếu nại: `POST /api/orders/:id/dispute` (buyer, trong hạn) → chặn auto-complete/giải ngân, Admin xử lý (hoàn tiền qua hàm chung).

**H7** Áp cờ cấu hình ở server: `codEnabled/vnpayEnabled/haipayEnabled` trong checkout; `allowNewSellerRegistration` trong apply-seller; `maintenanceMode` middleware (Admin vẫn vào được); `paymentMethod ∈ {COD,VNPAY,HAIPAY}` (từ chối khác). Thêm `autoApprovePosts` vào whitelist `PUT /api/admin/settings` và áp dụng khi seller đăng.

**H8** Bắt buộc PIN ví (bcrypt.compare, khóa 15 phút sau 5 lần sai) cho thanh toán HAIPAY (`checkoutController.js`) và rút tiền (`server.js:~1742`); bcrypt cost ≥ 10; frontend `CheckoutPage` + trang rút tiền thêm ô nhập PIN.

**H9, H10** đã xử lý ở 0.3 – viết test: gửi header `userid` không token → 401; token của user bị khóa → 401/403.

**H11** Thêm `GET /api/haipay/status` (protect → `{isWalletActive, walletBalance}`) hoặc đổi `CheckoutPage.jsx:160` sang `/api/haipay/me`; kiểm tra trang checkout hiển thị đúng ví.

**H12** Bọc bằng transaction/cổng idempotent: `settlePaymentSession` (đánh dấu `paid` SAU khi xử lý xong hoặc dùng trạng thái `processing` + job phục hồi), `cancelOrderWithRefundAndRestock`, `release-funds`, HAIPAY checkout (trừ ví trước/atomic cùng lúc tạo đơn, lỗi thì hoàn). Thêm script đối soát `scripts/reconcile.js` (đơn escrow mà session chưa paid, ví âm, pendingBalance lệch tổng đơn escrow) – chỉ báo cáo, không tự sửa.

**H13** Áp `upload.js` (0.3) cho mọi route upload; `POST /api/messages` (`:2303`) và `PUT /api/users/profile/:id` bắt buộc đăng nhập.

**H14** Rate limit + helmet đã ở 0.3; `send-otp` trả cùng một thông báo dù email có tồn tại hay không; `haipay/send-otp` không cho client chọn `purpose` tùy ý (whitelist); `chatbot/ask` giới hạn theo user + độ dài input.

**H15** đã ở 0.3. **H16** `admin/app.js`: đổi mọi thao tác ghi bằng GET (`/users/delete/:id`, `/post/approve/:id`, `/post/delete/:id`, `/categories/delete/:id`…) sang POST kèm CSRF token (`csurf`/double-submit cookie) và sửa view EJS tương ứng; xóa `POST /api/posts` (`:208`), `POST /api/users/login|register` công khai khỏi app admin; **gộp về MỘT app admin** (đề xuất giữ `admin/`, xóa bản trùng trong `backend/server.js` + `backend/views/` sau khi chắc không còn ai dùng – nếu không chắc, chỉ gắn `requireAdminJWT` cho bản backend và ghi lại việc xóa là bước sau).

**H17** `POST /api/reviews`: protect, buyer từ token, order phải `Completed` và `buyer == req.user._id`, validate `orderId` (ObjectId hợp lệ, 404 nếu không có), cổng atomic `findOneAndUpdate({_id, isReviewed:false}, {isReviewed:true})`, rating 1–5 integer.

---

## PHASE 3 – TRUNG BÌNH (MEDIUM)

- **M1** `dashboard-stats`: đọc `getPlatformFeePercent()` thống nhất; GMV chỉ tính đơn đã chốt; doanh thu = tổng collection `Revenue`; whitelist `PUT /api/admin/settings` ghi cả `commissionRate`, và đồng bộ một nguồn duy nhất.
- **M2** Tách `itemsSubtotal` (chia hoa hồng) và `shippingFee` (hoàn cước, không chia) trong `calculateOrderSplit`; lưu cả hai trên đơn; test tính tiền.
- **M3** Thay MỌI `UserNotification.create` (giải ngân, hoàn tiền, rút tiền, duyệt tin, follow…) bằng `sendNotification`; sửa `/api/orders/:id/confirm` có người nhận; thông báo cho người bán khi buyer hủy (`:1990-2028`). Cân nhắc xóa model `UserNotification` nếu hết dùng.
- **M4** Xóa EmailJS khỏi `frontend/src/pages/LoginPage.js:46-75`, chỉ gọi API server gửi OTP; `utils/otpService.js` không `console.log` OTP khi `NODE_ENV=production`; (dev có thể log, ghi rõ).
- **M5** Hủy đơn đã có vận đơn: gọi hủy vận đơn GHN (best-effort, log lỗi), chặn buyer hủy khi `Processing` (chỉ gửi yêu cầu hủy cho seller/Admin), thông báo seller.
- **M6** đã ở H0 (gộp dòng, sản phẩm xóa, parentOrderId, hết hạn VNPAY ở H2).
- **M7** `POST /orders/update-status/:id` (`:765-790`): dùng `transitionOrder` + whitelist trạng thái; hủy qua hàm hoàn tiền/trả kho; `admin/app.js:608` thay xóa cứng đơn bằng soft-delete, cấm khi đơn đang `escrow`.
- **M8** `escapeRegex` cho search, validate ObjectId của `exclude`, trần `limit ≤ 50` cho `/api/posts` (`:1298`) và API admin (`:397,:510,:666`).
- **M9** đã ở `errorHandler` (0.3); rà `checkoutController.js:493-496`, `server.js:681, :2530`, `shippingController.js`, `webhookController.js`; chatbot không lộ "LM Studio cổng 1235".
- **M10** Cart: `quantity` ép số nguyên dương (≥1, ≤ tồn kho), từ chối chuỗi/số âm/NaN.
- **M11** Token: ưu tiên cookie `httpOnly; Secure; SameSite=Lax` + CSRF; nếu chưa kịp thì ít nhất làm mới hồ sơ khi tải trang, không lưu `walletBalance` trong localStorage; `SellerProtectedRoute` gọi `/api/users/profile` (mới) để lấy `isSeller` thật.
- **M12** Biến thể: checkout/giỏ hàng/đơn lưu `variantId` + giá & tồn của biến thể; nếu chưa làm được trong phạm vi này → ẩn biến thể ở frontend và ghi vào mục "Chưa làm".
- **M13** Gọi `imageEmbeddingService` (không chặn request, try/catch) sau khi tạo/sửa ảnh sản phẩm ở `seller.js` và `POST /api/posts`; HOẶC sửa mô tả UC004 bước 7 cho đúng. Chọn cách 1, ghi lại.
- **M14** Rút tiền: validate `bankName/bankAccount/accountHolder`, lưu field có cấu trúc trên Transaction (không chỉ nằm trong `description`), chặn user bị khóa, số tiền nguyên dương ≥ mức tối thiểu và ≤ số dư (filter `walletBalance:{$gte}` trong `$inc`).
- **M15** `PUT /api/posts/:id` và mọi `findByIdAndUpdate` trên Product: đồng bộ `quantity` ↔ `stockQuantity` thủ công (hoặc dùng `findById` + `save()`), thêm `runValidators:true`.
- **M16** `admin/app.js:564-575` + `PUT /api/admin/withdraw/:id/approve`: dùng `findOneAndUpdate({_id, type:'Rút tiền', status:'Đang xử lý'}, …)`; **từ chối** → `$inc walletBalance` hoàn tiền + tạo `Transaction` hoàn tiền trong cùng transaction; enum trạng thái dùng đúng giá trị (không ghi `'success'` ngoài enum). Test: từ chối → ví được hoàn đúng 1 lần; bấm lại → 409.

## PHASE 4 – THẤP / VỆ SINH

- Gộp `Settings` + `GlobalSetting` thành một model; gộp `Product` + `Post` (hoặc ít nhất một file model dùng chung, không định nghĩa 2 schema trùng) – chỉ làm nếu `grep` an toàn, kèm test.
- `Revenue.description` dùng `commissionRate` thực tế thay vì "Chiết khấu 5%".
- `docker-compose.yml`: không mount source + không `NODE_ENV=development` cho profile prod; bind `127.0.0.1` khi dev.
- Mọi `bcrypt` cost ≥ 10. Thêm `.gitignore` cho `.env`, `uploads/`, `node_modules/`.
- `npm audit` ở `backend`, `frontend`, `admin`; chỉ `npm audit fix` (không `--force`), liệt kê cái còn lại.

---

## TIÊU CHÍ HOÀN THÀNH (Definition of Done)

- [ ] `grep` không còn secret cứng; `.env.example` đầy đủ; app báo lỗi rõ khi thiếu env.
- [ ] Bảng route → middleware: không route ghi/xóa nào thiếu xác thực ngoài danh sách cho phép.
- [ ] Các kịch bản tấn công sau đều bị chặn bằng test tự động: (1) verify không chữ ký, (2) IPN amount lệch/gọi 2 lần, (3) sản phẩm giá âm + HAIPAY, (4) hủy đơn VNPAY chưa trả tiền không tăng kho, (5) refund 2 lần, (6) webhook GHN không token/chuyển trạng thái sai, (7) `role:'Admin'` khi đăng ký/sửa profile, (8) `{"password":{"$ne":""}}` khi login, (9) header `userid` không token, (10) race mua món cuối, (11) từ chối rút tiền hoàn đúng 1 lần, (12) token của tài khoản bị khóa.
- [ ] Luồng chính vẫn chạy: đăng ký → đăng nhập → đăng sản phẩm → duyệt → mua (COD/VNPAY sandbox/HAIPAY) → seller xử lý/giao → giao thành công → giải ngân/hoàn tiền → đánh giá → rút tiền.
- [ ] `npm test` xanh; backend khởi động sạch; frontend build không lỗi.
- [ ] `docs/FIX_LOG.md` đầy đủ từng ID.

## ĐẦU RA CUỐI CÙNG (bắt buộc)

1. Danh sách commit (hash + message) theo ID lỗi.
2. Bảng: ID | Trạng thái (ĐÃ SỬA / KHÔNG TỒN TẠI / BỎ QUA + lý do) | File đổi | Test.
3. Output thật của `npm test` (tóm tắt pass/fail) và `npm audit`.
4. **Việc con người phải làm**: rotate khóa Cloudinary/VNPay, xóa secret khỏi lịch sử git, cấu hình `GHN_WEBHOOK_TOKEN` trên GHN, tạo Firebase service account, chạy migration (`migrate-moderation`, nếu có), đặt biến môi trường production.
5. **Quyết định nghiệp vụ cần chủ dự án xác nhận** (ví dụ mô hình COD, số ngày tự hoàn thành, mức rút tối thiểu).
6. **Phát hiện thêm** ngoài danh sách và **Chưa làm** (kèm lý do).
7. Các phần báo cáo gốc chưa đọc kỹ cần rà thêm: `chatbotService`, `imageEmbeddingService`, `ghnProvider/mockProvider`, các file test, phần lớn trang React.

Nếu gặp mâu thuẫn giữa báo cáo và code thực tế, **code thực tế thắng** – hãy ghi lại sự khác biệt thay vì cố làm theo báo cáo.
