# PROMPT TỐI THƯỢNG #2 – TIN NHẮN CHO NGƯỜI BÁN + SỬA LỖI CHAT + LỖI VẶT TRANG NGƯỜI BÁN

> Cách dùng: copy file này vào thư mục gốc repo (đổi tên `FIX_PROMPT_CHAT.md`), tạo nhánh mới `feature/seller-messaging`, rồi bảo Agent: "Đọc `FIX_PROMPT_CHAT.md` và làm theo, xong mỗi PHASE thì dừng báo cáo cho tôi."
> Nên chạy SAU khi đã xong Phase 0–1 của prompt sửa lỗi bảo mật (vì phần chat dùng middleware `protect` JWT mới). Nếu chưa xong, Agent phải tự tạo middleware JWT tối thiểu như mô tả ở Phase A.

---

## VAI TRÒ

Bạn là Senior Full-stack Engineer (React 18 + Tailwind, Node/Express 5, MongoDB/Mongoose 9, Socket.io). Nhiệm vụ gồm 3 phần, làm theo thứ tự:
- **PHẦN A** – Sửa các lỗi hiện có của hệ thống chat (nền móng bắt buộc trước khi thêm tính năng).
- **PHẦN B** – Thêm trang **Tin nhắn trong Kênh Người Bán** (`/seller-channel/messages`) để người bán nhắn trực tiếp, thời gian thực với người mua.
- **PHẦN C** – Sửa các lỗi vặt ở trang người bán.

## BỐI CẢNH (đã khảo sát code – số dòng có thể lệch, PHẢI tự kiểm tra lại)

- Frontend: `frontend/src/pages/ChatPage.js` (~546 dòng, route `/chat`, gồm AppHeader + AppFooter, danh sách hội thoại bên trái, khung chat bên phải), `InboxPage.js` (route `/inbox`), `components/AppHeader.js` (đếm tin chưa đọc, nghe sự kiện `window` `messageUpdated`), `components/FloatingAdminChat.js`, `components/FloatingAIChat.js` (hiển thị toàn cục trong `App.js`).
- Nơi mở chat hiện có: `ProductDetailPage.js:75` (`navigate('/chat', {state:{receiver: post.author, post}})`), `PublicProfile.js:91`, `FollowPage.js:86`, `InboxPage.js:52`, `ProfilePage.js:577`.
- Kênh người bán: `App.js` route `/seller-channel` → `SellerProtectedRoute` → `SellerLayout` → các trang `SellerDashboard, SellerProducts, SellerAddEditProduct, SellerOrders, SellerSettings`. `SellerLayout.js` có mảng `navItems` (5 mục) – CHƯA có mục tin nhắn.
- Backend `backend/server.js`:
  - Model `Message` định nghĩa INLINE (~dòng 175): `sender, receiver, content, images[], post, isRead, timestamp`.
  - File `backend/models/Message.js` là một schema KHÁC (`text` thay vì `content`, không có `isRead/post/images`) và không ai import → dễ nhầm.
  - Route: `GET /api/messages/conversations/:userId`, `GET /api/messages/unread-count/:userId`, `GET /api/messages/:user1/:user2`, `POST /api/messages` (multer `upload.single('image')`), `PUT /api/messages/mark-read`, `GET /api/messages/clear-all`.
  - Socket.io: có **HAI** khối `io.on('connection')` (~dòng 2027 và ~2341). `sendNotification()` (~dòng 220) phát `new_notification` tới socket của người nhận.
- Người dùng có thể vừa là người mua vừa là người bán (một tài khoản có `isSeller`, `sellerStatus`, `shopInfo`). Sản phẩm có `author`/`sellerId` trỏ tới người bán.
- Đơn hàng B2C: `Order` có `buyer/buyerId`, `seller/sellerId`, `status`, `items`. `GET /api/seller/orders` populate `buyer` với `name email phone address avatar`.

## QUY TẮC VÀNG

1. **Verify trước khi sửa**: mở đúng file, xác nhận lỗi còn tồn tại; không còn → ghi "KHÔNG TỒN TẠI" + bằng chứng. Code thực tế thắng mô tả trong prompt này.
2. Mỗi lỗi/tính năng nhỏ = 1 commit (`fix(chat-3): ...`, `feat(seller-chat): ...`). Không refactor lan man, không đổi format hàng loạt.
3. **Không phá luồng đang chạy**: trang `/chat` của người mua và nút "Chat với người bán" ở trang sản phẩm phải chạy y như cũ (hoặc tốt hơn). Trước khi đổi/xóa API hay tên sự kiện socket, `grep` toàn bộ `frontend/src`, `admin/` và sửa luôn nơi dùng.
4. Mọi route tin nhắn **bắt buộc JWT**; `senderId`/`userId` luôn lấy từ token, KHÔNG nhận từ body/URL. Không in secret/token ra log.
5. UI người bán dùng đúng phong cách `SellerLayout` (Tailwind + Font Awesome `fas`, màu cam `orange-500/600`, nền `slate`, bo góc `rounded-xl/2xl`). UI người mua (`ChatPage`) giữ phong cách hiện tại (vàng `#FACC15`, cam `#EA580C`).
6. Mọi chuỗi hiển thị cho người dùng bằng **tiếng Việt**.
7. Viết test cho phần backend (Jest + supertest + `mongodb-memory-server`, hoặc dùng setup test sẵn có nếu đã có) và kiểm thử thủ công phần UI; ghi kết quả vào `docs/FIX_LOG_CHAT.md`.
8. Không chạy lệnh phá hủy (không `git push --force`, không xóa DB). Không chạm file `.env`; biến môi trường mới chỉ thêm vào `.env.example`.
9. Xong mỗi PHASE: chạy test + `npm run build` (frontend) + khởi động backend thử, rồi dừng báo cáo.

---

# PHẦN A – SỬA LỖI HỆ THỐNG CHAT HIỆN CÓ

### A0. Thống nhất model Message (nền móng)
- Chỉ giữ **một** định nghĩa. Viết lại `backend/models/Message.js` làm nguồn duy nhất, `server.js` `require` nó và XÓA định nghĩa inline.
- Schema mới:
  ```js
  {
    sender:   { type: ObjectId, ref: 'User', required: true, index: true },
    receiver: { type: ObjectId, ref: 'User', required: true, index: true },
    content:  { type: String, default: '', maxlength: 2000, trim: true },
    images:   [String],                       // tối đa 4
    post:     { type: ObjectId, ref: 'Post' },   // sản phẩm đang hỏi (tùy chọn)
    order:    { type: ObjectId, ref: 'Order' },  // đơn hàng liên quan (tùy chọn)
    sellerId: { type: ObjectId, ref: 'User', index: true }, // phía "cửa hàng" của hội thoại (xem B1)
    isRead:   { type: Boolean, default: false },
    readAt:   Date
  }, { timestamps: true }   // createdAt/updatedAt thay cho field "timestamp"
  ```
- Index: `{sender:1, receiver:1, createdAt:-1}`, `{receiver:1, isRead:1}`, `{sellerId:1, createdAt:-1}`.
- **Tương thích dữ liệu cũ**: tài liệu cũ có `timestamp` (không có `createdAt`). Viết `backend/scripts/migrate-messages.js` (KHÔNG tự chạy): với mỗi message thiếu `createdAt` thì `createdAt = timestamp`; chuỗi `$set` bằng `updateMany` pipeline. Mọi code đọc phải dùng `createdAt` (và fallback `timestamp` ở frontend `m.createdAt || m.timestamp`). Cập nhật cả `admin/` nếu có dùng Message (chat với admin).
- Test: tạo message → đủ field, `createdAt` có giá trị.

### A1. LỖI: hai khối `io.on('connection')` → tin nhắn hiện 2 lần
- Hiện tượng: mỗi `sendMessage` kích hoạt cả hai handler ⇒ người nhận nhận **2 sự kiện `getMessage`** (định dạng khác nhau), `getUsers` cũng bị phát 2 lần; `updateInbox` chỉ có ở handler 1.
- Sửa: gom về **MỘT** module `backend/socket/index.js` (khởi tạo từ `server.js`). Thiết kế:
  - `io.use(authMiddleware)`: đọc `socket.handshake.auth.token`, verify JWT (cùng secret với `protect`), nạp user, từ chối nếu banned/locked/deleted; gán `socket.data.userId`.
  - Khi kết nối: `socket.join('user:' + userId)`. Theo dõi hiện diện bằng `Map<userId, Set<socketId>>` (hỗ trợ nhiều tab); phát `presence:update` {userId, online} chỉ cho những người liên quan (hoặc phát danh sách userId online, KHÔNG gửi socketId).
  - Cập nhật `lastActive` khi socket cuối cùng của user ngắt.
  - **Bỏ hẳn sự kiện client→server `addUser` và `sendMessage`** (xem A2). Server phát sự kiện sau khi lưu DB.
- Giữ tạm tên sự kiện cũ nếu cần tương thích (`getMessage`, `getUsers`, `updateInbox`) nhưng chỉ phát **một lần**; ưu tiên đổi sang tên mới `message:new`, `inbox:update`, `presence:update` và sửa mọi client (`ChatPage`, `InboxPage`, `FloatingAdminChat` – grep `socket.on(` / `io(` toàn frontend).
- Test: kết nối 1 client giả (socket.io-client) với token → gửi message qua REST → client nhận ĐÚNG 1 sự kiện `message:new`.

### A2. LỖI BẢO MẬT: socket không xác thực, tin nhắn có thể giả mạo
- Hiện tại ai cũng `emit('addUser', <id nạn nhân>)` để nghe lén tin của người đó và `emit('sendMessage', {senderId: <ai đó>})` để giả danh.
- Đã xử lý bằng A1 (xác thực JWT lúc handshake, join room theo user từ token, server là bên duy nhất phát tin sau khi lưu). Test: client không token → bị từ chối; client token A không nhận được tin của B.

### A3. LỖI: REST tin nhắn không cần đăng nhập (chồng với C6 của báo cáo bảo mật)
- Tạo `backend/routes/messages.js` (router) và mount `/api/messages`; xóa các route cũ trong `server.js`. **Tất cả dùng `protect` (JWT)**:
  - `GET  /api/messages/conversations?as=all|seller|buyer&page=1&limit=30&unread=1&q=` → danh sách hội thoại của **user trong token**. Dùng aggregation: sort `createdAt` giảm dần, `$group` theo "người còn lại", lấy `lastMessage`, `unreadCount` (`receiver=me, isRead=false`), populate `otherUser` (CHỈ `name avatar verified badge lastActive` – không lộ email/phone). Phân trang; KHÔNG nuốt lỗi bằng `res.status(200).json([])` – trả 500 có message.
  - `GET  /api/messages/thread/:otherId?before=<createdAt|_id>&limit=30` → tin của cuộc hội thoại giữa tôi và `otherId` (cũ → mới), populate `post` (`title price images image author`) và `order` (`_id status`). Validate `otherId` là ObjectId hợp lệ.
  - `POST /api/messages` (multer qua `middleware/upload.js`: ≤5MB, chỉ ảnh, tối đa 4 ảnh): body `receiverId, content, postId?, orderId?`. `sender = req.user._id`. Validate: receiver tồn tại, không phải chính mình, không bị khóa/xóa; `content` ≤ 2000 ký tự và phải có content hoặc ảnh hoặc post; `postId/orderId` hợp lệ. Rate limit (vd 30 tin/phút/user). Lưu → tính `sellerId` (xem B1) → phát socket tới room `user:<receiver>` (`message:new` + `inbox:update`) và room `user:<sender>` (để tab khác của mình cũng thấy) → gửi thông báo (A7) → trả message đã populate.
  - `PUT  /api/messages/read/:otherId` → đánh dấu đã đọc mọi tin của `otherId` gửi cho tôi (`isRead:true, readAt`), phát `messages:read` cho `otherId` (để hiện "Đã xem"), phát `inbox:update` cho tôi.
  - `GET  /api/messages/unread-count?as=all|seller|buyer` → `{count}` (từ token).
  - Giữ **alias tương thích** các URL cũ (`/conversations/:userId`, `/unread-count/:userId`, `/:user1/:user2`, `/mark-read`) trỏ vào logic mới nhưng BỎ QUA userId trên URL/body, dùng token – để các nơi chưa kịp sửa không vỡ. Đánh dấu `// DEPRECATED` và liệt kê trong FIX_LOG.
  - **XÓA** `GET /api/messages/clear-all`.
- Test: không token → 401; A không đọc được thread của B–C; `senderId` giả trong body bị bỏ qua.

### A4. LỖI: `InboxPage` trắng trang / crash
- `InboxPage.js` render `{conv.lastMessage}` (là cả object message) → React báo "Objects are not valid as a React child". Sửa hiển thị `conv.lastMessage.content || (images?.length ? '📷 Hình ảnh' : conv.lastMessage.post ? '📦 Sản phẩm' : '')` và thời gian lấy `lastMessage.createdAt`. Cập nhật lắng nghe `inbox:update`, dùng token JWT (qua `axiosClient`).

### A5. LỖI: mở hội thoại không đánh dấu đã đọc
- `ChatPage.handleSelectConversation` chỉ đặt `unreadCount:0` ở state cục bộ, KHÔNG gọi API ⇒ tải lại trang số chưa đọc quay lại, badge ở header vẫn còn. Sửa: sau khi tải thread, gọi `PUT /api/messages/read/:otherId` rồi `window.dispatchEvent(new Event('messageUpdated'))`. Cũng gọi khi đang mở đúng hội thoại và nhận tin mới (đã có – giữ, chuyển sang API mới).

### A6. LỖI giao diện/logic nhỏ trong `ChatPage`
1. `fetchInboxList` luôn `setLoading(true)` ⇒ mỗi tin mới làm danh sách nháy spinner. Chỉ hiện spinner ở lần tải đầu; các lần sau làm mới "im lặng".
2. `handleImageUpload` sửa trực tiếp phần tử cuối của mảng state (`newArr[newArr.length-1].status = ...`) – sai khi có tin khác chen vào. Dùng id tạm (`clientId`) để thay đúng tin; cũng `URL.revokeObjectURL` ảnh tạm.
3. Tin gửi tạm (optimistic) khi gọi API lỗi vẫn hiển thị "Đã gửi". Thêm trạng thái `failed` + nút "Gửi lại".
4. `catch (error) { console.error("Lỗi gửi tin nhắn"); }` nuốt lỗi, người dùng không biết ⇒ `toast.error`.
5. Tin nhận qua socket không có `_id/createdAt` thật ⇒ trùng lặp khi tải lại. Dùng đúng object server trả; khử trùng theo `_id`.
6. Ô tìm kiếm chỉ lọc client trong danh sách đã tải; khi phân trang thì phải gọi `?q=` lên server.
7. Phân loại tab "Mua / Bán" dựa vào `lastMessage.post.author` ⇒ hội thoại không gắn sản phẩm không thuộc tab nào. Dùng `sellerId` của hội thoại (xem B1): `sellerId === me` ⇒ "Bán", ngược lại ⇒ "Mua".
8. Người dùng bấm "Chat" ở sản phẩm **của chính mình** ⇒ tự nhắn với chính mình. Chặn ở `ProductDetailPage` (ẩn/vô hiệu nút) và ở server (A3).
9. Cuộn xuống cuối khi mở thread và khi có tin mới (hiện chỉ cuộn khi gửi). Chỉ tự cuộn khi người dùng đang ở gần cuối.
10. Thông báo khi `post.author` không phải object (chưa populate) ⇒ `ProductDetailPage` phải truyền `receiver` có `_id, name, avatar`.

### A7. Thông báo tin nhắn
- Hiện mỗi tin tạo 1 `Notification` loại `MESSAGE` với link `/chat` ⇒ spam. Gộp: nếu người nhận đã có thông báo `MESSAGE` chưa đọc từ cùng người gửi trong 10 phút thì **cập nhật** nội dung/time thay vì tạo mới.
- Link theo ngữ cảnh: nếu người nhận là `sellerId` của hội thoại ⇒ `/seller-channel/messages?with=<senderId>`; ngược lại ⇒ `/chat?with=<senderId>`. Cả hai trang đọc query `with` để mở sẵn hội thoại.
- Nội dung thông báo không cắt giữa ký tự (hiện `substring(0,30)+"..."` luôn thêm "..." dù chuỗi ngắn).

---

# PHẦN B – TRANG TIN NHẮN CHO NGƯỜI BÁN

Mục tiêu: người bán vào **Kênh Người Bán → Tin nhắn** thấy mọi khách đã nhắn cho shop, trả lời thời gian thực, xem ngữ cảnh (sản phẩm đang hỏi, đơn hàng của khách), dùng mẫu trả lời nhanh, và có thể nhắn người mua từ trang đơn hàng.

### B1. Xác định "hội thoại thuộc shop" (`sellerId`)
Vì một tài khoản có thể vừa mua vừa bán, mỗi message mang `sellerId` (phía cửa hàng):
- Khi lưu message: nếu có `post` ⇒ `sellerId = post.author/sellerId`; nếu có `order` ⇒ `order.sellerId`; nếu không có cả hai ⇒ kế thừa `sellerId` của tin gần nhất giữa hai người; nếu vẫn không có thì ⇒ nếu người nhận là seller đã duyệt thì `sellerId = người nhận`, nếu người gửi là seller đã duyệt thì `sellerId = người gửi` (ưu tiên người nhận), còn lại `null`.
- Hộp thư người bán = hội thoại có `sellerId == me`. Tab "Mua" của `/chat` = hội thoại có `sellerId != me`.
- Migration cho dữ liệu cũ: script `backend/scripts/backfill-message-seller.js` (KHÔNG tự chạy) gán `sellerId` theo `post.author` rồi theo seller đã duyệt.
- **Quy tắc chống spam**: người bán chỉ được **chủ động mở** hội thoại với người mua khi (a) đã có hội thoại trước đó, hoặc (b) hai bên có đơn hàng với nhau (`orderId` hợp lệ thuộc shop này và buyer đó). Người mua nhắn shop thì không bị giới hạn (ngoài rate limit). Trả 403 kèm thông báo tiếng Việt rõ ràng.

### B2. Tái sử dụng code – không viết hai bản chat
- Tách logic ra hook `frontend/src/hooks/useChat.js`: kết nối socket (JWT qua `auth: {token}`), quản lý danh sách hội thoại (phân trang), thread đang mở (tải thêm khi cuộn lên), gửi tin (optimistic + failed/retry), đánh dấu đã đọc, trạng thái online, "đang nhập…" (sự kiện `typing` tùy chọn, throttle 2s), khử trùng tin, và phát `messageUpdated`. Tham số: `{ scope: 'buyer' | 'seller' }` → truyền vào `as=`.
- Tách UI dùng chung vào `frontend/src/components/chat/` (`ConversationList.jsx`, `MessageThread.jsx`, `MessageInput.jsx`, `ProductContextCard.jsx`, v.v.) nhận `theme` ('buyer' | 'seller') để đổi màu.
- `ChatPage.js` (người mua) refactor để dùng hook + component dùng chung nhưng **giữ giao diện hiện tại** (không làm vỡ). Nếu refactor rủi ro quá lớn: chỉ dùng chung `useChat` và giữ JSX cũ, ghi rõ lý do trong FIX_LOG.

### B3. Trang `SellerMessages`
Tạo `frontend/src/pages/seller/SellerMessages.js`, thêm route trong `App.js`:
`<Route path="messages" element={<SellerMessages />} />` bên trong `/seller-channel`.

Bố cục 3 cột (desktop), 1 cột có chuyển màn hình (mobile < 768px):
1. **Cột trái – danh sách khách** (320px): ô tìm kiếm (tên khách / tên sản phẩm), bộ lọc `Tất cả | Chưa đọc | Chưa trả lời | Có đơn hàng`, mỗi dòng: avatar + chấm online, tên, thời gian ("Vừa xong / 5 phút / 14/11"), dòng cuối (tiền tố "Bạn: " nếu mình gửi; `📷 Hình ảnh`, `📦 Sản phẩm` khi không có chữ), tên sản phẩm đang hỏi, badge số chưa đọc. "Chưa trả lời" = tin cuối là của khách.
2. **Cột giữa – khung chat**: header (tên khách, online/"Hoạt động X phút trước", nút xem hồ sơ), thẻ sản phẩm đang hỏi (có nút "Xem sản phẩm"), danh sách tin có phân cách ngày, nhóm tin liên tiếp, trạng thái "Đã gửi / Đã xem", tải thêm khi cuộn lên, ô nhập (Enter gửi, Shift+Enter xuống dòng), nút ảnh (tối đa 4, xem trước, xóa), emoji, nút **Mẫu trả lời nhanh** (B4), nút **Gửi thẻ sản phẩm** (chọn từ sản phẩm của shop, gọi `GET /api/seller/products`).
3. **Cột phải – thông tin người mua** (ẩn dưới 1280px, mở bằng nút "Thông tin"): tên, avatar, ngày tham gia, số đơn đã mua ở shop này, tổng giá trị, 5 đơn gần nhất (mã rút gọn 8 ký tự, trạng thái dạng badge, tổng tiền, link `/seller-channel/orders?search=<id>`), nút "Xem hồ sơ công khai". Endpoint mới `GET /api/seller/buyers/:buyerId/summary` (`protect` + `isSeller`): CHỈ trả dữ liệu của buyer **có quan hệ** với shop (đã nhắn hoặc có đơn), KHÔNG trả email/SĐT/địa chỉ đầy đủ trừ khi có đơn đang xử lý với shop (khi đó trả tên người nhận + SĐT như trang đơn hàng hiện có).
- Trạng thái rỗng: "Chưa có khách nào nhắn tin cho shop" kèm gợi ý. Trạng thái lỗi/đang tải rõ ràng. Hỗ trợ query `?with=<userId>` và `location.state.receiver/order` để mở sẵn hội thoại.
- Truy cập: chỉ seller đã duyệt (đã có `SellerProtectedRoute`).

### B4. Mẫu trả lời nhanh (quick replies)
- Lưu trong `User.shopInfo.quickReplies: [{ _id, title, content }]`, tối đa 20 mẫu, `title` ≤ 40, `content` ≤ 500.
- API (`protect` + `isSeller`): `GET/POST/PUT/DELETE /api/seller/quick-replies`. Validate độ dài, không trùng title.
- Mặc định gợi ý khi shop chưa có mẫu nào (hiển thị như gợi ý, người bán bấm "Thêm vào mẫu của tôi"): "Chào bạn, shop còn hàng ạ", "Sản phẩm này shop bảo hành 7 ngày", "Shop giao hàng trong 1–2 ngày làm việc", "Cảm ơn bạn đã quan tâm!".
- UI: popover trong ô nhập (bấm mẫu → điền vào ô nhập, chưa gửi), và mục quản lý mẫu (thêm/sửa/xóa) ngay trong popover hoặc modal nhỏ.
- Hỗ trợ biến `{ten_khach}` thay bằng tên khách khi chèn.

### B5. Điều hướng & huy hiệu chưa đọc
- `SellerLayout.js`: thêm vào `navItems` mục `{ path: '/seller-channel/messages', icon: 'fas fa-comments', label: 'Tin nhắn khách hàng' }` + **badge số chưa đọc** (hook nhẹ `useUnreadMessages('seller')` gọi `GET /api/messages/unread-count?as=seller`, cập nhật theo `inbox:update`/`messageUpdated`; hiển thị `99+`; khi sidebar thu gọn thì badge là chấm nhỏ trên icon). Thêm cả biểu tượng chuông/chat ở topbar có badge.
- `SellerOrders.js`: mỗi thẻ đơn thêm nút **"Nhắn người mua"** → `navigate('/seller-channel/messages', { state: { receiver: order.buyer, order: { _id: order._id } } })` (đảm bảo `order.buyer` có `_id, name, avatar`).
- `SellerDashboard.js`: thêm thẻ "Tin nhắn chưa đọc" (đếm) và "Tỷ lệ phản hồi" (dùng `responseRate` đã có ở `GET /api/users/public-profile/:id` hoặc tính ở `/api/seller/dashboard`) kèm link tới trang tin nhắn.
- Ở `App.js`: **ẩn** `FloatingAdminChat` và `FloatingAIChat` khi đường dẫn bắt đầu bằng `/seller-channel/messages` (dùng `useLocation`; vì hiện hai widget luôn nổi chồng lên ô nhập). Ở các trang khác của kênh người bán, vẫn hiển thị nhưng không che nút hành động.
- Thông báo chuông (`Notification` loại `MESSAGE`) bấm vào ⇒ theo link ở A7.

### B6. Hiệu năng, bảo mật, chất lượng
- Escape/hiển thị nội dung tin nhắn dạng **text thuần** (React đã escape; KHÔNG dùng `dangerouslySetInnerHTML`); link tự nhận dạng chỉ cho `http(s)` và mở `rel="noopener noreferrer" target="_blank"`.
- Ảnh tin nhắn: lấy qua `getImageUrl` thống nhất (tạo helper chung `utils/imageUrl.js`, dùng cả cho ChatPage/Seller*) – KHÔNG dùng `via.placeholder.com`.
- Giới hạn: 30 tin/phút/user, ≤ 2000 ký tự, ≤ 4 ảnh/tin, ảnh ≤ 5MB.
- Chặn người dùng: tối thiểu thêm `POST /api/messages/block/:userId` & kiểm tra khi gửi (tùy chọn nếu còn thời gian; nếu bỏ qua ghi vào "Chưa làm").
- Accessibility cơ bản: nút có `aria-label`, danh sách điều hướng được bằng bàn phím, focus vào ô nhập khi mở hội thoại.

---

# PHẦN C – LỖI VẶT Ở TRANG NGƯỜI BÁN

Với mỗi mục: verify → sửa nhỏ → commit riêng.

**C1. `SellerProtectedRoute.js`**
- Đọc `localStorage` một lần bằng `useMemo(…, [])` ⇒ sau khi Admin duyệt/từ chối seller, người dùng vẫn thấy trạng thái cũ cho tới khi đăng nhập lại. Dùng `useAuth()` (AuthContext) và làm mới hồ sơ từ server khi vào kênh (`GET /api/users/profile` bằng JWT), hiện màn hình "Đang kiểm tra quyền…" trong lúc chờ.
- Gọi `toast.info/warning` **ngay trong lúc render** (side-effect trong render ⇒ toast lặp, cảnh báo React). Chuyển vào `useEffect` hoặc truyền thông báo qua `Navigate state`.

**C2. `SellerLayout.js`**
- Chip "Seller Đã Duyệt" gắn cứng; hiển thị theo `user.sellerStatus` thật.
- Số dư ví lấy từ `user.walletBalance` trong localStorage ⇒ cũ. Lấy từ API (`GET /api/haipay/me` hoặc `/api/users/profile`) khi mount và sau sự kiện thanh toán; có trạng thái loading.
- Sidebar cố định `w-64`, không dùng được trên mobile: dưới `md` biến thành drawer (nút menu ở topbar, overlay đóng khi bấm ra ngoài / đổi route).
- Menu hiện đang trỏ `/seller-channel/products/create` ở hai nơi (sidebar + topbar) – ổn, nhưng thêm `end` đúng cho mục "Quản lý sản phẩm" để không sáng cùng lúc với "Đăng sản phẩm".

**C3. `SellerDashboard.js`**
- Chữ "Đã trừ 5% phí sàn" gắn cứng; lấy `commissionRate` từ `GET /api/seller/dashboard` (thêm field `commissionRate` vào response, đọc bằng `getPlatformFeePercent()`), hiển thị `Đã trừ {rate}% phí sàn`.
- `useEffect(..., [toast])` phụ thuộc vào `toast`; hiện `toast` ổn định "do tình cờ" (xem C6). Đổi deps thành `[]` + `// eslint-disable-next-line` có chú thích, hoặc đảm bảo C6.
- Hai request chạy chung `Promise.all`: một cái lỗi là mất cả trang. Dùng `Promise.allSettled` và hiển thị phần còn lại.

**C4. `SellerOrders.js`**
- `handleOpenShippingModal` điền sẵn mã vận đơn **giả** `'HH' + random` ⇒ người bán có thể bấm "Đã giao" với mã bịa. Bỏ giá trị mặc định ngẫu nhiên; để trống và bắt nhập (kiểm tra độ dài tối thiểu 6, chỉ chữ-số).  Nếu đơn đi qua GHN (đã có `shippingCode` từ `/prepare`) thì chỉ cho xem, không cho sửa.
- Danh sách `CARRIERS` (GHTK, Viettel Post, J&T…) không khớp với backend (đang dùng GHN) ⇒ chỉ cho chọn GHN, hoặc ghi chú "giao thủ công" rõ ràng khi chọn hãng khác.
- Hủy đơn dùng `window.prompt` ⇒ thay bằng modal trong app (cùng phong cách modal vận chuyển) có chọn nhanh lý do (Hết hàng, Sai thông tin, Khách yêu cầu, Khác).
- `getImageUrl` dùng `https://via.placeholder.com/80` (dịch vụ không còn ổn định) ⇒ ảnh vỡ; dùng helper chung `utils/imageUrl.js` với placeholder nội bộ (SVG inline/`/public`). Sửa tương tự trong `SellerProducts.js` (`/150`).
- Đếm số lượng ở mỗi tab (`orders.filter(...)` trong `.map`) chạy lại mỗi lần render ⇒ tính một lần bằng `useMemo`.
- Nút "Đã giao" / "Hoàn thành" do người bán bấm (xem báo cáo H6): giữ như hiện trạng nếu prompt bảo mật chưa đổi, nhưng bắt buộc có `confirm`.
- Không có phân trang: danh sách đơn tải hết. Thêm phân trang phía client (10–20/ trang) hoặc `?page&limit` phía server.

**C5. `SellerAddEditProduct.js`**
- Chỉ kiểm tra giá > 0 và tồn kho ≥ 0 của sản phẩm gốc; **biến thể** nhận `Number(e.target.value)` ⇒ ô rỗng thành `0`, chữ thành `NaN`, số âm/thập phân vẫn gửi lên. Validate khi submit: tên biến thể bắt buộc & không trùng, `price ≥ 1000` số nguyên, `stock ≥ 0` số nguyên; chỉ ra đúng dòng lỗi.
- `stockQuantity` chấp nhận số thập phân (`1.5`) ⇒ ép `Math.floor`/chặn ở input (`step=1`, `min=0`) và server.
- Form chỉnh sửa tải trạng thái `status` rồi gửi lại (xem H3 – người bán không được tự đổi trạng thái duyệt): ẩn trường này khỏi form hoặc đổi thành nút "Ẩn/Hiện sản phẩm" riêng.
- Có preview ảnh nhưng không `URL.revokeObjectURL` khi gỡ ảnh/rời trang (rò bộ nhớ). Thêm cleanup.
- Chặn gửi 2 lần: nút Lưu phải `disabled` khi đang gửi.

**C6. `components/Toast.js`**
- `const toast = useCallback({ success…, error… }, [addToast])` dùng sai API (truyền object cho `useCallback`) – chạy được vì tình cờ trả lại chính object đó. Đổi thành `useMemo(() => ({ … }), [addToast])`.

**C7. Vệ sinh nhỏ**
- Xóa `backend/models/Message.js` cũ nếu đã thay bằng bản mới ở A0 (không để hai định nghĩa).
- Các toast gọi `toast.error(<chuỗi dài>)` một đối số thì chuỗi vào `title`: thống nhất `toast.error(title, message)` cho đẹp (không bắt buộc, chỉ sửa ở các file seller đã đụng tới).

---

## TIÊU CHÍ HOÀN THÀNH

**Chat (A):**
- [ ] Gửi 1 tin ⇒ người nhận thấy **đúng 1** bản; mở nhiều tab vẫn đúng.
- [ ] Không token ⇒ socket và REST tin nhắn đều bị từ chối; không thể giả `senderId`.
- [ ] `/inbox` không crash; mở hội thoại ở `/chat` làm số chưa đọc về 0 và giữ nguyên sau khi tải lại trang.
- [ ] Không còn spinner nháy khi có tin mới; ảnh gửi hiển thị đúng bong bóng; tin lỗi có nút gửi lại.

**Người bán (B):**
- [ ] Mục "Tin nhắn khách hàng" trong sidebar có badge chưa đọc thời gian thực.
- [ ] Người mua nhắn từ trang sản phẩm ⇒ hội thoại hiện ngay trong hộp thư người bán (không cần F5); người bán trả lời ⇒ người mua thấy ngay ở `/chat`.
- [ ] Nút "Nhắn người mua" ở `SellerOrders` mở đúng hội thoại, gắn đơn hàng.
- [ ] Mẫu trả lời nhanh thêm/sửa/xóa/chèn được; tối đa 20.
- [ ] Người bán không thể nhắn người lạ chưa có hội thoại/đơn (403 tiếng Việt).
- [ ] Giao diện dùng được trên mobile (list ↔ chat chuyển màn hình), widget nổi không che ô nhập.
- [ ] Người dùng vừa mua vừa bán: tin "khách hỏi shop" chỉ ở hộp thư người bán, tin "mình hỏi shop khác" chỉ ở tab Mua của `/chat`.

**Lỗi vặt (C):** mỗi mục C1–C7 có trạng thái trong `docs/FIX_LOG_CHAT.md`.

**Chung:** test backend xanh; `npm run build` frontend không lỗi/cảnh báo mới; không còn `via.placeholder.com`; `grep -rn "addUser\|'sendMessage'" frontend/src backend` chỉ còn trong code đã được cố ý giữ tương thích (có chú thích).

## QUY TRÌNH

0. `git checkout -b feature/seller-messaging`; tạo `docs/FIX_LOG_CHAT.md`.
1. PHASE A (A0 → A7) ⇒ test ⇒ dừng báo cáo.
2. PHASE B1–B3 (backend + trang) ⇒ dừng báo cáo kèm ảnh chụp màn hình (Playwright nếu có) hoặc mô tả.
3. PHASE B4–B6 ⇒ dừng báo cáo.
4. PHASE C ⇒ báo cáo cuối.

## ĐẦU RA CUỐI CÙNG (bắt buộc)

1. Danh sách commit theo ID (A0…C7).
2. Bảng ID | Trạng thái (ĐÃ SỬA / KHÔNG TỒN TẠI / BỎ QUA + lý do) | File đổi | Cách kiểm chứng.
3. Danh sách route/sự kiện socket **mới** và **bị đổi tên/đã deprecated** (để tôi biết chỗ nào cần cập nhật).
4. Việc con người phải làm: chạy `migrate-messages.js` và `backfill-message-seller.js` (kèm lệnh), cấu hình biến môi trường mới (nếu có), kiểm tra CORS/socket origin trên môi trường thật.
5. Quyết định cần tôi xác nhận (vd: quy tắc "seller chỉ nhắn khách đã có hội thoại/đơn", giới hạn 30 tin/phút).
6. Phát hiện thêm và mục "Chưa làm" (kèm lý do).

Nếu code thực tế khác mô tả (vd. đã có `protectStrict`, đã đổi cấu trúc), **code thực tế thắng** – ghi lại khác biệt rồi điều chỉnh cách làm cho phù hợp, đừng ép theo prompt.
