# NHẬT KÝ SỬA LỖI BẢO MẬT & LOGIC – HAIHAND MARKETPLACE

Nhánh thực hiện: `fix/security-and-logic-audit`

## Bảng theo dõi từng hạng mục

| ID | Trạng thái | File đã đổi | Test đã thêm / chạy | Ghi chú |
|---|---|---|---|---|
| 0.1 | ĐÃ SỬA | Xóa các file `*-LAPTOP-G2N88BOO*` và các file nháp (`backend/extract_routes.js`, `backend/test_upload.js`, `backend/test_chatbot.js`, `frontend/scratch_screen.html`, `frontend/src/pages/fix_url.py`, `frontend/src/pages/gen_edit.py`) | `git grep` xác nhận không có module nào import | Dọn sạch file xung đột đồng bộ và file nháp |
| 0.2 | ĐÃ SỬA | `backend/config/env.js`, `backend/.env.example` | Test fail-fast khi thiếu biến môi trường (`backend/phase0_infra.test.js`) | Kiểm tra bắt buộc `MONGO_URI`, `JWT_SECRET`, `SESSION_SECRET`, `CLOUDINARY_*`, `VNPAY_*`, `GHN_WEBHOOK_TOKEN`, `CORS_ORIGINS`, `FIREBASE_*`; `.env.example` để giá trị rỗng |
