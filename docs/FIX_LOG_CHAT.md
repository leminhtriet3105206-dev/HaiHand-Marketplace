# FIX LOG — Hệ thống Chat & Kênh Người Bán (HaiHand)

- **Nhánh**: `feature/seller-messaging` (tạo từ `main` tại commit `9ec8c4cf`)
- **Ngày khởi tạo**: 2026-11-25

---

## Sai lệch phát hiện giữa Specification & Codebase thực tế (Verify-First)

1. **Merge conflict chưa giải quyết trên `main` (`backend/server.js`)**:
   - Commit `9ec8c4cf` để lại 5 khối conflict markers (`<<<<<<< HEAD`, `=======`, `>>>>>>> 7499a57b...`) trong `backend/server.js`, khiến `node -c backend/server.js` lỗi cú pháp.
   - Phần `HEAD` trong conflict tham chiếu các module không tồn tại trên `main` (`./middleware/validate`, `./middleware/upload`, `./middleware/errorHandler`, `./models/Banner`, `protectStrict`, `requireOwnerOrAdmin`, `publicUser`).
   - `backend/middleware/security.js` cũng `require('./validate')` vốn chưa tồn tại trên `main`.
   - **Cách xử lý**: Giải quyết sạch 5 khối conflict trước khi làm Phase A, bổ sung `backend/middleware/validate.js` tối thiểu (`mongoSanitizeMiddleware`, `escapeRegex`), giữ toàn bộ các route hiện có, và bảo toàn fallback `DEFAULT_HERO_BANNERS` cho `/api/banners`.
2. **Xác thực JWT trong `backend/middleware/auth.js`**:
   - Middleware `protect` hiện tại có nhánh fallback sang `req.headers.userid || req.body?.userId || req.query?.userId` khi thiếu JWT — không đạt yêu cầu bảo mật chặt của Phase A.
   - **Cách xử lý**: Bổ sung `protectStrict` (chỉ chấp nhận `Authorization: Bearer <token>`, kiểm tra `isDeleted`, `isBanned`, `status === 'locked'`, `tokenVersion`) dùng cho toàn bộ route tin nhắn và chat người bán; giữ `protect` cũ cho các route legacy để không làm gãy tính năng đang chạy.
3. **Thư viện test (`backend/package.json`)**:
   - `backend/node_modules` có sẵn `jest`, `supertest`, `express-rate-limit`, `helmet`, nhưng không cài `mongodb-memory-server` và `socket.io-client` (`socket.io-client` có ở `frontend/node_modules`).
   - **Cách xử lý**: Dùng Jest + Supertest với mock Mongoose model / in-memory store tương tự các test hiện có (`webhook.test.js`, `shippingController.test.js`), và kiểm thử Socket.IO bằng server HTTP thực + `socket.io-client` từ `frontend/node_modules` (hoặc unit/integration test trực tiếp).
4. **Frontend gửi request không kèm JWT**:
   - `ChatPage.js`, `InboxPage.js`, `FloatingAdminChat.js`, `AppHeader.js`, `Header.js` đang dùng `axios` trực tiếp thay vì `axiosClient` (`frontend/src/api/axiosClient.js`), nên không gửi header `Authorization: Bearer <token>`.
   - `SocketContext.js` đang gửi `auth: { userId }` và emit `addUser` thay vì gửi JWT `auth: { token }`.
5. **Admin Portal (`admin/`)**:
   - `admin/views/admin-chat.ejs` và `backend/views/admin-chat.ejs` nhúng `<iframe src=".../chat?embed=true">`, không truy vấn trực tiếp model `Message`. `admin/app.js` trả `{ count: 0 }` ở `/api/admin/unread-chats`.

---

## Nhật ký thực thi theo từng hạng mục

### Step 0 — Thiết lập nhánh & dọn conflict nền
| ID | Trạng thái | File đổi | Ghi chú |
|----|-----------|----------|---------|
| SETUP | ĐÃ SỬA | `docs/FIX_LOG_CHAT.md`, `backend/server.js`, `backend/middleware/validate.js`, `backend/middleware/security.js` | Tạo nhánh `feature/seller-messaging`, xử lý 5 khối conflict ở `server.js` |

### PHẦN A — Sửa lỗi hệ thống chat hiện có
| ID | Trạng thái | File đổi | Cách kiểm chứng |
|----|-----------|----------|----------------|
| A0 | ĐÃ SỬA | `backend/models/Message.js`, `backend/server.js`, `backend/scripts/migrate-messages.js` | `chatPhaseA.test.js` (test A0) + `node -c backend/server.js` |
| A1 | ĐÃ SỬA | `backend/socket/index.js`, `backend/server.js`, `frontend/src/context/SocketContext.js` | `chatPhaseA.test.js` (test A1 & A2: nhận đúng 1 sự kiện `message:new`) |
| A2 | ĐÃ SỬA | `backend/socket/index.js`, `backend/middleware/auth.js` | `chatPhaseA.test.js` (test A1 & A2: từ chối không token) |
| A3 | ĐÃ SỬA | `backend/routes/messages.js`, `backend/middleware/upload.js`, `backend/server.js` | `chatPhaseA.test.js` (test A3: 401, bỏ qua `senderId` giả, chặn tự nhắn, xóa `clear-all`, lọc ẩn email/phone, trả 500 khi lỗi DB) |
| A4 | ĐÃ SỬA | `frontend/src/pages/InboxPage.js`, `frontend/src/utils/imageUrl.js` | `react-scripts build` thành công |
| A5 | ĐÃ SỬA | `frontend/src/pages/ChatPage.js`, `frontend/src/components/AppHeader.js`, `frontend/src/components/Header.js` | `chatPhaseA.test.js` (test A3 & A5) + `react-scripts build` |
| A6 | ĐÃ SỬA | `frontend/src/pages/ChatPage.js`, `frontend/src/pages/ProductDetailPage.js`, `frontend/src/components/FloatingAdminChat.js` | `react-scripts build` thành công |
| A7 | ĐÃ SỬA | `backend/routes/messages.js`, `backend/utils/notificationService.js`, `frontend/src/pages/ChatPage.js` | `chatPhaseA.test.js` (test A3 & A7: gộp thông báo 10 phút, link theo vai trò) |

### PHẦN B — Trang Tin nhắn trong Kênh Người Bán
*(Chưa thực hiện — chờ hoàn tất Phase A)*

### PHẦN C — Lỗi vặt ở trang Người bán
*(Chưa thực hiện — chờ hoàn tất Phase B)*

---

## Danh sách Route & Sự kiện Socket thay đổi (cập nhật liên tục)
*(Sẽ cập nhật sau khi hoàn thành Phase A)*
