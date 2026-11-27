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
| ID | Trạng thái | File đổi | Cách kiểm chứng |
|----|-----------|----------|----------------|
| B1 | ĐÃ SỬA | `backend/routes/messages.js`, `backend/scripts/backfill-message-seller.js` | `sellerChatPhaseB.test.js` (test B1: 403 tiếng Việt khi seller nhắn người lạ) |
| B2 | ĐÃ SỬA | `frontend/src/hooks/useChat.js`, `frontend/src/components/chat/{ConversationList,MessageThread,MessageInput,ProductContextCard,MessageText}.jsx` | `react-scripts build` thành công. *Ghi chú*: `ChatPage.js` giữ JSX Phase A để không làm gián đoạn luồng người mua hiện có; `SellerMessages.js` dùng `useChat` + `components/chat/*`. |
| B3 | ĐÃ SỬA | `frontend/src/pages/seller/SellerMessages.js`, `frontend/src/App.js`, `backend/routes/seller.js` | `sellerChatPhaseB.test.js` (test B3: `GET /api/seller/buyers/:buyerId/summary`) + `react-scripts build` |
| B4 | ĐÃ SỬA | `backend/models/User.js`, `backend/routes/seller.js`, `frontend/src/pages/seller/SellerMessages.js` | `sellerChatPhaseB.test.js` (test B4: CRUD quick-replies, giới hạn 20 mẫu, validate độ dài/trùng title) |
| B5 | ĐÃ SỬA | `frontend/src/hooks/useUnreadMessages.js`, `frontend/src/pages/seller/SellerLayout.js`, `frontend/src/pages/seller/SellerOrders.js`, `frontend/src/pages/seller/SellerDashboard.js`, `frontend/src/App.js`, `backend/routes/seller.js` | `react-scripts build` thành công |
| B6 | ĐÃ SỬA | `backend/routes/messages.js`, `backend/models/User.js`, `frontend/src/components/chat/MessageText.jsx`, `frontend/src/utils/imageUrl.js` | `sellerChatPhaseB.test.js` (test B6: block user) + `react-scripts build` |

### PHẦN C — Lỗi vặt ở trang Người bán
| ID | Trạng thái | File đổi | Cách kiểm chứng |
|----|-----------|----------|----------------|
| C1 | ĐÃ SỬA | `frontend/src/components/SellerProtectedRoute.js` | Làm mới hồ sơ từ `GET /api/users/profile`, chuyển `toast` vào `useEffect`, có màn hình loading |
| C2 | ĐÃ SỬA | `frontend/src/pages/seller/SellerLayout.js` | Badge theo `sellerStatus`, lấy số dư ví từ `/api/haipay/me`, drawer mobile `< md`, thêm `end` cho menu Sản phẩm |
| C3 | ĐÃ SỬA | `frontend/src/pages/seller/SellerDashboard.js`, `backend/routes/seller.js` | Trả `commissionRate` từ `Settings`, dùng `Promise.allSettled` |
| C4 | ĐÃ SỬA | `frontend/src/pages/seller/SellerOrders.js`, `frontend/src/pages/seller/SellerProducts.js` | Bỏ mã vận đơn giả `'HH'+random`, thêm modal hủy đơn trong app, thay `via.placeholder.com` bằng `imageUrl.js`, `useMemo` tab counts, `confirm` khi giao/hoàn tất, phân trang 10 đơn/trang |
| C5 | ĐÃ SỬA | `frontend/src/pages/seller/SellerAddEditProduct.js` | Validate biến thể (`name`, `price>=1000` nguyên, `stock>=0` nguyên), `step=1` cho tồn kho, ẩn `status` khi sửa, cleanup `URL.revokeObjectURL`, chặn submit kép |
| C6 | ĐÃ SỬA | `frontend/src/components/Toast.js` | Đổi `useCallback({...})` sang `useMemo(() => ({...}), [addToast])` (hết cảnh báo eslint ở `Toast.js:189`) |
| C7 | ĐÃ SỬA | `backend/models/Message.js` | Chỉ còn 1 định nghĩa Message duy nhất |

---

## Danh sách Route & Sự kiện Socket thay đổi

### Route mới
- `GET /api/messages/conversations?as=all|seller|buyer&page=&limit=&unread=&q=`
- `GET /api/messages/unread-count?as=all|seller|buyer`
- `GET /api/messages/thread/:otherId?before=&limit=`
- `PUT /api/messages/read/:otherId`
- `POST /api/messages/block/:userId` & `DELETE /api/messages/block/:userId`
- `GET /api/seller/buyers/:buyerId/summary`
- `GET / POST /api/seller/quick-replies` & `PUT / DELETE /api/seller/quick-replies/:replyId`

### Route deprecated / đã xóa
- **DEPRECATED** (giữ alias tương thích, bỏ qua `userId` trên URL/body, chỉ dùng JWT): `GET /api/messages/conversations/:userId`, `GET /api/messages/unread-count/:userId`, `PUT /api/messages/mark-read`, `GET /api/messages/:user1/:user2`
- **ĐÃ XÓA**: `GET /api/messages/clear-all`

### Sự kiện Socket.IO
- **Mới**: `presence:sync`, `presence:update`, `message:new`, `inbox:update`, `messages:read`, `typing:start`, `typing:stop`
- **Đã bỏ** (chống giả mạo): client→server `addUser`, `sendMessage`
